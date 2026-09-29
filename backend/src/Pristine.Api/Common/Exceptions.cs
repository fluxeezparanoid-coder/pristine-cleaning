namespace Pristine.Api.Common;

/// <summary>Base type for errors whose message is safe to show to API clients.</summary>
public abstract class AppException(string message, int statusCode, string title) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
    public string Title { get; } = title;
}

public sealed class NotFoundException(string message = "The requested resource was not found.")
    : AppException(message, StatusCodes.Status404NotFound, "Not Found");

public sealed class ConflictException(string message)
    : AppException(message, StatusCodes.Status409Conflict, "Conflict");

public sealed class ForbiddenException(string message = "You do not have access to this resource.")
    : AppException(message, StatusCodes.Status403Forbidden, "Forbidden");

public sealed class UnauthorizedException(string message)
    : AppException(message, StatusCodes.Status401Unauthorized, "Unauthorized");

public sealed class BusinessRuleException(string message)
    : AppException(message, StatusCodes.Status422UnprocessableEntity, "Business rule violated");
