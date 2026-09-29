using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Pristine.Api.Common;
using Pristine.Api.Data;
using Pristine.Api.Domain;
using Pristine.Api.Features.Audit;

namespace Pristine.Api.Features.Reviews;

public record CreateReviewRequest(int Rating, string? Comment);

public record PublicReviewDto(Guid Id, int Rating, string? Comment, string AuthorName, string ServiceName, DateTime CreatedAtUtc);

public record ReviewSummaryDto(double AverageRating, int TotalReviews, int CompletedCleans);

public sealed class CreateReviewRequestValidator : AbstractValidator<CreateReviewRequest>
{
    public CreateReviewRequestValidator()
    {
        RuleFor(x => x.Rating).InclusiveBetween(1, 5);
        RuleFor(x => x.Comment).MaximumLength(1000);
    }
}

public interface IReviewService
{
    Task<PublicReviewDto> CreateAsync(Guid bookingId, CreateReviewRequest request, Actor actor, CancellationToken ct);
    Task<IReadOnlyList<PublicReviewDto>> GetFeaturedAsync(int limit, CancellationToken ct);
    Task<ReviewSummaryDto> GetSummaryAsync(CancellationToken ct);
}

public sealed class ReviewService(AppDbContext db, IAuditService audit, TimeProvider clock) : IReviewService
{
    public async Task<PublicReviewDto> CreateAsync(Guid bookingId, CreateReviewRequest request, Actor actor, CancellationToken ct)
    {
        var booking = await db.Bookings.Include(b => b.Service).Include(b => b.Review).Include(b => b.Customer)
                          .FirstOrDefaultAsync(b => b.Id == bookingId && b.CustomerId == actor.UserId, ct)
                      ?? throw new NotFoundException("Booking not found.");

        if (booking.Status != BookingStatus.Completed)
            throw new BusinessRuleException("You can review a booking once the cleaning is completed.");
        if (booking.Review is not null)
            throw new ConflictException("You have already reviewed this booking.");

        var review = new Review
        {
            BookingId = booking.Id,
            CustomerId = actor.UserId,
            CleanerId = booking.CleanerId,
            Rating = request.Rating,
            Comment = string.IsNullOrWhiteSpace(request.Comment) ? null : request.Comment.Trim(),
            CreatedAtUtc = clock.GetUtcNow().UtcDateTime
        };
        db.Reviews.Add(review);
        audit.Record(AuditActions.ReviewCreated, actor.UserId, entityType: nameof(Review),
            entityId: review.Id.ToString(), details: $"{booking.Reference}: {review.Rating}/5");
        await db.SaveChangesAsync(ct);

        return new PublicReviewDto(review.Id, review.Rating, review.Comment, ShortName(booking.Customer.FullName),
            booking.Service.Name, review.CreatedAtUtc);
    }

    public async Task<IReadOnlyList<PublicReviewDto>> GetFeaturedAsync(int limit, CancellationToken ct)
    {
        var rows = await db.Reviews.AsNoTracking()
            .Where(r => r.Rating >= 4 && r.Comment != null)
            .OrderByDescending(r => r.CreatedAtUtc)
            .Take(Math.Clamp(limit, 1, 24))
            .Select(r => new { r.Id, r.Rating, r.Comment, r.Customer.FullName, Service = r.Booking.Service.Name, r.CreatedAtUtc })
            .ToListAsync(ct);

        // Public endpoint: expose only first name + initial, never emails or full names.
        return rows.Select(r => new PublicReviewDto(r.Id, r.Rating, r.Comment, ShortName(r.FullName), r.Service, r.CreatedAtUtc))
            .ToList();
    }

    public async Task<ReviewSummaryDto> GetSummaryAsync(CancellationToken ct)
    {
        var ratings = await db.Reviews.AsNoTracking().Select(r => r.Rating).ToListAsync(ct);
        var completed = await db.Bookings.CountAsync(b => b.Status == BookingStatus.Completed, ct);
        return new ReviewSummaryDto(ratings.Count == 0 ? 0 : Math.Round(ratings.Average(), 2), ratings.Count, completed);
    }

    public static string ShortName(string fullName)
    {
        var parts = fullName.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return parts.Length > 1 ? $"{parts[0]} {parts[^1][0]}." : parts.FirstOrDefault() ?? "Customer";
    }
}
