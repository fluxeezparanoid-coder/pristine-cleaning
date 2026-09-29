namespace Pristine.Api.Security;

/// <summary>Adds defensive HTTP response headers (OWASP Secure Headers Project).</summary>
public sealed class SecurityHeadersMiddleware(RequestDelegate next)
{
    // Swagger UI needs inline scripts/styles, so it gets a relaxed policy; the JSON API gets a locked-down one.
    private const string ApiCsp = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";
    private const string SwaggerCsp =
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'";

    public Task InvokeAsync(HttpContext context)
    {
        context.Response.OnStarting(() =>
        {
            var headers = context.Response.Headers;
            headers["X-Content-Type-Options"] = "nosniff";
            headers["X-Frame-Options"] = "DENY";
            headers["Referrer-Policy"] = "no-referrer";
            headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()";
            headers["Cross-Origin-Opener-Policy"] = "same-origin";
            headers["Cross-Origin-Resource-Policy"] = "same-origin";
            headers["Content-Security-Policy"] =
                context.Request.Path.StartsWithSegments("/swagger") ? SwaggerCsp : ApiCsp;
            headers.Remove("Server");
            headers.Remove("X-Powered-By");

            if (context.Request.Path.StartsWithSegments("/api/auth"))
                headers.CacheControl = "no-store";

            return Task.CompletedTask;
        });

        return next(context);
    }
}
