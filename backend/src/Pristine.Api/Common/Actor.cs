using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Pristine.Api.Domain;

namespace Pristine.Api.Common;

/// <summary>The authenticated caller, resolved from the validated JWT claims.</summary>
public readonly record struct Actor(Guid UserId, UserRole Role)
{
    public bool IsAdmin => Role == UserRole.Admin;

    public static Actor From(ClaimsPrincipal user)
    {
        if (!Guid.TryParse(user.FindFirstValue(JwtRegisteredClaimNames.Sub), out var id) ||
            !Enum.TryParse<UserRole>(user.FindFirstValue("role"), out var role))
            throw new UnauthorizedException("Invalid access token.");

        return new Actor(id, role);
    }
}
