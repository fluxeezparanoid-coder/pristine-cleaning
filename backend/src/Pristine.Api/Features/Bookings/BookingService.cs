using System.Data;
using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Npgsql;
using Pristine.Api.Common;
using Pristine.Api.Data;
using Pristine.Api.Domain;
using Pristine.Api.Features.Audit;
using Pristine.Api.Features.Pricing;
using Pristine.Api.Features.Scheduling;

namespace Pristine.Api.Features.Bookings;

public interface IBookingService
{
    Task<BookingDto> CreateAsync(CreateBookingRequest request, Actor actor, CancellationToken ct);
    Task<PagedResult<BookingDto>> ListAsync(BookingQuery query, Actor actor, CancellationToken ct);
    Task<BookingDto> GetAsync(Guid id, Actor actor, CancellationToken ct);
    Task<BookingDto> CancelAsync(Guid id, CancelBookingRequest request, Actor actor, CancellationToken ct);
    Task<BookingDto> RescheduleAsync(Guid id, RescheduleBookingRequest request, Actor actor, CancellationToken ct);
    Task<BookingDto> UpdateStatusAsync(Guid id, UpdateBookingStatusRequest request, Actor actor, CancellationToken ct);
    Task<BookingDto> AssignCleanerAsync(Guid id, AssignCleanerRequest request, Actor actor, CancellationToken ct);
}

public sealed class BookingService(
    AppDbContext db,
    IPricingService pricing,
    IAvailabilityService availability,
    IAuditService audit,
    IOptions<SchedulingOptions> scheduling,
    TimeProvider clock) : IBookingService
{
    private const string ReferenceAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I ambiguity
    private DateTime Now => clock.GetUtcNow().UtcDateTime;

    public async Task<BookingDto> CreateAsync(CreateBookingRequest request, Actor actor, CancellationToken ct)
    {
        if (actor.Role != UserRole.Customer)
            throw new ForbiddenException("Only customer accounts can place bookings.");

        var quote = await pricing.CalculateAsync(
            new QuoteRequest(request.ServiceId, request.Bedrooms, request.Bathrooms, request.Frequency, request.ExtraIds), ct);

        var startUtc = DateTime.SpecifyKind(request.StartUtc.ToUniversalTime(), DateTimeKind.Utc);
        availability.EnsureBookable(startUtc, quote.Dto.DurationMinutes);
        var endUtc = startUtc.AddMinutes(quote.Dto.DurationMinutes);

        // Serializable isolation makes "check the cleaner is free, then insert" atomic,
        // so two customers racing for the last slot can never double-book a cleaner.
        try
        {
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);

            var cleanerId = await availability.FindFreeCleanerAsync(startUtc, endUtc, null, ct)
                            ?? throw new ConflictException("Sorry, that time slot was just taken. Please choose another one.");

            var booking = new Booking
            {
                Reference = await GenerateReferenceAsync(ct),
                CustomerId = actor.UserId,
                CleanerId = cleanerId,
                ServiceId = quote.Service.Id,
                StartUtc = startUtc,
                EndUtc = endUtc,
                Bedrooms = request.Bedrooms,
                Bathrooms = request.Bathrooms,
                Frequency = request.Frequency,
                Street = request.Address.Street.Trim(),
                City = request.Address.City.Trim(),
                PostalCode = request.Address.PostalCode.Trim().ToUpperInvariant(),
                AccessNotes = string.IsNullOrWhiteSpace(request.AccessNotes) ? null : request.AccessNotes.Trim(),
                Status = BookingStatus.Confirmed,
                Subtotal = quote.Dto.Subtotal,
                Discount = quote.Dto.Discount,
                Total = quote.Dto.Total,
                CreatedAtUtc = Now,
                UpdatedAtUtc = Now,
                Extras = quote.Extras.Select(e => new BookingExtra
                {
                    ExtraId = e.Id, Name = e.Name, Price = e.Price, Minutes = e.Minutes
                }).ToList()
            };

            db.Bookings.Add(booking);
            audit.Record(AuditActions.BookingCreated, actor.UserId, entityType: nameof(Booking),
                entityId: booking.Id.ToString(), details: $"{booking.Reference} · {quote.Service.Name} · {booking.Total:0.00}");
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);

            return await GetAsync(booking.Id, actor, ct);
        }
        catch (Exception ex) when (IsSerializationFailure(ex))
        {
            throw new ConflictException("Sorry, that time slot was just taken. Please choose another one.");
        }
    }

    public async Task<PagedResult<BookingDto>> ListAsync(BookingQuery query, Actor actor, CancellationToken ct)
    {
        var (page, pageSize) = Paging.Normalize(query.Page, query.PageSize);
        var q = Scoped(actor);

        if (query.Status is { } status) q = q.Where(b => b.Status == status);
        if (query.FromUtc is { } from) q = q.Where(b => b.StartUtc >= from.ToUniversalTime());
        if (query.ToUtc is { } to) q = q.Where(b => b.StartUtc <= to.ToUniversalTime());
        if (query.Upcoming is true) q = q.Where(b => b.EndUtc >= Now && b.Status != BookingStatus.Cancelled);
        if (query.Upcoming is false) q = q.Where(b => b.EndUtc < Now || b.Status == BookingStatus.Cancelled);

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            // EF Core parameterizes this value; user input is never concatenated into SQL.
            var term = query.Search.Trim().ToLower();
            q = q.Where(b => b.Reference.ToLower().Contains(term)
                             || b.Customer.FullName.ToLower().Contains(term)
                             || b.Customer.Email.Contains(term)
                             || b.City.ToLower().Contains(term));
        }

        var total = await q.CountAsync(ct);
        q = query.Upcoming is true ? q.OrderBy(b => b.StartUtc) : q.OrderByDescending(b => b.StartUtc);

        var items = await WithDetails(q).AsNoTracking()
            .Skip((page - 1) * pageSize).Take(pageSize)
            .ToListAsync(ct);

        return new PagedResult<BookingDto>(items.Select(b => ToDto(b, actor)).ToList(), page, pageSize, total);
    }

    public async Task<BookingDto> GetAsync(Guid id, Actor actor, CancellationToken ct)
    {
        // Scoping the query (instead of loading then checking) means another user's booking
        // is indistinguishable from a missing one: no IDOR, no existence oracle.
        var booking = await WithDetails(Scoped(actor)).AsNoTracking().FirstOrDefaultAsync(b => b.Id == id, ct)
                      ?? throw new NotFoundException("Booking not found.");
        return ToDto(booking, actor);
    }

    public async Task<BookingDto> CancelAsync(Guid id, CancelBookingRequest request, Actor actor, CancellationToken ct)
    {
        var booking = await LoadForUpdateAsync(id, actor, ct);

        if (actor.Role == UserRole.Cleaner)
            throw new ForbiddenException("Cleaners cannot cancel bookings. Please contact the office.");
        if (booking.Status is not (BookingStatus.Pending or BookingStatus.Confirmed))
            throw new BusinessRuleException($"A booking that is {booking.Status.ToString().ToLower()} cannot be cancelled.");
        if (!actor.IsAdmin && !IsWithinFreeWindow(booking))
            throw new BusinessRuleException(
                $"Online cancellation is available up to {scheduling.Value.FreeCancellationHours} hours before your visit. Please contact us.");

        booking.Status = BookingStatus.Cancelled;
        booking.CancelledAtUtc = Now;
        booking.CancellationReason = string.IsNullOrWhiteSpace(request.Reason) ? null : request.Reason.Trim();
        Touch(booking);

        audit.Record(AuditActions.BookingCancelled, actor.UserId, entityType: nameof(Booking),
            entityId: booking.Id.ToString(), details: booking.Reference);
        await db.SaveChangesAsync(ct);
        return await GetAsync(id, actor, ct);
    }

    public async Task<BookingDto> RescheduleAsync(Guid id, RescheduleBookingRequest request, Actor actor, CancellationToken ct)
    {
        var booking = await LoadForUpdateAsync(id, actor, ct);

        if (actor.Role == UserRole.Cleaner)
            throw new ForbiddenException("Cleaners cannot reschedule bookings.");
        if (booking.Status is not (BookingStatus.Pending or BookingStatus.Confirmed))
            throw new BusinessRuleException("Only upcoming bookings can be rescheduled.");
        if (!actor.IsAdmin && !IsWithinFreeWindow(booking))
            throw new BusinessRuleException(
                $"Online rescheduling is available up to {scheduling.Value.FreeCancellationHours} hours before your visit.");

        var duration = (int)(booking.EndUtc - booking.StartUtc).TotalMinutes;
        var startUtc = DateTime.SpecifyKind(request.StartUtc.ToUniversalTime(), DateTimeKind.Utc);
        availability.EnsureBookable(startUtc, duration);
        var endUtc = startUtc.AddMinutes(duration);

        try
        {
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);

            // Keep the same cleaner when possible, customers like familiar faces.
            var keepCleaner = booking.CleanerId is { } current &&
                              await availability.IsCleanerFreeAsync(current, startUtc, endUtc, booking.Id, ct);
            var cleanerId = keepCleaner
                ? booking.CleanerId
                : await availability.FindFreeCleanerAsync(startUtc, endUtc, booking.Id, ct)
                  ?? throw new ConflictException("Sorry, that time slot is no longer available.");

            booking.StartUtc = startUtc;
            booking.EndUtc = endUtc;
            booking.CleanerId = cleanerId;
            booking.Status = BookingStatus.Confirmed;
            Touch(booking);

            audit.Record(AuditActions.BookingStatusChanged, actor.UserId, entityType: nameof(Booking),
                entityId: booking.Id.ToString(), details: $"{booking.Reference} rescheduled to {startUtc:u}");
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        catch (Exception ex) when (IsSerializationFailure(ex))
        {
            throw new ConflictException("Sorry, that time slot is no longer available.");
        }

        return await GetAsync(id, actor, ct);
    }

    public async Task<BookingDto> UpdateStatusAsync(Guid id, UpdateBookingStatusRequest request, Actor actor, CancellationToken ct)
    {
        if (actor.Role == UserRole.Customer)
            throw new ForbiddenException();

        var booking = await LoadForUpdateAsync(id, actor, ct);
        var from = booking.Status;
        var to = request.Status;

        // Explicit state machine: every other transition is rejected.
        var allowed = (from, to) switch
        {
            (BookingStatus.Pending, BookingStatus.Confirmed) => actor.IsAdmin && booking.CleanerId is not null,
            (BookingStatus.Confirmed, BookingStatus.InProgress) => true,
            (BookingStatus.InProgress, BookingStatus.Completed) => true,
            _ => false
        };
        if (!allowed)
            throw new BusinessRuleException($"Cannot change a booking from {from} to {to}.");

        booking.Status = to;
        if (to == BookingStatus.Completed) booking.CompletedAtUtc = Now;
        Touch(booking);

        audit.Record(AuditActions.BookingStatusChanged, actor.UserId, entityType: nameof(Booking),
            entityId: booking.Id.ToString(), details: $"{booking.Reference}: {from} → {to}");
        await db.SaveChangesAsync(ct);
        return await GetAsync(id, actor, ct);
    }

    public async Task<BookingDto> AssignCleanerAsync(Guid id, AssignCleanerRequest request, Actor actor, CancellationToken ct)
    {
        if (!actor.IsAdmin) throw new ForbiddenException();

        var booking = await LoadForUpdateAsync(id, actor, ct);
        if (booking.Status is not (BookingStatus.Pending or BookingStatus.Confirmed))
            throw new BusinessRuleException("Cleaners can only be assigned to upcoming bookings.");

        var cleaner = await db.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == request.CleanerId && u.Role == UserRole.Cleaner && u.IsActive, ct)
            ?? throw new NotFoundException("Cleaner not found.");

        if (!await availability.IsCleanerFreeAsync(cleaner.Id, booking.StartUtc, booking.EndUtc, booking.Id, ct))
            throw new ConflictException($"{cleaner.FullName} already has a job at that time.");

        booking.CleanerId = cleaner.Id;
        if (booking.Status == BookingStatus.Pending) booking.Status = BookingStatus.Confirmed;
        Touch(booking);

        audit.Record(AuditActions.BookingAssigned, actor.UserId, entityType: nameof(Booking),
            entityId: booking.Id.ToString(), details: $"{booking.Reference} → {cleaner.FullName}");
        await db.SaveChangesAsync(ct);
        return await GetAsync(id, actor, ct);
    }

    /// <summary>Row-level authorization: every query starts from the set of bookings the caller may see.</summary>
    private IQueryable<Booking> Scoped(Actor actor) => actor.Role switch
    {
        UserRole.Admin => db.Bookings,
        UserRole.Cleaner => db.Bookings.Where(b => b.CleanerId == actor.UserId),
        _ => db.Bookings.Where(b => b.CustomerId == actor.UserId)
    };

    private static IQueryable<Booking> WithDetails(IQueryable<Booking> q) => q
        .Include(b => b.Service)
        .Include(b => b.Customer)
        .Include(b => b.Cleaner)
        .Include(b => b.Extras)
        .Include(b => b.Review)
        .AsSplitQuery();

    private async Task<Booking> LoadForUpdateAsync(Guid id, Actor actor, CancellationToken ct) =>
        await Scoped(actor).FirstOrDefaultAsync(b => b.Id == id, ct)
        ?? throw new NotFoundException("Booking not found.");

    private void Touch(Booking booking)
    {
        booking.UpdatedAtUtc = Now;
        booking.ConcurrencyStamp = Guid.NewGuid();
    }

    private bool IsWithinFreeWindow(Booking b) =>
        b.StartUtc - Now >= TimeSpan.FromHours(scheduling.Value.FreeCancellationHours);

    private async Task<string> GenerateReferenceAsync(CancellationToken ct)
    {
        while (true)
        {
            var code = "PR-" + RandomNumberGenerator.GetString(ReferenceAlphabet, 6);
            if (!await db.Bookings.AnyAsync(b => b.Reference == code, ct)) return code;
        }
    }

    private static bool IsSerializationFailure(Exception ex)
    {
        for (var e = ex; e is not null; e = e.InnerException)
            if (e is PostgresException { SqlState: PostgresErrorCodes.SerializationFailure or PostgresErrorCodes.DeadlockDetected })
                return true;
        return false;
    }

    private BookingDto ToDto(Booking b, Actor actor)
    {
        var isOwner = b.CustomerId == actor.UserId;
        var upcoming = b.Status is BookingStatus.Pending or BookingStatus.Confirmed;
        var canChange = upcoming && (actor.IsAdmin || (isOwner && IsWithinFreeWindow(b)));

        return new BookingDto(
            b.Id, b.Reference, b.Status, b.StartUtc, b.EndUtc, (int)(b.EndUtc - b.StartUtc).TotalMinutes,
            new BookingServiceDto(b.Service.Id, b.Service.Name, b.Service.Icon),
            b.Bedrooms, b.Bathrooms, b.Frequency,
            new AddressDto(b.Street, b.City, b.PostalCode), b.AccessNotes,
            b.Extras.OrderBy(e => e.Name).Select(e => new BookingExtraDto(e.Name, e.Price)).ToList(),
            b.Subtotal, b.Discount, b.Total,
            new PersonDto(b.Customer.Id, b.Customer.FullName, b.Customer.Email, b.Customer.Phone),
            // Customers see their cleaner's name only, never their contact details.
            b.Cleaner is null ? null : new PersonDto(b.Cleaner.Id, b.Cleaner.FullName,
                actor.IsAdmin ? b.Cleaner.Email : null, actor.IsAdmin ? b.Cleaner.Phone : null),
            b.Review is null ? null : new BookingReviewDto(b.Review.Rating, b.Review.Comment, b.Review.CreatedAtUtc),
            CanCancel: canChange,
            CanReschedule: canChange,
            CanReview: isOwner && b.Status == BookingStatus.Completed && b.Review is null,
            b.CreatedAtUtc, b.CancellationReason);
    }
}
