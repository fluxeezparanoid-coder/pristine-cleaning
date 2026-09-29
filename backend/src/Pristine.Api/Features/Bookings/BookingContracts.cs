using FluentValidation;
using Pristine.Api.Domain;
using Pristine.Api.Features.Auth;
using Pristine.Api.Features.Pricing;

namespace Pristine.Api.Features.Bookings;

public record AddressDto(string Street, string City, string PostalCode);

public record CreateBookingRequest(
    Guid ServiceId,
    int Bedrooms,
    int Bathrooms,
    CleaningFrequency Frequency,
    IReadOnlyList<Guid>? ExtraIds,
    DateTime StartUtc,
    AddressDto Address,
    string? AccessNotes);

public record CancelBookingRequest(string? Reason);

public record RescheduleBookingRequest(DateTime StartUtc);

public record UpdateBookingStatusRequest(BookingStatus Status);

public record AssignCleanerRequest(Guid CleanerId);

public record BookingQuery(
    BookingStatus? Status = null,
    DateTime? FromUtc = null,
    DateTime? ToUtc = null,
    string? Search = null,
    bool? Upcoming = null,
    int? Page = null,
    int? PageSize = null);

public record PersonDto(Guid Id, string FullName, string? Email, string? Phone);

public record BookingServiceDto(Guid Id, string Name, string Icon);

public record BookingExtraDto(string Name, decimal Price);

public record BookingReviewDto(int Rating, string? Comment, DateTime CreatedAtUtc);

public record BookingDto(
    Guid Id,
    string Reference,
    BookingStatus Status,
    DateTime StartUtc,
    DateTime EndUtc,
    int DurationMinutes,
    BookingServiceDto Service,
    int Bedrooms,
    int Bathrooms,
    CleaningFrequency Frequency,
    AddressDto Address,
    string? AccessNotes,
    IReadOnlyList<BookingExtraDto> Extras,
    decimal Subtotal,
    decimal Discount,
    decimal Total,
    PersonDto Customer,
    PersonDto? Cleaner,
    BookingReviewDto? Review,
    bool CanCancel,
    bool CanReschedule,
    bool CanReview,
    DateTime CreatedAtUtc,
    string? CancellationReason);

public sealed class AddressDtoValidator : AbstractValidator<AddressDto>
{
    public AddressDtoValidator()
    {
        RuleFor(x => x.Street).NotEmpty().MaximumLength(200);
        RuleFor(x => x.City).NotEmpty().MaximumLength(100).Matches(ValidationRules.NamePattern)
            .WithMessage("Please enter a valid city name.");
        RuleFor(x => x.PostalCode).NotEmpty().MaximumLength(16).Matches("^[A-Za-z0-9][A-Za-z0-9 \\-]{1,14}[A-Za-z0-9]$")
            .WithMessage("Please enter a valid postal code.");
    }
}

public sealed class CreateBookingRequestValidator : AbstractValidator<CreateBookingRequest>
{
    public CreateBookingRequestValidator()
    {
        RuleFor(x => x.ServiceId).NotEmpty();
        RuleFor(x => x.Bedrooms).InclusiveBetween(PricingService.MinRooms, PricingService.MaxRooms);
        RuleFor(x => x.Bathrooms).InclusiveBetween(PricingService.MinRooms, PricingService.MaxRooms);
        RuleFor(x => x.Frequency).IsInEnum();
        RuleFor(x => x.ExtraIds).Must(ids => ids is null || ids.Count <= 20).WithMessage("Too many extras selected.");
        RuleFor(x => x.StartUtc).NotEmpty();
        RuleFor(x => x.Address).NotNull().SetValidator(new AddressDtoValidator());
        RuleFor(x => x.AccessNotes).MaximumLength(500);
    }
}

public sealed class CancelBookingRequestValidator : AbstractValidator<CancelBookingRequest>
{
    public CancelBookingRequestValidator() => RuleFor(x => x.Reason).MaximumLength(500);
}

public sealed class UpdateBookingStatusRequestValidator : AbstractValidator<UpdateBookingStatusRequest>
{
    public UpdateBookingStatusRequestValidator() => RuleFor(x => x.Status).IsInEnum();
}

public sealed class BookingQueryValidator : AbstractValidator<BookingQuery>
{
    public BookingQueryValidator()
    {
        RuleFor(x => x.Status).IsInEnum().When(x => x.Status is not null);
        RuleFor(x => x.Search).MaximumLength(100);
        RuleFor(x => x).Must(x => x.FromUtc is null || x.ToUtc is null || x.FromUtc <= x.ToUtc)
            .WithMessage("'fromUtc' must be before 'toUtc'.");
    }
}
