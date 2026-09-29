using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pristine.Api.Common;
using Pristine.Api.Features.Bookings;
using Pristine.Api.Features.Reviews;
using Pristine.Api.Security;

namespace Pristine.Api.Controllers;

/// <summary>
/// Bookings. Results are always scoped to the caller: customers see their own bookings,
/// cleaners see jobs assigned to them, admins see everything.
/// </summary>
[ApiController]
[Authorize]
[Route("api/bookings")]
[Produces("application/json")]
public sealed class BookingsController(IBookingService bookings, IReviewService reviews) : ControllerBase
{
    /// <summary>Place a booking. The price is calculated server-side and a cleaner is assigned automatically.</summary>
    [HttpPost]
    [Authorize(Policies.Customer)]
    [ProducesResponseType<BookingDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<BookingDto>> Create(CreateBookingRequest request, CancellationToken ct)
    {
        var booking = await bookings.CreateAsync(request, Actor.From(User), ct);
        return CreatedAtAction(nameof(Get), new { id = booking.Id }, booking);
    }

    /// <summary>List bookings visible to the caller, with filtering and paging.</summary>
    [HttpGet]
    [ProducesResponseType<PagedResult<BookingDto>>(StatusCodes.Status200OK)]
    public Task<PagedResult<BookingDto>> List([FromQuery] BookingQuery query, CancellationToken ct) =>
        bookings.ListAsync(query, Actor.From(User), ct);

    /// <summary>Get a single booking. Returns 404 for bookings the caller is not allowed to see.</summary>
    [HttpGet("{id:guid}")]
    [ProducesResponseType<BookingDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<BookingDto> Get(Guid id, CancellationToken ct) => bookings.GetAsync(id, Actor.From(User), ct);

    /// <summary>Cancel a booking (customers: free until 24 hours before the visit).</summary>
    [HttpPost("{id:guid}/cancel")]
    [ProducesResponseType<BookingDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<BookingDto> Cancel(Guid id, CancelBookingRequest request, CancellationToken ct) =>
        bookings.CancelAsync(id, request, Actor.From(User), ct);

    /// <summary>Move a booking to another time slot.</summary>
    [HttpPost("{id:guid}/reschedule")]
    [ProducesResponseType<BookingDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<BookingDto> Reschedule(Guid id, RescheduleBookingRequest request, CancellationToken ct) =>
        bookings.RescheduleAsync(id, request, Actor.From(User), ct);

    /// <summary>Advance a job through its lifecycle: Confirmed → InProgress → Completed.</summary>
    [HttpPatch("{id:guid}/status")]
    [Authorize(Policies.Staff)]
    [ProducesResponseType<BookingDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<BookingDto> UpdateStatus(Guid id, UpdateBookingStatusRequest request, CancellationToken ct) =>
        bookings.UpdateStatusAsync(id, request, Actor.From(User), ct);

    /// <summary>Assign a specific cleaner to a booking.</summary>
    [HttpPut("{id:guid}/cleaner")]
    [Authorize(Policies.Admin)]
    [ProducesResponseType<BookingDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public Task<BookingDto> AssignCleaner(Guid id, AssignCleanerRequest request, CancellationToken ct) =>
        bookings.AssignCleanerAsync(id, request, Actor.From(User), ct);

    /// <summary>Leave a review for a completed booking.</summary>
    [HttpPost("{id:guid}/review")]
    [Authorize(Policies.Customer)]
    [ProducesResponseType<PublicReviewDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<PublicReviewDto>> Review(Guid id, CreateReviewRequest request, CancellationToken ct)
    {
        var review = await reviews.CreateAsync(id, request, Actor.From(User), ct);
        return StatusCode(StatusCodes.Status201Created, review);
    }
}

/// <summary>Public customer reviews for the marketing site.</summary>
[ApiController]
[Route("api/reviews")]
[Produces("application/json")]
public sealed class ReviewsController(IReviewService reviews) : ControllerBase
{
    /// <summary>Latest positive reviews (names are anonymised to first name and initial).</summary>
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<PublicReviewDto>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<PublicReviewDto>> Featured([FromQuery] int limit = 9, CancellationToken ct = default) =>
        reviews.GetFeaturedAsync(limit, ct);

    /// <summary>Aggregate rating and number of completed cleans.</summary>
    [HttpGet("summary")]
    [ProducesResponseType<ReviewSummaryDto>(StatusCodes.Status200OK)]
    public Task<ReviewSummaryDto> Summary(CancellationToken ct) => reviews.GetSummaryAsync(ct);
}
