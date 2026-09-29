using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Pristine.Api.Common;
using Pristine.Api.Data;
using Pristine.Api.Domain;

namespace Pristine.Api.Features.Pricing;

public record QuoteRequest(
    Guid ServiceId, int Bedrooms, int Bathrooms, CleaningFrequency Frequency, IReadOnlyList<Guid>? ExtraIds);

public record QuoteLine(string Label, decimal Amount);

public record QuoteDto(
    Guid ServiceId, string ServiceName, IReadOnlyList<QuoteLine> Lines,
    decimal Subtotal, decimal DiscountRate, decimal Discount, decimal Total, int DurationMinutes);

/// <summary>Full calculation result, including the entities needed to snapshot a booking.</summary>
public record Quote(QuoteDto Dto, CleaningService Service, IReadOnlyList<Extra> Extras);

public sealed class QuoteRequestValidator : AbstractValidator<QuoteRequest>
{
    public QuoteRequestValidator()
    {
        RuleFor(x => x.ServiceId).NotEmpty();
        RuleFor(x => x.Bedrooms).InclusiveBetween(PricingService.MinRooms, PricingService.MaxRooms);
        RuleFor(x => x.Bathrooms).InclusiveBetween(PricingService.MinRooms, PricingService.MaxRooms);
        RuleFor(x => x.Frequency).IsInEnum();
        RuleFor(x => x.ExtraIds).Must(ids => ids is null || ids.Count <= 20).WithMessage("Too many extras selected.");
    }
}

public interface IPricingService
{
    Task<Quote> CalculateAsync(QuoteRequest request, CancellationToken ct);
}

/// <summary>
/// Single source of truth for prices. The client never sends a price: bookings are always
/// re-priced on the server, so tampering with the request cannot change what the customer pays.
/// </summary>
public sealed class PricingService(AppDbContext db) : IPricingService
{
    public const int MinRooms = 1;
    public const int MaxRooms = 10;
    private const int SlotGranularityMinutes = 30;

    public static decimal DiscountRateFor(CleaningFrequency frequency) => frequency switch
    {
        CleaningFrequency.Weekly => 0.20m,
        CleaningFrequency.Biweekly => 0.15m,
        CleaningFrequency.Monthly => 0.10m,
        _ => 0m
    };

    public async Task<Quote> CalculateAsync(QuoteRequest request, CancellationToken ct)
    {
        var service = await db.Services.AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == request.ServiceId && s.IsActive, ct)
            ?? throw new NotFoundException("Service not found.");

        var extraIds = (request.ExtraIds ?? []).Distinct().ToList();
        var extras = extraIds.Count == 0
            ? []
            : await db.Extras.AsNoTracking().Where(e => extraIds.Contains(e.Id) && e.IsActive).ToListAsync(ct);

        if (extras.Count != extraIds.Count)
            throw new BusinessRuleException("One or more selected extras are not available.");

        return new Quote(Calculate(service, extras, request.Bedrooms, request.Bathrooms, request.Frequency), service, extras);
    }

    public static QuoteDto Calculate(CleaningService service, IReadOnlyList<Extra> extras,
        int bedrooms, int bathrooms, CleaningFrequency frequency)
    {
        var extraBedrooms = Math.Max(0, bedrooms - 1);
        var extraBathrooms = Math.Max(0, bathrooms - 1);

        var lines = new List<QuoteLine> { new($"{service.Name} (1 bed, 1 bath)", service.BasePrice) };
        if (extraBedrooms > 0)
            lines.Add(new($"{extraBedrooms} extra bedroom{(extraBedrooms > 1 ? "s" : "")}", extraBedrooms * service.PricePerExtraBedroom));
        if (extraBathrooms > 0)
            lines.Add(new($"{extraBathrooms} extra bathroom{(extraBathrooms > 1 ? "s" : "")}", extraBathrooms * service.PricePerExtraBathroom));
        lines.AddRange(extras.OrderBy(e => e.Name).Select(e => new QuoteLine(e.Name, e.Price)));

        var subtotal = lines.Sum(l => l.Amount);
        var rate = DiscountRateFor(frequency);
        var discount = Math.Round(subtotal * rate, 2, MidpointRounding.AwayFromZero);

        var minutes = service.BaseMinutes
                      + extraBedrooms * service.MinutesPerExtraBedroom
                      + extraBathrooms * service.MinutesPerExtraBathroom
                      + extras.Sum(e => e.Minutes);
        var rounded = (int)Math.Ceiling(minutes / (double)SlotGranularityMinutes) * SlotGranularityMinutes;

        return new QuoteDto(service.Id, service.Name, lines, subtotal, rate, discount, subtotal - discount, rounded);
    }
}
