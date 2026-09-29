namespace Pristine.Api.Domain;

/// <summary>A cleaning package the company sells (e.g. Standard, Deep, Move-out).</summary>
public class CleaningService
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Slug { get; set; }
    public required string Name { get; set; }
    public required string Tagline { get; set; }
    public required string Description { get; set; }
    public string Icon { get; set; } = "sparkles";

    /// <summary>Price for a 1-bedroom / 1-bathroom home.</summary>
    public decimal BasePrice { get; set; }
    public decimal PricePerExtraBedroom { get; set; }
    public decimal PricePerExtraBathroom { get; set; }

    public int BaseMinutes { get; set; }
    public int MinutesPerExtraBedroom { get; set; }
    public int MinutesPerExtraBathroom { get; set; }

    /// <summary>Comma-separated bullet points shown on the marketing site.</summary>
    public string Includes { get; set; } = string.Empty;

    public bool IsPopular { get; set; }
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
}

/// <summary>Optional add-on that can be attached to any booking.</summary>
public class Extra
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Slug { get; set; }
    public required string Name { get; set; }
    public string Icon { get; set; } = "plus";
    public decimal Price { get; set; }
    public int Minutes { get; set; }
    public bool IsActive { get; set; } = true;
}
