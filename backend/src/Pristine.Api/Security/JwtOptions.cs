using System.ComponentModel.DataAnnotations;

namespace Pristine.Api.Security;

public sealed class JwtOptions
{
    public const string Section = "Jwt";

    [Required] public string Issuer { get; init; } = "pristine-api";
    [Required] public string Audience { get; init; } = "pristine-web";

    /// <summary>HMAC-SHA256 signing key. Must be at least 256 bits and must come from a secret store in production.</summary>
    [Required, MinLength(32)] public string SigningKey { get; init; } = string.Empty;

    [Range(1, 60)] public int AccessTokenMinutes { get; init; } = 15;
    [Range(1, 90)] public int RefreshTokenDays { get; init; } = 7;
}
