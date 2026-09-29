using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Pristine.Api.Common;
using Pristine.Api.Features.Audit;
using Pristine.Api.Features.Auth;
using Pristine.Api.Security;

namespace Pristine.Api.Controllers;

/// <summary>Registration, sign-in and session management.</summary>
[ApiController]
[Route("api/auth")]
[Produces("application/json")]
public sealed class AuthController(IAuthService auth) : ControllerBase
{
    public const string RefreshCookie = "pristine_rt";

    /// <summary>Create a customer account and start a session.</summary>
    /// <remarks>Self-registration always creates a <c>Customer</c>; roles can only be granted by an admin.</remarks>
    [HttpPost("register")]
    [EnableRateLimiting(RateLimits.Auth)]
    [ProducesResponseType<AuthResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest request, CancellationToken ct)
    {
        var result = await auth.RegisterAsync(request, ClientIp, ct);
        SetRefreshCookie(result);
        return CreatedAtAction(nameof(Me), result.Response);
    }

    /// <summary>Sign in with email and password.</summary>
    /// <remarks>
    /// Returns a short-lived JWT access token. A rotating refresh token is set as an
    /// <c>HttpOnly; Secure; SameSite=Strict</c> cookie. After 5 failed attempts the account is locked for 15 minutes.
    /// </remarks>
    [HttpPost("login")]
    [EnableRateLimiting(RateLimits.Auth)]
    [ProducesResponseType<AuthResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request, CancellationToken ct)
    {
        var result = await auth.LoginAsync(request, ClientIp, ct);
        SetRefreshCookie(result);
        return Ok(result.Response);
    }

    /// <summary>Exchange the refresh-token cookie for a new access token (token rotation).</summary>
    /// <remarks>Re-using an already rotated refresh token revokes the whole session family.</remarks>
    [HttpPost("refresh")]
    [EnableRateLimiting(RateLimits.Auth)]
    [ProducesResponseType<AuthResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<AuthResponse>> Refresh(CancellationToken ct)
    {
        if (!Request.Cookies.TryGetValue(RefreshCookie, out var token) || string.IsNullOrEmpty(token))
            throw new UnauthorizedException("Session expired. Please sign in again.");

        try
        {
            var result = await auth.RefreshAsync(token, ClientIp, ct);
            SetRefreshCookie(result);
            return Ok(result.Response);
        }
        catch (UnauthorizedException)
        {
            ClearRefreshCookie();
            throw;
        }
    }

    /// <summary>End the current session and revoke its refresh tokens.</summary>
    [HttpPost("logout")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Logout(CancellationToken ct)
    {
        Request.Cookies.TryGetValue(RefreshCookie, out var token);
        await auth.LogoutAsync(token, ct);
        ClearRefreshCookie();
        return NoContent();
    }

    /// <summary>Get the signed-in user's profile.</summary>
    [Authorize]
    [HttpGet("me")]
    [ProducesResponseType<UserDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public Task<UserDto> Me(CancellationToken ct) => auth.GetProfileAsync(Actor.From(User).UserId, ct);

    private string? ClientIp => HttpContext.ClientIp();

    private void SetRefreshCookie(AuthResult result) =>
        Response.Cookies.Append(RefreshCookie, result.RefreshToken, CookieOptions(result.RefreshExpiresAtUtc));

    private void ClearRefreshCookie() => Response.Cookies.Delete(RefreshCookie, CookieOptions(null));

    private static CookieOptions CookieOptions(DateTime? expires) => new()
    {
        HttpOnly = true,          // not readable from JavaScript, so XSS cannot steal it
        Secure = true,            // HTTPS only (browsers treat localhost as secure)
        SameSite = SameSiteMode.Strict, // never sent on cross-site requests, which blocks CSRF
        Path = "/api/auth",       // only sent to the endpoints that need it
        Expires = expires,
        IsEssential = true
    };
}
