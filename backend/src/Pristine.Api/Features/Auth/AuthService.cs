using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Pristine.Api.Common;
using Pristine.Api.Data;
using Pristine.Api.Domain;
using Pristine.Api.Features.Audit;
using Pristine.Api.Security;

namespace Pristine.Api.Features.Auth;

public interface IAuthService
{
    Task<AuthResult> RegisterAsync(RegisterRequest request, string? ip, CancellationToken ct);
    Task<AuthResult> LoginAsync(LoginRequest request, string? ip, CancellationToken ct);
    Task<AuthResult> RefreshAsync(string refreshToken, string? ip, CancellationToken ct);
    Task LogoutAsync(string? refreshToken, CancellationToken ct);
    Task<UserDto> GetProfileAsync(Guid userId, CancellationToken ct);
}

public sealed class AuthService(
    AppDbContext db,
    IPasswordHasher hasher,
    ITokenService tokens,
    IAuditService audit,
    IOptions<JwtOptions> jwt,
    TimeProvider clock) : IAuthService
{
    public const int MaxFailedAttempts = 5;
    public static readonly TimeSpan LockoutDuration = TimeSpan.FromMinutes(15);

    // One message for every failure mode so the endpoint cannot be used to enumerate accounts.
    private const string InvalidCredentials = "Invalid email or password.";

    private DateTime Now => clock.GetUtcNow().UtcDateTime;

    public async Task<AuthResult> RegisterAsync(RegisterRequest request, string? ip, CancellationToken ct)
    {
        var email = NormalizeEmail(request.Email);
        if (await db.Users.AnyAsync(u => u.Email == email, ct))
            throw new ConflictException("An account with this email already exists.");

        // Role is never taken from the request: self-registration always creates a customer.
        var user = new User
        {
            Email = email,
            PasswordHash = hasher.Hash(request.Password),
            FullName = request.FullName.Trim(),
            Phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim(),
            Role = UserRole.Customer,
            CreatedAtUtc = Now
        };

        db.Users.Add(user);
        audit.Record(AuditActions.Registered, user.Id, user.Email, nameof(User), user.Id.ToString());
        return await IssueTokensAsync(user, Guid.NewGuid(), ip, ct);
    }

    public async Task<AuthResult> LoginAsync(LoginRequest request, string? ip, CancellationToken ct)
    {
        var email = NormalizeEmail(request.Email);
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email, ct);

        if (user is null)
        {
            hasher.SimulateVerify(request.Password);
            audit.Record(AuditActions.LoginFailed, email: email, details: "Unknown account");
            await db.SaveChangesAsync(ct);
            throw new UnauthorizedException(InvalidCredentials);
        }

        if (user.IsLockedOut(Now))
        {
            hasher.SimulateVerify(request.Password);
            audit.Record(AuditActions.LoginFailed, user.Id, user.Email, details: "Account locked");
            await db.SaveChangesAsync(ct);
            throw new UnauthorizedException(
                "Too many failed attempts. Your account is temporarily locked, please try again later.");
        }

        if (!hasher.Verify(request.Password, user.PasswordHash) || !user.IsActive)
        {
            user.FailedLoginAttempts++;
            if (user.FailedLoginAttempts >= MaxFailedAttempts)
            {
                user.LockoutEndUtc = Now.Add(LockoutDuration);
                user.FailedLoginAttempts = 0;
                audit.Record(AuditActions.AccountLocked, user.Id, user.Email);
            }
            audit.Record(AuditActions.LoginFailed, user.Id, user.Email, details: "Invalid password");
            await db.SaveChangesAsync(ct);
            throw new UnauthorizedException(InvalidCredentials);
        }

        user.FailedLoginAttempts = 0;
        user.LockoutEndUtc = null;
        user.LastLoginAtUtc = Now;
        audit.Record(AuditActions.LoginSucceeded, user.Id, user.Email);
        return await IssueTokensAsync(user, Guid.NewGuid(), ip, ct);
    }

    public async Task<AuthResult> RefreshAsync(string refreshToken, string? ip, CancellationToken ct)
    {
        var hash = tokens.Hash(refreshToken);
        var stored = await db.RefreshTokens.Include(t => t.User)
            .FirstOrDefaultAsync(t => t.TokenHash == hash, ct)
            ?? throw new UnauthorizedException("Session expired. Please sign in again.");

        if (stored.RevokedAtUtc is not null)
        {
            // A token that was already rotated is being replayed. Assume theft and kill the whole session family.
            await RevokeFamilyAsync(stored.FamilyId, ct);
            audit.Record(AuditActions.TokenReuseDetected, stored.UserId, stored.User.Email,
                nameof(RefreshToken), stored.FamilyId.ToString());
            await db.SaveChangesAsync(ct);
            throw new UnauthorizedException("Session expired. Please sign in again.");
        }

        if (!stored.IsActive(Now) || !stored.User.IsActive)
            throw new UnauthorizedException("Session expired. Please sign in again.");

        return await IssueTokensAsync(stored.User, stored.FamilyId, ip, ct, rotated: stored);
    }

    public async Task LogoutAsync(string? refreshToken, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(refreshToken)) return;

        var hash = tokens.Hash(refreshToken);
        var stored = await db.RefreshTokens.Include(t => t.User).FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (stored is null) return;

        await RevokeFamilyAsync(stored.FamilyId, ct);
        audit.Record(AuditActions.Logout, stored.UserId, stored.User.Email);
        await db.SaveChangesAsync(ct);
    }

    public async Task<UserDto> GetProfileAsync(Guid userId, CancellationToken ct)
    {
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId && u.IsActive, ct)
                   ?? throw new NotFoundException();
        return ToDto(user);
    }

    private async Task<AuthResult> IssueTokensAsync(User user, Guid familyId, string? ip, CancellationToken ct,
        RefreshToken? rotated = null)
    {
        var (accessToken, accessExpires) = tokens.CreateAccessToken(user);
        var rawRefresh = tokens.CreateRefreshToken();

        var refresh = new RefreshToken
        {
            UserId = user.Id,
            TokenHash = tokens.Hash(rawRefresh),
            FamilyId = familyId,
            CreatedAtUtc = Now,
            ExpiresAtUtc = Now.AddDays(jwt.Value.RefreshTokenDays),
            CreatedByIp = ip
        };
        db.RefreshTokens.Add(refresh);

        if (rotated is not null)
        {
            rotated.RevokedAtUtc = Now;
            rotated.ReplacedByTokenId = refresh.Id;
        }

        await db.SaveChangesAsync(ct);
        return new AuthResult(new AuthResponse(accessToken, accessExpires, ToDto(user)), rawRefresh, refresh.ExpiresAtUtc);
    }

    private async Task RevokeFamilyAsync(Guid familyId, CancellationToken ct)
    {
        var active = await db.RefreshTokens
            .Where(t => t.FamilyId == familyId && t.RevokedAtUtc == null)
            .ToListAsync(ct);
        foreach (var token in active) token.RevokedAtUtc = Now;
    }

    public static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();

    public static UserDto ToDto(User u) => new(u.Id, u.Email, u.FullName, u.Phone, u.Role);
}
