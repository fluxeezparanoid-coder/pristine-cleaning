using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Pristine.Api.Common;
using Pristine.Api.Data;
using Pristine.Api.Domain;
using Pristine.Api.Features.Audit;

namespace Pristine.Api.Features.Catalog;

public record ServiceDto(
    Guid Id, string Slug, string Name, string Tagline, string Description, string Icon,
    decimal BasePrice, decimal PricePerExtraBedroom, decimal PricePerExtraBathroom,
    int BaseMinutes, IReadOnlyList<string> Includes, bool IsPopular, bool IsActive, int SortOrder);

public record ExtraDto(Guid Id, string Slug, string Name, string Icon, decimal Price, int Minutes);

public record ServiceUpsertRequest(
    string Slug, string Name, string Tagline, string Description, string Icon,
    decimal BasePrice, decimal PricePerExtraBedroom, decimal PricePerExtraBathroom,
    int BaseMinutes, int MinutesPerExtraBedroom, int MinutesPerExtraBathroom,
    IReadOnlyList<string> Includes, bool IsPopular, bool IsActive, int SortOrder);

public sealed class ServiceUpsertRequestValidator : AbstractValidator<ServiceUpsertRequest>
{
    public ServiceUpsertRequestValidator()
    {
        RuleFor(x => x.Slug).NotEmpty().MaximumLength(64).Matches("^[a-z0-9]+(-[a-z0-9]+)*$")
            .WithMessage("Slug may only contain lowercase letters, digits and single hyphens.");
        RuleFor(x => x.Name).NotEmpty().MaximumLength(80);
        RuleFor(x => x.Tagline).NotEmpty().MaximumLength(160);
        RuleFor(x => x.Description).NotEmpty().MaximumLength(2000);
        RuleFor(x => x.Icon).NotEmpty().MaximumLength(40).Matches("^[a-z0-9-]+$");
        RuleFor(x => x.BasePrice).InclusiveBetween(1, 10_000);
        RuleFor(x => x.PricePerExtraBedroom).InclusiveBetween(0, 1_000);
        RuleFor(x => x.PricePerExtraBathroom).InclusiveBetween(0, 1_000);
        RuleFor(x => x.BaseMinutes).InclusiveBetween(30, 12 * 60);
        RuleFor(x => x.MinutesPerExtraBedroom).InclusiveBetween(0, 240);
        RuleFor(x => x.MinutesPerExtraBathroom).InclusiveBetween(0, 240);
        RuleFor(x => x.Includes).NotNull().Must(i => i.Count <= 12).WithMessage("At most 12 bullet points.");
        RuleForEach(x => x.Includes).NotEmpty().MaximumLength(120).Must(s => !s.Contains('|'))
            .WithMessage("Bullet points cannot contain the '|' character.");
        RuleFor(x => x.SortOrder).InclusiveBetween(0, 1000);
    }
}

public interface ICatalogService
{
    Task<IReadOnlyList<ServiceDto>> GetServicesAsync(bool includeInactive, CancellationToken ct);
    Task<ServiceDto> GetServiceAsync(string slug, CancellationToken ct);
    Task<IReadOnlyList<ExtraDto>> GetExtrasAsync(CancellationToken ct);
    Task<ServiceDto> CreateServiceAsync(ServiceUpsertRequest request, Actor actor, CancellationToken ct);
    Task<ServiceDto> UpdateServiceAsync(Guid id, ServiceUpsertRequest request, Actor actor, CancellationToken ct);
    Task DeactivateServiceAsync(Guid id, Actor actor, CancellationToken ct);
}

public sealed class CatalogService(AppDbContext db, IAuditService audit) : ICatalogService
{
    public async Task<IReadOnlyList<ServiceDto>> GetServicesAsync(bool includeInactive, CancellationToken ct)
    {
        var services = await db.Services.AsNoTracking()
            .Where(s => includeInactive || s.IsActive)
            .OrderBy(s => s.SortOrder).ThenBy(s => s.Name)
            .ToListAsync(ct);
        return services.Select(ToDto).ToList();
    }

    public async Task<ServiceDto> GetServiceAsync(string slug, CancellationToken ct)
    {
        var service = await db.Services.AsNoTracking().FirstOrDefaultAsync(s => s.Slug == slug && s.IsActive, ct)
                      ?? throw new NotFoundException("Service not found.");
        return ToDto(service);
    }

    public async Task<IReadOnlyList<ExtraDto>> GetExtrasAsync(CancellationToken ct) =>
        await db.Extras.AsNoTracking()
            .Where(e => e.IsActive)
            .OrderBy(e => e.Name)
            .Select(e => new ExtraDto(e.Id, e.Slug, e.Name, e.Icon, e.Price, e.Minutes))
            .ToListAsync(ct);

    public async Task<ServiceDto> CreateServiceAsync(ServiceUpsertRequest request, Actor actor, CancellationToken ct)
    {
        if (await db.Services.AnyAsync(s => s.Slug == request.Slug, ct))
            throw new ConflictException("A service with this slug already exists.");

        var service = new CleaningService { Slug = request.Slug, Name = request.Name, Tagline = request.Tagline, Description = request.Description };
        Apply(service, request);
        db.Services.Add(service);
        audit.Record(AuditActions.ServiceChanged, actor.UserId, entityType: nameof(CleaningService),
            entityId: service.Id.ToString(), details: $"Created '{service.Name}'");
        await db.SaveChangesAsync(ct);
        return ToDto(service);
    }

    public async Task<ServiceDto> UpdateServiceAsync(Guid id, ServiceUpsertRequest request, Actor actor, CancellationToken ct)
    {
        var service = await db.Services.FindAsync([id], ct) ?? throw new NotFoundException("Service not found.");
        if (await db.Services.AnyAsync(s => s.Slug == request.Slug && s.Id != id, ct))
            throw new ConflictException("A service with this slug already exists.");

        Apply(service, request);
        audit.Record(AuditActions.ServiceChanged, actor.UserId, entityType: nameof(CleaningService),
            entityId: service.Id.ToString(), details: $"Updated '{service.Name}'");
        await db.SaveChangesAsync(ct);
        return ToDto(service);
    }

    /// <summary>Services are soft-deleted: historic bookings keep pointing at them.</summary>
    public async Task DeactivateServiceAsync(Guid id, Actor actor, CancellationToken ct)
    {
        var service = await db.Services.FindAsync([id], ct) ?? throw new NotFoundException("Service not found.");
        service.IsActive = false;
        audit.Record(AuditActions.ServiceChanged, actor.UserId, entityType: nameof(CleaningService),
            entityId: service.Id.ToString(), details: $"Deactivated '{service.Name}'");
        await db.SaveChangesAsync(ct);
    }

    private static void Apply(CleaningService s, ServiceUpsertRequest r)
    {
        s.Slug = r.Slug;
        s.Name = r.Name.Trim();
        s.Tagline = r.Tagline.Trim();
        s.Description = r.Description.Trim();
        s.Icon = r.Icon;
        s.BasePrice = r.BasePrice;
        s.PricePerExtraBedroom = r.PricePerExtraBedroom;
        s.PricePerExtraBathroom = r.PricePerExtraBathroom;
        s.BaseMinutes = r.BaseMinutes;
        s.MinutesPerExtraBedroom = r.MinutesPerExtraBedroom;
        s.MinutesPerExtraBathroom = r.MinutesPerExtraBathroom;
        s.Includes = string.Join('|', r.Includes.Select(i => i.Trim()));
        s.IsPopular = r.IsPopular;
        s.IsActive = r.IsActive;
        s.SortOrder = r.SortOrder;
    }

    public static ServiceDto ToDto(CleaningService s) => new(
        s.Id, s.Slug, s.Name, s.Tagline, s.Description, s.Icon,
        s.BasePrice, s.PricePerExtraBedroom, s.PricePerExtraBathroom, s.BaseMinutes,
        s.Includes.Split('|', StringSplitOptions.RemoveEmptyEntries), s.IsPopular, s.IsActive, s.SortOrder);
}
