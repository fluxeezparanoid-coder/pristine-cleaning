using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Pristine.Api.Common;
using Pristine.Api.Features.Catalog;
using Pristine.Api.Features.Pricing;
using Pristine.Api.Features.Scheduling;
using Pristine.Api.Security;

namespace Pristine.Api.Controllers;

/// <summary>Cleaning services offered by the company.</summary>
[ApiController]
[Route("api/services")]
[Produces("application/json")]
public sealed class ServicesController(ICatalogService catalog) : ControllerBase
{
    /// <summary>List active services. Admins may pass <c>includeInactive=true</c>.</summary>
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<ServiceDto>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<ServiceDto>> List([FromQuery] bool includeInactive, CancellationToken ct) =>
        catalog.GetServicesAsync(includeInactive && User.IsInRole("Admin"), ct);

    /// <summary>Get a service by its URL slug.</summary>
    [HttpGet("{slug}")]
    [ProducesResponseType<ServiceDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<ServiceDto> Get(string slug, CancellationToken ct) => catalog.GetServiceAsync(slug, ct);

    /// <summary>Create a service.</summary>
    [HttpPost]
    [Authorize(Policies.Admin)]
    [ProducesResponseType<ServiceDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<ServiceDto>> Create(ServiceUpsertRequest request, CancellationToken ct)
    {
        var service = await catalog.CreateServiceAsync(request, Actor.From(User), ct);
        return CreatedAtAction(nameof(Get), new { slug = service.Slug }, service);
    }

    /// <summary>Update a service.</summary>
    [HttpPut("{id:guid}")]
    [Authorize(Policies.Admin)]
    [ProducesResponseType<ServiceDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<ServiceDto> Update(Guid id, ServiceUpsertRequest request, CancellationToken ct) =>
        catalog.UpdateServiceAsync(id, request, Actor.From(User), ct);

    /// <summary>Deactivate (soft-delete) a service. Existing bookings are not affected.</summary>
    [HttpDelete("{id:guid}")]
    [Authorize(Policies.Admin)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await catalog.DeactivateServiceAsync(id, Actor.From(User), ct);
        return NoContent();
    }
}

/// <summary>Optional add-ons (oven, fridge, windows…).</summary>
[ApiController]
[Route("api/extras")]
[Produces("application/json")]
public sealed class ExtrasController(ICatalogService catalog) : ControllerBase
{
    /// <summary>List available add-ons.</summary>
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<ExtraDto>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<ExtraDto>> List(CancellationToken ct) => catalog.GetExtrasAsync(ct);
}

/// <summary>Instant price quotes.</summary>
[ApiController]
[Route("api/quotes")]
[Produces("application/json")]
[EnableRateLimiting(RateLimits.Public)]
public sealed class QuotesController(IPricingService pricing) : ControllerBase
{
    /// <summary>Calculate an itemised price and estimated duration.</summary>
    /// <remarks>The same engine re-prices every booking on the server, so the client can never set its own price.</remarks>
    [HttpPost]
    [ProducesResponseType<QuoteDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<QuoteDto> Create(QuoteRequest request, CancellationToken ct) =>
        (await pricing.CalculateAsync(request, ct)).Dto;
}

/// <summary>Real-time availability based on the cleaners' schedules.</summary>
[ApiController]
[Route("api/availability")]
[Produces("application/json")]
[EnableRateLimiting(RateLimits.Public)]
public sealed class AvailabilityController(IAvailabilityService availability) : ControllerBase
{
    private const int MinDuration = 30;
    private const int MaxDuration = 12 * 60;

    /// <summary>Bookable time slots for a single day.</summary>
    /// <param name="date">Local date in the company's time zone (yyyy-MM-dd).</param>
    /// <param name="durationMinutes">Job duration from the quote.</param>
    [HttpGet]
    [ProducesResponseType<DayAvailabilityDto>(StatusCodes.Status200OK)]
    public Task<DayAvailabilityDto> Day([FromQuery] DateOnly date, [FromQuery] int durationMinutes, CancellationToken ct) =>
        availability.GetDayAsync(date, Math.Clamp(durationMinutes, MinDuration, MaxDuration), ct);

    /// <summary>Number of free slots per day, used to render the booking calendar.</summary>
    [HttpGet("calendar")]
    [ProducesResponseType<IReadOnlyList<DaySummaryDto>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<DaySummaryDto>> Calendar(
        [FromQuery] DateOnly from, [FromQuery] int days, [FromQuery] int durationMinutes, CancellationToken ct) =>
        availability.GetCalendarAsync(from, Math.Clamp(days, 1, 42), Math.Clamp(durationMinutes, MinDuration, MaxDuration), ct);
}
