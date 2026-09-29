using FluentValidation;
using Pristine.Api.Domain;

namespace Pristine.Api.Features.Auth;

public record RegisterRequest(string Email, string Password, string FullName, string? Phone);

public record LoginRequest(string Email, string Password);

public record UserDto(Guid Id, string Email, string FullName, string? Phone, UserRole Role);

/// <summary>The access token goes in the body; the refresh token is only ever sent as an HttpOnly cookie.</summary>
public record AuthResponse(string AccessToken, DateTime ExpiresAtUtc, UserDto User);

/// <summary>Internal result carrying the raw refresh token to the controller, which writes the cookie.</summary>
public record AuthResult(AuthResponse Response, string RefreshToken, DateTime RefreshExpiresAtUtc);

public static class ValidationRules
{
    public const string NamePattern = @"^[\p{L}][\p{L} '\-.]{1,99}$";
    public const string PhonePattern = @"^\+?[0-9 ()\-]{7,20}$";

    public static IRuleBuilderOptions<T, string> StrongPassword<T>(this IRuleBuilder<T, string> rule) =>
        rule.NotEmpty()
            .MinimumLength(10).WithMessage("Password must be at least 10 characters long.")
            .MaximumLength(72).WithMessage("Password must be at most 72 characters long.") // BCrypt input limit
            .Matches("[a-z]").WithMessage("Password must contain a lowercase letter.")
            .Matches("[A-Z]").WithMessage("Password must contain an uppercase letter.")
            .Matches("[0-9]").WithMessage("Password must contain a digit.")
            .Matches("[^a-zA-Z0-9]").WithMessage("Password must contain a special character.");
}

public sealed class RegisterRequestValidator : AbstractValidator<RegisterRequest>
{
    public RegisterRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(254);
        RuleFor(x => x.Password).StrongPassword();
        RuleFor(x => x.Password)
            .Must((req, pwd) => req.Email is null || pwd is null ||
                                !pwd.Contains(req.Email.Split('@')[0], StringComparison.OrdinalIgnoreCase))
            .WithMessage("Password must not contain your email address.");
        RuleFor(x => x.FullName).NotEmpty().Matches(ValidationRules.NamePattern)
            .WithMessage("Please enter a valid name (letters, spaces, apostrophes and hyphens only).");
        RuleFor(x => x.Phone).Matches(ValidationRules.PhonePattern)
            .When(x => !string.IsNullOrWhiteSpace(x.Phone))
            .WithMessage("Please enter a valid phone number.");
    }
}

public sealed class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().MaximumLength(254);
        RuleFor(x => x.Password).NotEmpty().MaximumLength(128);
    }
}
