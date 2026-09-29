using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pristine.Api.Common;
using Pristine.Api.Features.Admin;
using Pristine.Api.Security;

namespace Pristine.Api.Controllers;

/// <summary>Back-office endpoints. Admin role required.</summary>
[ApiController]
[Authorize(Policies.Admin)]
[Route("api/admin")]
[Produces("application/json")]
public sealed class AdminController(IAdminService admin) : ControllerBase
{
    /// <summary>KPIs, revenue trend, service mix and team performance.</summary>
    [HttpGet("dashboard")]
    [ProducesResponseType<DashboardDto>(StatusCodes.Status200OK)]
    public Task<DashboardDto> Dashboard(CancellationToken ct) => admin.GetDashboardAsync(ct);

    /// <summary>Search users.</summary>
    [HttpGet("users")]
    [ProducesResponseType<PagedResult<AdminUserDto>>(StatusCodes.Status200OK)]
    public Task<PagedResult<AdminUserDto>> Users([FromQuery] UserQuery query, CancellationToken ct) =>
        admin.GetUsersAsync(query, ct);

    /// <summary>Change a user's role or disable the account. All of the user's sessions are revoked.</summary>
    [HttpPut("users/{id:guid}")]
    [ProducesResponseType<AdminUserDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<AdminUserDto> UpdateUser(Guid id, UpdateUserRequest request, CancellationToken ct) =>
        admin.UpdateUserAsync(id, request, Actor.From(User), ct);

    /// <summary>Lift a brute-force lockout.</summary>
    [HttpPost("users/{id:guid}/unlock")]
    [ProducesResponseType<AdminUserDto>(StatusCodes.Status200OK)]
    public Task<AdminUserDto> UnlockUser(Guid id, CancellationToken ct) =>
        admin.UnlockUserAsync(id, Actor.From(User), ct);

    /// <summary>Active cleaners with rating and workload, for manual assignment.</summary>
    [HttpGet("cleaners")]
    [ProducesResponseType<IReadOnlyList<CleanerOptionDto>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<CleanerOptionDto>> Cleaners(CancellationToken ct) => admin.GetCleanersAsync(ct);

    /// <summary>Security and business audit trail.</summary>
    [HttpGet("audit-logs")]
    [ProducesResponseType<PagedResult<AuditLogDto>>(StatusCodes.Status200OK)]
    public Task<PagedResult<AuditLogDto>> AuditLogs([FromQuery] AuditQuery query, CancellationToken ct) =>
        admin.GetAuditLogAsync(query, ct);
}
