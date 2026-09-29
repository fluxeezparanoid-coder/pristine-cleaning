using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Pristine.Api.Common;
using Pristine.Api.Data;
using Pristine.Api.Domain;
using Pristine.Api.Features.Audit;
using Pristine.Api.Features.Scheduling;

namespace Pristine.Api.Features.Admin;

public record KpiDto(
    decimal Revenue30d, decimal RevenuePrev30d,
    int Bookings30d, int BookingsPrev30d,
    int UpcomingBookings, int TodayBookings,
    double AverageRating, double CancellationRate,
    int ActiveCustomers);

public record DailyPointDto(DateOnly Date, decimal Revenue, int Bookings);

public record ServiceShareDto(string Service, int Bookings, decimal Revenue);

public record StatusCountDto(BookingStatus Status, int Count);

public record CleanerPerformanceDto(Guid Id, string FullName, int CompletedJobs, int UpcomingJobs, double AverageRating, decimal Revenue);

public record DashboardDto(
    KpiDto Kpis,
    IReadOnlyList<DailyPointDto> Daily,
    IReadOnlyList<ServiceShareDto> ByService,
    IReadOnlyList<StatusCountDto> ByStatus,
    IReadOnlyList<CleanerPerformanceDto> Cleaners);

public record AdminUserDto(
    Guid Id, string Email, string FullName, string? Phone, UserRole Role, bool IsActive,
    bool IsLockedOut, int Bookings, DateTime CreatedAtUtc, DateTime? LastLoginAtUtc);

public record UserQuery(string? Search = null, UserRole? Role = null, int? Page = null, int? PageSize = null);

public record UpdateUserRequest(UserRole Role, bool IsActive);

public record AuditLogDto(Guid Id, DateTime CreatedAtUtc, string Action, string? UserEmail, string? EntityType,
    string? EntityId, string? Details, string? IpAddress);

public record AuditQuery(string? Action = null, int? Page = null, int? PageSize = null);

public record CleanerOptionDto(Guid Id, string FullName, double AverageRating, int UpcomingJobs);

public sealed class UpdateUserRequestValidator : AbstractValidator<UpdateUserRequest>
{
    public UpdateUserRequestValidator() => RuleFor(x => x.Role).IsInEnum();
}

public sealed class UserQueryValidator : AbstractValidator<UserQuery>
{
    public UserQueryValidator()
    {
        RuleFor(x => x.Search).MaximumLength(100);
        RuleFor(x => x.Role).IsInEnum().When(x => x.Role is not null);
    }
}

public sealed class AuditQueryValidator : AbstractValidator<AuditQuery>
{
    public AuditQueryValidator() => RuleFor(x => x.Action).MaximumLength(64);
}

public interface IAdminService
{
    Task<DashboardDto> GetDashboardAsync(CancellationToken ct);
    Task<PagedResult<AdminUserDto>> GetUsersAsync(UserQuery query, CancellationToken ct);
    Task<AdminUserDto> UpdateUserAsync(Guid id, UpdateUserRequest request, Actor actor, CancellationToken ct);
    Task<AdminUserDto> UnlockUserAsync(Guid id, Actor actor, CancellationToken ct);
    Task<PagedResult<AuditLogDto>> GetAuditLogAsync(AuditQuery query, CancellationToken ct);
    Task<IReadOnlyList<CleanerOptionDto>> GetCleanersAsync(CancellationToken ct);
}

public sealed class AdminService(
    AppDbContext db,
    IAuditService audit,
    IAvailabilityService availability,
    TimeProvider clock) : IAdminService
{
    private DateTime Now => clock.GetUtcNow().UtcDateTime;

    public async Task<DashboardDto> GetDashboardAsync(CancellationToken ct)
    {
        var tz = availability.TimeZone;
        var windowStart = Now.AddDays(-60);

        // One narrow projection, aggregated in memory: portable across PostgreSQL and SQLite
        // (SQLite can't aggregate decimals server-side) and cheap at this data volume.
        var rows = await db.Bookings.AsNoTracking()
            .Where(b => b.StartUtc >= windowStart || b.EndUtc >= Now)
            .Select(b => new { b.StartUtc, b.Status, b.Total, b.CustomerId, b.CleanerId, Service = b.Service.Name })
            .ToListAsync(ct);

        var cutoff = Now.AddDays(-30);
        var last30 = rows.Where(r => r.StartUtc >= cutoff && r.StartUtc <= Now).ToList();
        var prev30 = rows.Where(r => r.StartUtc >= windowStart && r.StartUtc < cutoff).ToList();

        static decimal Earned<T>(IEnumerable<T> xs, Func<T, BookingStatus> status, Func<T, decimal> total) =>
            xs.Where(x => status(x) == BookingStatus.Completed).Sum(total);

        var todayLocal = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(Now, tz));
        DateOnly LocalDate(DateTime utc) => DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(utc, tz));

        var ratings = await db.Reviews.AsNoTracking().Select(r => new { r.Rating, r.CleanerId }).ToListAsync(ct);

        var kpis = new KpiDto(
            Revenue30d: Earned(last30, r => r.Status, r => r.Total),
            RevenuePrev30d: Earned(prev30, r => r.Status, r => r.Total),
            Bookings30d: last30.Count(r => r.Status != BookingStatus.Cancelled),
            BookingsPrev30d: prev30.Count(r => r.Status != BookingStatus.Cancelled),
            UpcomingBookings: rows.Count(r => r.StartUtc > Now && r.Status is BookingStatus.Confirmed or BookingStatus.Pending),
            TodayBookings: rows.Count(r => LocalDate(r.StartUtc) == todayLocal && r.Status != BookingStatus.Cancelled),
            AverageRating: ratings.Count == 0 ? 0 : Math.Round(ratings.Average(r => r.Rating), 2),
            CancellationRate: last30.Count == 0 ? 0 : Math.Round(last30.Count(r => r.Status == BookingStatus.Cancelled) / (double)last30.Count, 3),
            ActiveCustomers: last30.Select(r => r.CustomerId).Distinct().Count());

        var daily = Enumerable.Range(0, 30)
            .Select(i => todayLocal.AddDays(i - 29))
            .GroupJoin(rows.Where(r => r.Status != BookingStatus.Cancelled),
                d => d, r => LocalDate(r.StartUtc),
                (d, rs) => new DailyPointDto(d,
                    rs.Where(r => r.Status == BookingStatus.Completed).Sum(r => r.Total),
                    rs.Count()))
            .ToList();

        var byService = last30.Where(r => r.Status != BookingStatus.Cancelled)
            .GroupBy(r => r.Service)
            .Select(g => new ServiceShareDto(g.Key, g.Count(), g.Where(r => r.Status == BookingStatus.Completed).Sum(r => r.Total)))
            .OrderByDescending(s => s.Bookings)
            .ToList();

        var byStatus = rows.Where(r => r.StartUtc >= cutoff)
            .GroupBy(r => r.Status)
            .Select(g => new StatusCountDto(g.Key, g.Count()))
            .OrderBy(s => s.Status)
            .ToList();

        var cleaners = await db.Users.AsNoTracking()
            .Where(u => u.Role == UserRole.Cleaner)
            .Select(u => new { u.Id, u.FullName })
            .ToListAsync(ct);

        var performance = cleaners.Select(c =>
            {
                var jobs = rows.Where(r => r.CleanerId == c.Id).ToList();
                var cr = ratings.Where(r => r.CleanerId == c.Id).ToList();
                return new CleanerPerformanceDto(c.Id, c.FullName,
                    jobs.Count(j => j.Status == BookingStatus.Completed && j.StartUtc >= cutoff),
                    jobs.Count(j => j.StartUtc > Now && j.Status is BookingStatus.Confirmed or BookingStatus.Pending),
                    cr.Count == 0 ? 0 : Math.Round(cr.Average(r => r.Rating), 2),
                    Earned(jobs.Where(j => j.StartUtc >= cutoff), j => j.Status, j => j.Total));
            })
            .OrderByDescending(c => c.Revenue)
            .ToList();

        return new DashboardDto(kpis, daily, byService, byStatus, performance);
    }

    public async Task<PagedResult<AdminUserDto>> GetUsersAsync(UserQuery query, CancellationToken ct)
    {
        var (page, pageSize) = Paging.Normalize(query.Page, query.PageSize);
        var q = db.Users.AsNoTracking();

        if (query.Role is { } role) q = q.Where(u => u.Role == role);
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim().ToLower();
            q = q.Where(u => u.Email.Contains(term) || u.FullName.ToLower().Contains(term));
        }

        var total = await q.CountAsync(ct);
        var now = Now;
        var items = await q.OrderBy(u => u.Role).ThenBy(u => u.FullName)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(u => new AdminUserDto(u.Id, u.Email, u.FullName, u.Phone, u.Role, u.IsActive,
                u.LockoutEndUtc != null && u.LockoutEndUtc > now,
                u.Role == UserRole.Cleaner ? u.AssignedJobs.Count : u.Bookings.Count,
                u.CreatedAtUtc, u.LastLoginAtUtc))
            .ToListAsync(ct);

        return new PagedResult<AdminUserDto>(items, page, pageSize, total);
    }

    public async Task<AdminUserDto> UpdateUserAsync(Guid id, UpdateUserRequest request, Actor actor, CancellationToken ct)
    {
        if (id == actor.UserId)
            throw new BusinessRuleException("You cannot change your own role or status.");

        var user = await db.Users.FindAsync([id], ct) ?? throw new NotFoundException("User not found.");
        var changes = $"{user.Role}/{(user.IsActive ? "active" : "disabled")} → {request.Role}/{(request.IsActive ? "active" : "disabled")}";

        user.Role = request.Role;
        user.IsActive = request.IsActive;

        // Changing privileges or disabling a user invalidates all of their sessions immediately.
        await db.RefreshTokens.Where(t => t.UserId == id && t.RevokedAtUtc == null)
            .ForEachAsync(t => t.RevokedAtUtc = Now, ct);

        audit.Record(AuditActions.UserChanged, actor.UserId, entityType: nameof(User), entityId: id.ToString(),
            details: $"{user.Email}: {changes}");
        await db.SaveChangesAsync(ct);
        return await GetUserAsync(id, ct);
    }

    public async Task<AdminUserDto> UnlockUserAsync(Guid id, Actor actor, CancellationToken ct)
    {
        var user = await db.Users.FindAsync([id], ct) ?? throw new NotFoundException("User not found.");
        user.LockoutEndUtc = null;
        user.FailedLoginAttempts = 0;
        audit.Record(AuditActions.UserChanged, actor.UserId, entityType: nameof(User), entityId: id.ToString(),
            details: $"{user.Email}: unlocked");
        await db.SaveChangesAsync(ct);
        return await GetUserAsync(id, ct);
    }

    public async Task<PagedResult<AuditLogDto>> GetAuditLogAsync(AuditQuery query, CancellationToken ct)
    {
        var (page, pageSize) = Paging.Normalize(query.Page, query.PageSize);
        var q = db.AuditLogs.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(query.Action)) q = q.Where(a => a.Action.StartsWith(query.Action));

        var total = await q.CountAsync(ct);
        var items = await q.OrderByDescending(a => a.CreatedAtUtc)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(a => new AuditLogDto(a.Id, a.CreatedAtUtc, a.Action, a.UserEmail, a.EntityType, a.EntityId, a.Details, a.IpAddress))
            .ToListAsync(ct);

        return new PagedResult<AuditLogDto>(items, page, pageSize, total);
    }

    public async Task<IReadOnlyList<CleanerOptionDto>> GetCleanersAsync(CancellationToken ct)
    {
        var now = Now;
        var cleaners = await db.Users.AsNoTracking()
            .Where(u => u.Role == UserRole.Cleaner && u.IsActive)
            .OrderBy(u => u.FullName)
            .Select(u => new
            {
                u.Id, u.FullName,
                Upcoming = u.AssignedJobs.Count(b => b.StartUtc > now &&
                    (b.Status == BookingStatus.Confirmed || b.Status == BookingStatus.Pending))
            })
            .ToListAsync(ct);

        var ratings = await db.Reviews.AsNoTracking().Where(r => r.CleanerId != null)
            .Select(r => new { r.CleanerId, r.Rating }).ToListAsync(ct);

        return cleaners.Select(c =>
        {
            var rs = ratings.Where(r => r.CleanerId == c.Id).ToList();
            return new CleanerOptionDto(c.Id, c.FullName, rs.Count == 0 ? 0 : Math.Round(rs.Average(r => r.Rating), 2), c.Upcoming);
        }).ToList();
    }

    private async Task<AdminUserDto> GetUserAsync(Guid id, CancellationToken ct)
    {
        var now = Now;
        return await db.Users.AsNoTracking().Where(u => u.Id == id)
            .Select(u => new AdminUserDto(u.Id, u.Email, u.FullName, u.Phone, u.Role, u.IsActive,
                u.LockoutEndUtc != null && u.LockoutEndUtc > now,
                u.Role == UserRole.Cleaner ? u.AssignedJobs.Count : u.Bookings.Count,
                u.CreatedAtUtc, u.LastLoginAtUtc))
            .FirstAsync(ct);
    }
}
