namespace Pristine.Api.Domain;

public class Booking
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Short human-friendly code shown to customers (e.g. PR-7KX2QM).</summary>
    public required string Reference { get; set; }

    public Guid CustomerId { get; set; }
    public User Customer { get; set; } = null!;

    public Guid? CleanerId { get; set; }
    public User? Cleaner { get; set; }

    public Guid ServiceId { get; set; }
    public CleaningService Service { get; set; } = null!;

    public DateTime StartUtc { get; set; }
    public DateTime EndUtc { get; set; }

    public int Bedrooms { get; set; }
    public int Bathrooms { get; set; }
    public CleaningFrequency Frequency { get; set; }

    public required string Street { get; set; }
    public required string City { get; set; }
    public required string PostalCode { get; set; }
    public string? AccessNotes { get; set; }

    public BookingStatus Status { get; set; } = BookingStatus.Pending;

    // Prices are always calculated on the server and snapshotted at booking time.
    public decimal Subtotal { get; set; }
    public decimal Discount { get; set; }
    public decimal Total { get; set; }

    public DateTime CreatedAtUtc { get; set; }
    public DateTime UpdatedAtUtc { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
    public DateTime? CancelledAtUtc { get; set; }
    public string? CancellationReason { get; set; }

    /// <summary>Optimistic concurrency token, regenerated on every update.</summary>
    public Guid ConcurrencyStamp { get; set; } = Guid.NewGuid();

    public ICollection<BookingExtra> Extras { get; set; } = new List<BookingExtra>();
    public Review? Review { get; set; }

    public bool IsActive => Status is not (BookingStatus.Cancelled or BookingStatus.Completed);
}

/// <summary>Snapshot of an add-on at the moment of booking, so later price changes don't rewrite history.</summary>
public class BookingExtra
{
    public Guid BookingId { get; set; }
    public Guid ExtraId { get; set; }
    public required string Name { get; set; }
    public decimal Price { get; set; }
    public int Minutes { get; set; }
}

public class Review
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid BookingId { get; set; }
    public Booking Booking { get; set; } = null!;
    public Guid CustomerId { get; set; }
    public User Customer { get; set; } = null!;
    public Guid? CleanerId { get; set; }
    public int Rating { get; set; }
    public string? Comment { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}
