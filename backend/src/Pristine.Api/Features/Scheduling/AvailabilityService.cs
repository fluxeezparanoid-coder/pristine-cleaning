using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Pristine.Api.Common;
using Pristine.Api.Data;
using Pristine.Api.Domain;

namespace Pristine.Api.Features.Scheduling;

public sealed class SchedulingOptions
{
    public const string Section = "Scheduling";

    /// <summary>IANA time zone the company operates in. All opening hours are expressed in this zone.</summary>
    public string TimeZone { get; init; } = "Europe/London";
    public int OpeningHour { get; init; } = 8;
    /// <summary>Jobs must finish by this hour.</summary>
    public int ClosingHour { get; init; } = 19;
    public DayOfWeek[] WorkingDays { get; init; } =
        [DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Friday, DayOfWeek.Saturday];
    public int SlotStepMinutes { get; init; } = 30;
    /// <summary>Travel time a cleaner needs between two jobs.</summary>
    public int TravelBufferMinutes { get; init; } = 30;
    public int MinLeadTimeHours { get; init; } = 12;
    public int MaxDaysAhead { get; init; } = 60;
    /// <summary>Customers may cancel free of charge until this many hours before the visit.</summary>
    public int FreeCancellationHours { get; init; } = 24;
}

public record TimeSlotDto(DateTime StartUtc, DateTime EndUtc, string LocalTime, int AvailableCleaners);

public record DayAvailabilityDto(DateOnly Date, bool IsOpen, IReadOnlyList<TimeSlotDto> Slots);

public record DaySummaryDto(DateOnly Date, bool IsOpen, int AvailableSlots);

public interface IAvailabilityService
{
    TimeZoneInfo TimeZone { get; }
    Task<DayAvailabilityDto> GetDayAsync(DateOnly date, int durationMinutes, CancellationToken ct);
    Task<IReadOnlyList<DaySummaryDto>> GetCalendarAsync(DateOnly from, int days, int durationMinutes, CancellationToken ct);

    /// <summary>Throws if the requested window is outside business rules (hours, lead time, horizon).</summary>
    void EnsureBookable(DateTime startUtc, int durationMinutes);

    /// <summary>Returns the least busy cleaner who is free for the window, or null.</summary>
    Task<Guid?> FindFreeCleanerAsync(DateTime startUtc, DateTime endUtc, Guid? excludeBookingId, CancellationToken ct);

    Task<bool> IsCleanerFreeAsync(Guid cleanerId, DateTime startUtc, DateTime endUtc, Guid? excludeBookingId, CancellationToken ct);
}

public sealed class AvailabilityService(AppDbContext db, IOptions<SchedulingOptions> options, TimeProvider clock)
    : IAvailabilityService
{
    private static readonly BookingStatus[] BlockingStatuses =
        [BookingStatus.Pending, BookingStatus.Confirmed, BookingStatus.InProgress];

    private readonly SchedulingOptions _opt = options.Value;

    public TimeZoneInfo TimeZone { get; } = TimeZoneInfo.FindSystemTimeZoneById(options.Value.TimeZone);

    private DateTime Now => clock.GetUtcNow().UtcDateTime;
    private TimeSpan Buffer => TimeSpan.FromMinutes(_opt.TravelBufferMinutes);

    public async Task<DayAvailabilityDto> GetDayAsync(DateOnly date, int durationMinutes, CancellationToken ct)
    {
        var (cleaners, busy) = await LoadScheduleAsync(date, date, ct);
        return BuildDay(date, durationMinutes, cleaners, busy);
    }

    public async Task<IReadOnlyList<DaySummaryDto>> GetCalendarAsync(DateOnly from, int days, int durationMinutes, CancellationToken ct)
    {
        var to = from.AddDays(days - 1);
        var (cleaners, busy) = await LoadScheduleAsync(from, to, ct);

        return Enumerable.Range(0, days)
            .Select(i => BuildDay(from.AddDays(i), durationMinutes, cleaners, busy))
            .Select(d => new DaySummaryDto(d.Date, d.IsOpen, d.Slots.Count))
            .ToList();
    }

    public void EnsureBookable(DateTime startUtc, int durationMinutes)
    {
        var local = TimeZoneInfo.ConvertTimeFromUtc(startUtc, TimeZone);
        var endLocal = local.AddMinutes(durationMinutes);

        if (!_opt.WorkingDays.Contains(local.DayOfWeek))
            throw new BusinessRuleException("We don't clean on this day. Please choose another date.");
        if (local.TimeOfDay < TimeSpan.FromHours(_opt.OpeningHour) ||
            endLocal.TimeOfDay > TimeSpan.FromHours(_opt.ClosingHour) || endLocal.Date != local.Date)
            throw new BusinessRuleException($"Visits must take place between {_opt.OpeningHour:00}:00 and {_opt.ClosingHour:00}:00.");
        if (local.Minute % _opt.SlotStepMinutes != 0 || local.Second != 0)
            throw new BusinessRuleException("Please pick one of the offered time slots.");
        if (startUtc < Now.AddHours(_opt.MinLeadTimeHours))
            throw new BusinessRuleException($"Bookings must be made at least {_opt.MinLeadTimeHours} hours in advance.");
        if (startUtc > Now.AddDays(_opt.MaxDaysAhead))
            throw new BusinessRuleException($"Bookings can be made up to {_opt.MaxDaysAhead} days ahead.");
    }

    public async Task<Guid?> FindFreeCleanerAsync(DateTime startUtc, DateTime endUtc, Guid? excludeBookingId, CancellationToken ct)
    {
        var dayStart = startUtc.Date.AddDays(-1);
        var dayEnd = startUtc.Date.AddDays(2);

        var cleaners = await db.Users.AsNoTracking()
            .Where(u => u.Role == UserRole.Cleaner && u.IsActive)
            .Select(u => u.Id)
            .ToListAsync(ct);

        var jobs = await db.Bookings.AsNoTracking()
            .Where(b => b.CleanerId != null && BlockingStatuses.Contains(b.Status)
                        && b.StartUtc < dayEnd && b.EndUtc > dayStart && b.Id != excludeBookingId)
            .Select(b => new { CleanerId = b.CleanerId!.Value, b.StartUtc, b.EndUtc })
            .ToListAsync(ct);

        // Least-loaded first: spreads work evenly across the team.
        return cleaners
            .Where(c => !jobs.Any(j => j.CleanerId == c && Overlaps(j.StartUtc, j.EndUtc, startUtc, endUtc)))
            .OrderBy(c => jobs.Count(j => j.CleanerId == c))
            .ThenBy(c => c)
            .Select(c => (Guid?)c)
            .FirstOrDefault();
    }

    public async Task<bool> IsCleanerFreeAsync(Guid cleanerId, DateTime startUtc, DateTime endUtc, Guid? excludeBookingId, CancellationToken ct)
    {
        var from = startUtc - Buffer;
        var to = endUtc + Buffer;
        return !await db.Bookings.AnyAsync(b => b.CleanerId == cleanerId && b.Id != excludeBookingId
                                                && BlockingStatuses.Contains(b.Status)
                                                && b.StartUtc < to && b.EndUtc > from, ct);
    }

    private bool Overlaps(DateTime busyStart, DateTime busyEnd, DateTime start, DateTime end) =>
        busyStart < end + Buffer && busyEnd + Buffer > start;

    private async Task<(List<Guid> Cleaners, ILookup<Guid, (DateTime Start, DateTime End)> Busy)> LoadScheduleAsync(
        DateOnly from, DateOnly to, CancellationToken ct)
    {
        var rangeStart = TimeZoneInfo.ConvertTimeToUtc(from.ToDateTime(TimeOnly.MinValue), TimeZone) - Buffer;
        var rangeEnd = TimeZoneInfo.ConvertTimeToUtc(to.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeZone) + Buffer;

        var cleaners = await db.Users.AsNoTracking()
            .Where(u => u.Role == UserRole.Cleaner && u.IsActive)
            .Select(u => u.Id)
            .ToListAsync(ct);

        var jobs = await db.Bookings.AsNoTracking()
            .Where(b => b.CleanerId != null && BlockingStatuses.Contains(b.Status)
                        && b.StartUtc < rangeEnd && b.EndUtc > rangeStart)
            .Select(b => new { CleanerId = b.CleanerId!.Value, b.StartUtc, b.EndUtc })
            .ToListAsync(ct);

        return (cleaners, jobs.ToLookup(j => j.CleanerId, j => (j.StartUtc, j.EndUtc)));
    }

    private DayAvailabilityDto BuildDay(DateOnly date, int durationMinutes, List<Guid> cleaners,
        ILookup<Guid, (DateTime Start, DateTime End)> busy)
    {
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(Now, TimeZone));
        var isOpen = _opt.WorkingDays.Contains(date.DayOfWeek) && date >= today && date <= today.AddDays(_opt.MaxDaysAhead);
        if (!isOpen) return new DayAvailabilityDto(date, false, []);

        var slots = new List<TimeSlotDto>();
        var earliest = Now.AddHours(_opt.MinLeadTimeHours);
        var open = date.ToDateTime(new TimeOnly(_opt.OpeningHour, 0));
        var lastStart = date.ToDateTime(new TimeOnly(_opt.ClosingHour, 0)).AddMinutes(-durationMinutes);

        for (var local = open; local <= lastStart; local = local.AddMinutes(_opt.SlotStepMinutes))
        {
            var startUtc = TimeZoneInfo.ConvertTimeToUtc(local, TimeZone);
            if (startUtc < earliest) continue;
            var endUtc = startUtc.AddMinutes(durationMinutes);

            var free = cleaners.Count(c => !busy[c].Any(j => Overlaps(j.Start, j.End, startUtc, endUtc)));
            if (free > 0)
                slots.Add(new TimeSlotDto(startUtc, endUtc, local.ToString("HH:mm"), free));
        }

        return new DayAvailabilityDto(date, true, slots);
    }
}
