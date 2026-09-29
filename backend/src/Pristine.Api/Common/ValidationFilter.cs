using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Pristine.Api.Common;

/// <summary>
/// Runs the registered FluentValidation validator for every action argument
/// and short-circuits with a 400 ValidationProblemDetails before the controller executes.
/// </summary>
public sealed class ValidationFilter(IServiceProvider services) : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        foreach (var argument in context.ActionArguments.Values)
        {
            if (argument is null) continue;

            var validatorType = typeof(IValidator<>).MakeGenericType(argument.GetType());
            if (services.GetService(validatorType) is not IValidator validator) continue;

            var result = await validator.ValidateAsync(
                new ValidationContext<object>(argument), context.HttpContext.RequestAborted);
            if (result.IsValid) continue;

            var errors = result.Errors
                .GroupBy(e => ToCamelCase(e.PropertyName))
                .ToDictionary(g => g.Key, g => g.Select(e => e.ErrorMessage).Distinct().ToArray());

            context.Result = new BadRequestObjectResult(new ValidationProblemDetails(errors)
            {
                Title = "One or more validation errors occurred.",
                Status = StatusCodes.Status400BadRequest
            });
            return;
        }

        await next();
    }

    /// <summary>"Address.PostalCode" → "address.postalCode", matching the JSON the client sent.</summary>
    private static string ToCamelCase(string name) =>
        string.Join('.', name.Split('.').Select(part =>
            string.IsNullOrEmpty(part) ? part : char.ToLowerInvariant(part[0]) + part[1..]));
}
