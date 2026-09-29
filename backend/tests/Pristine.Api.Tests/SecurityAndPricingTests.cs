using System.Net;
using Pristine.Api.Domain;
using Pristine.Api.Features.Pricing;

namespace Pristine.Api.Tests;

public sealed class SecurityTests(PristineApiFactory factory) : IClassFixture<PristineApiFactory>
{
    [Theory]
    [InlineData("/api/admin/dashboard")]
    [InlineData("/api/admin/users")]
    [InlineData("/api/admin/audit-logs")]
    public async Task Admin_endpoints_require_admin_role(string url)
    {
        using var anonymous = factory.CreateClient();
        using var customer = factory.CreateClient(await factory.LoginAsync("customer@pristine.demo"));
        using var cleaner = factory.CreateClient(await factory.LoginAsync("cleaner@pristine.demo"));
        using var admin = factory.CreateClient(await factory.LoginAsync("admin@pristine.demo"));

        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(url)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await customer.GetAsync(url)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await cleaner.GetAsync(url)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync(url)).StatusCode);
    }

    [Fact]
    public async Task Responses_carry_security_headers()
    {
        using var client = factory.CreateClient();
        var response = await client.GetAsync("/api/services");

        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("DENY", response.Headers.GetValues("X-Frame-Options").Single());
        Assert.Contains("default-src 'none'", response.Headers.GetValues("Content-Security-Policy").Single());
        Assert.False(response.Headers.Contains("Server"));
    }

    [Fact]
    public async Task Errors_do_not_leak_internal_details()
    {
        using var client = factory.CreateClient();
        var response = await client.PostAsync("/api/quotes",
            new StringContent("""{"serviceId":"not-a-guid","frequency":"Hourly"}""", System.Text.Encoding.UTF8, "application/json"));
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.DoesNotContain("Pristine.Api", body);
        Assert.DoesNotContain("   at ", body);
    }
}

public sealed class PricingTests
{
    private static readonly CleaningService Deep = new()
    {
        Slug = "deep", Name = "Deep Clean", Tagline = "", Description = "",
        BasePrice = 149, PricePerExtraBedroom = 28, PricePerExtraBathroom = 32,
        BaseMinutes = 210, MinutesPerExtraBedroom = 45, MinutesPerExtraBathroom = 45
    };

    [Fact]
    public void Base_price_covers_one_bedroom_and_one_bathroom()
    {
        var quote = PricingService.Calculate(Deep, [], 1, 1, CleaningFrequency.OneTime);
        Assert.Equal(149m, quote.Total);
        Assert.Equal(210, quote.DurationMinutes);
    }

    [Theory]
    [InlineData(CleaningFrequency.OneTime, 0)]
    [InlineData(CleaningFrequency.Monthly, 0.10)]
    [InlineData(CleaningFrequency.Biweekly, 0.15)]
    [InlineData(CleaningFrequency.Weekly, 0.20)]
    public void Recurring_cleans_are_discounted(CleaningFrequency frequency, double rate)
    {
        var quote = PricingService.Calculate(Deep, [], 3, 2, frequency);
        var subtotal = 149m + 2 * 28m + 32m;

        Assert.Equal(subtotal, quote.Subtotal);
        Assert.Equal(Math.Round(subtotal * (decimal)rate, 2), quote.Discount);
        Assert.Equal(quote.Subtotal - quote.Discount, quote.Total);
    }

    [Fact]
    public void Extras_add_price_and_duration_rounded_to_half_hours()
    {
        var oven = new Extra { Slug = "oven", Name = "Inside the oven", Price = 29, Minutes = 45 };
        var quote = PricingService.Calculate(Deep, [oven], 1, 1, CleaningFrequency.OneTime);

        Assert.Equal(178m, quote.Total);
        Assert.Equal(270, quote.DurationMinutes); // 210 + 45 = 255 → 270
        Assert.Contains(quote.Lines, l => l.Label == "Inside the oven" && l.Amount == 29m);
    }
}
