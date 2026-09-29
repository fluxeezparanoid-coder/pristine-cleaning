using Pristine.Api.Data;
using Pristine.Api.Domain;

namespace Pristine.Api.Features.Audit;

public static class AuditActions
{
    public const string Registered = "auth.registered";
    public const string LoginSucceeded = "auth.login_succeeded";
    public const string LoginFailed = "auth.login_failed";
    public const string AccountLocked = "auth.account_locked";
    public const string TokenReuseDetected = "auth.refresh_token_reuse";
    public const string Logout = "auth.logout";
    public const string BookingCreated = "booking.created";
    public const string BookingCancelled = "booking.cancelled";
    public const string BookingStatusChanged = "booking.status_changed";
    public const string BookingAssigned = "booking.cleaner_assigned";
    public const string ReviewCreated = "review.created";
    public const string ServiceChanged = "catalog.service_changed";
    public const string UserChanged = "admin.user_changed";
}

public static class HttpContextExtensions
{
    /// <summary>Client IP after forwarded-header processing, with IPv4-mapped IPv6 addresses shown as plain IPv4.</summary>
    public static string? ClientIp(this HttpContext context)
    {
        var ip = context.Connection.RemoteIpAddress;
        return ip is null ? null : (ip.IsIPv4MappedToIPv6 ? ip.MapToIPv4() : ip).ToString();
    }
}

public interface IAuditService
{
    /// <summary>Queues an audit entry on the current unit of work; it is persisted with the next SaveChanges.</summary>
    void Record(string action, Guid? userId = null, string? email = null,
        string? entityType = null, string? entityId = null, string? details = null);
}

public sealed class AuditService(AppDbContext db, IHttpContextAccessor http, TimeProvider clock) : IAuditService
{
    public void Record(string action, Guid? userId = null, string? email = null,
        string? entityType = null, string? entityId = null, string? details = null)
    {
        var principal = http.HttpContext?.User;
        db.AuditLogs.Add(new AuditLog
        {
            Action = action,
            UserId = userId,
            UserEmail = email ?? principal?.FindFirst("email")?.Value,
            EntityType = entityType,
            EntityId = entityId,
            Details = details is { Length: > 1000 } ? details[..1000] : details,
            IpAddress = http.HttpContext?.ClientIp(),
            CreatedAtUtc = clock.GetUtcNow().UtcDateTime
        });
    }
}
