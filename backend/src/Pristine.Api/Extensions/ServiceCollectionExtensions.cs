using System.Reflection;
using System.Text;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using FluentValidation;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;
using Pristine.Api.Common;
using Pristine.Api.Data;
using Pristine.Api.Features.Admin;
using Pristine.Api.Features.Audit;
using Pristine.Api.Features.Auth;
using Pristine.Api.Features.Bookings;
using Pristine.Api.Features.Catalog;
using Pristine.Api.Features.Pricing;
using Pristine.Api.Features.Reviews;
using Pristine.Api.Features.Scheduling;
using Pristine.Api.Security;

namespace Pristine.Api.Extensions;

public static class ServiceCollectionExtensions
{
    public const string CorsPolicy = "frontend";

    public static IServiceCollection AddPersistence(this IServiceCollection services, IConfiguration config)
    {
        var provider = config["Database:Provider"] ?? "Postgres";
        var connection = config.GetConnectionString("Default")
                         ?? throw new InvalidOperationException("ConnectionStrings:Default is not configured.");

        services.AddDbContext<AppDbContext>(options =>
        {
            if (provider.Equals("Sqlite", StringComparison.OrdinalIgnoreCase))
                options.UseSqlite(connection);
            else
                options.UseNpgsql(connection);
        });

        services.AddOptions<SeedOptions>().Bind(config.GetSection(SeedOptions.Section));
        services.AddScoped<DbSeeder>();
        services.AddHealthChecks().AddDbContextCheck<AppDbContext>("database");
        return services;
    }

    public static IServiceCollection AddApplication(this IServiceCollection services, IConfiguration config)
    {
        services.AddSingleton(TimeProvider.System);
        services.AddHttpContextAccessor();

        services.AddOptions<SchedulingOptions>().Bind(config.GetSection(SchedulingOptions.Section));

        services.AddScoped<IAuditService, AuditService>();
        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<ICatalogService, CatalogService>();
        services.AddScoped<IPricingService, PricingService>();
        services.AddScoped<IAvailabilityService, AvailabilityService>();
        services.AddScoped<IBookingService, BookingService>();
        services.AddScoped<IReviewService, ReviewService>();
        services.AddScoped<IAdminService, AdminService>();

        services.AddValidatorsFromAssemblyContaining<Program>();

        services.AddControllers(o => o.Filters.Add<ValidationFilter>())
            .AddJsonOptions(o =>
            {
                o.AllowInputFormatterExceptionMessages = false; // don't echo internal type names back to clients
                o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
                o.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.Never;
            });

        services.AddProblemDetails(o => o.CustomizeProblemDetails = ctx =>
            ctx.ProblemDetails.Extensions["traceId"] = ctx.HttpContext.TraceIdentifier);
        services.AddExceptionHandler<GlobalExceptionHandler>();
        return services;
    }

    public static IServiceCollection AddSecurity(this IServiceCollection services, IConfiguration config, IHostEnvironment env)
    {
        services.AddOptions<JwtOptions>()
            .Bind(config.GetSection(JwtOptions.Section))
            .ValidateDataAnnotations()
            .Validate(o => env.IsDevelopment() || env.IsEnvironment("Testing") || !o.SigningKey.Contains("dev-only"),
                "The development JWT signing key must not be used outside Development.")
            .ValidateOnStart();

        services.AddSingleton<IPasswordHasher, BCryptPasswordHasher>();
        services.AddSingleton<ITokenService, TokenService>();

        var jwt = config.GetSection(JwtOptions.Section).Get<JwtOptions>() ?? new JwtOptions();
        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(o =>
            {
                o.MapInboundClaims = false;
                o.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = jwt.Issuer,
                    ValidateAudience = true,
                    ValidAudience = jwt.Audience,
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.SigningKey)),
                    ValidAlgorithms = [SecurityAlgorithms.HmacSha256], // blocks "alg: none" and algorithm confusion
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromSeconds(30),
                    NameClaimType = "name",
                    RoleClaimType = "role"
                };
            });

        services.AddAuthorizationBuilder()
            .AddPolicy(Policies.Admin, p => p.RequireRole("Admin"))
            .AddPolicy(Policies.Staff, p => p.RequireRole("Admin", "Cleaner"))
            .AddPolicy(Policies.Customer, p => p.RequireRole("Customer"));

        services.AddCors(o => o.AddPolicy(CorsPolicy, p => p
            .WithOrigins(config.GetSection("Cors:Origins").Get<string[]>() ?? [])
            .WithMethods("GET", "POST", "PUT", "PATCH", "DELETE")
            .WithHeaders("Authorization", "Content-Type")
            .AllowCredentials()));

        var authLimit = config.GetValue("RateLimiting:AuthPermitLimit", 10);
        var publicLimit = config.GetValue("RateLimiting:PublicPermitLimit", 120);
        var globalLimit = config.GetValue("RateLimiting:GlobalPermitLimit", 600);

        services.AddRateLimiter(o =>
        {
            o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            o.OnRejected = async (ctx, ct) =>
            {
                if (ctx.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retry))
                    ctx.HttpContext.Response.Headers.RetryAfter = ((int)retry.TotalSeconds).ToString();
                await ctx.HttpContext.Response.WriteAsJsonAsync(new
                {
                    title = "Too Many Requests",
                    status = 429,
                    detail = "You're doing that too often. Please wait a moment and try again."
                }, ct);
            };

            o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
                RateLimitPartition.GetFixedWindowLimiter(ClientKey(ctx),
                    _ => new FixedWindowRateLimiterOptions { PermitLimit = globalLimit, Window = TimeSpan.FromMinutes(1) }));

            o.AddPolicy(RateLimits.Auth, ctx =>
                RateLimitPartition.GetFixedWindowLimiter(ClientKey(ctx),
                    _ => new FixedWindowRateLimiterOptions { PermitLimit = authLimit, Window = TimeSpan.FromMinutes(1) }));

            o.AddPolicy(RateLimits.Public, ctx =>
                RateLimitPartition.GetSlidingWindowLimiter(ClientKey(ctx),
                    _ => new SlidingWindowRateLimiterOptions
                    {
                        PermitLimit = publicLimit, Window = TimeSpan.FromMinutes(1), SegmentsPerWindow = 6
                    }));
        });

        return services;
    }

    public static IServiceCollection AddSwagger(this IServiceCollection services)
    {
        services.AddEndpointsApiExplorer();
        services.AddSwaggerGen(c =>
        {
            c.SwaggerDoc("v1", new OpenApiInfo
            {
                Title = "Pristine Cleaning API",
                Version = "v1",
                Description = """
                    Booking platform for a residential & commercial cleaning company.

                    **Try it:** call `POST /api/auth/login` with a demo account, copy `accessToken`,
                    click **Authorize** and paste it.

                    | Role | Email | Password |
                    |---|---|---|
                    | Admin | admin@pristine.demo | Demo#Pass2026 |
                    | Cleaner | cleaner@pristine.demo | Demo#Pass2026 |
                    | Customer | customer@pristine.demo | Demo#Pass2026 |
                    """
            });

            c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
            {
                Type = SecuritySchemeType.Http,
                Scheme = "bearer",
                BearerFormat = "JWT",
                Description = "Paste the `accessToken` returned by /api/auth/login."
            });
            c.AddSecurityRequirement(doc => new OpenApiSecurityRequirement
            {
                [new OpenApiSecuritySchemeReference("Bearer", doc)] = []
            });

            var xml = Path.Combine(AppContext.BaseDirectory, $"{Assembly.GetExecutingAssembly().GetName().Name}.xml");
            if (File.Exists(xml)) c.IncludeXmlComments(xml);
        });
        return services;
    }

    /// <summary>Authenticated callers are limited per user, anonymous callers per IP address.</summary>
    private static string ClientKey(HttpContext ctx) =>
        ctx.User.FindFirst("sub")?.Value
        ?? ctx.ClientIp()
        ?? "unknown";
}
