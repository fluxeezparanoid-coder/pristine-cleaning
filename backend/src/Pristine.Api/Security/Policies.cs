namespace Pristine.Api.Security;

public static class Policies
{
    public const string Admin = nameof(Admin);
    public const string Staff = nameof(Staff);
    public const string Customer = nameof(Customer);
}

public static class RateLimits
{
    /// <summary>Strict limit for credential endpoints to slow down brute-force and credential stuffing.</summary>
    public const string Auth = "auth";

    /// <summary>Limit for unauthenticated, CPU-heavy public endpoints (quotes, availability).</summary>
    public const string Public = "public";
}
