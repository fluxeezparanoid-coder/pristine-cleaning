using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Pristine.Api.Tests;

public sealed class BookingTests(PristineApiFactory factory) : IClassFixture<PristineApiFactory>
{
    private static readonly TimeZoneInfo London = TimeZoneInfo.FindSystemTimeZoneById("Europe/London");

    [Fact]
    public async Task Anonymous_users_cannot_book()
    {
        using var client = factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/bookings", new { });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Price_is_calculated_on_the_server_and_cannot_be_tampered_with()
    {
        using var client = factory.CreateClient(await factory.LoginAsync("customer@pristine.demo"));
        var service = await FirstServiceAsync(client);

        var quote = await (await client.PostAsJsonAsync("/api/quotes",
            new { serviceId = service, bedrooms = 2, bathrooms = 1, frequency = "OneTime" })).Content.ReadFromJsonAsync<JsonElement>();

        var response = await client.PostAsJsonAsync("/api/bookings", NewBooking(service, FutureSlot(40, 9), bedrooms: 2) with
        {
            Total = 0.01m, Discount = 999m // fields a malicious client might try to inject
        });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var booking = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(quote.GetProperty("total").GetDecimal(), booking.GetProperty("total").GetDecimal());
    }

    [Fact]
    public async Task Customers_cannot_see_or_modify_other_customers_bookings()
    {
        using var owner = factory.CreateClient(await factory.LoginAsync("customer@pristine.demo"));
        var service = await FirstServiceAsync(owner);
        var created = await owner.PostAsJsonAsync("/api/bookings", NewBooking(service, FutureSlot(41, 10)));
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString();

        using var anon = factory.CreateClient();
        await anon.PostAsJsonAsync("/api/auth/register",
            new { email = "attacker@example.com", password = "Att4cker#Pass", fullName = "Attacker" });
        using var attacker = factory.CreateClient(await factory.LoginAsync("attacker@example.com", "Att4cker#Pass"));

        Assert.Equal(HttpStatusCode.NotFound, (await attacker.GetAsync($"/api/bookings/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await attacker.PostAsJsonAsync($"/api/bookings/{id}/cancel", new { })).StatusCode);
        var list = await attacker.GetFromJsonAsync<JsonElement>("/api/bookings");
        Assert.Equal(0, list.GetProperty("totalCount").GetInt32());
    }

    [Fact]
    public async Task A_slot_cannot_be_booked_more_times_than_there_are_cleaners()
    {
        using var client = factory.CreateClient(await factory.LoginAsync("customer@pristine.demo"));
        var service = await FirstServiceAsync(client);
        var slot = FutureSlot(44, 8);

        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 5; i++) // the demo team has 4 cleaners
            statuses.Add((await client.PostAsJsonAsync("/api/bookings", NewBooking(service, slot))).StatusCode);

        Assert.Equal(4, statuses.Count(s => s == HttpStatusCode.Created));
        Assert.Equal(HttpStatusCode.Conflict, statuses[^1]);
    }

    [Fact]
    public async Task Bookings_outside_business_rules_are_rejected()
    {
        using var client = factory.CreateClient(await factory.LoginAsync("customer@pristine.demo"));
        var service = await FirstServiceAsync(client);

        var past = await client.PostAsJsonAsync("/api/bookings", NewBooking(service, DateTime.UtcNow.AddDays(-1)));
        var night = await client.PostAsJsonAsync("/api/bookings", NewBooking(service, FutureSlot(42, 22)));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, past.StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, night.StatusCode);
    }

    [Fact]
    public async Task Job_lifecycle_follows_the_state_machine()
    {
        using var admin = factory.CreateClient(await factory.LoginAsync("admin@pristine.demo"));
        var upcoming = await admin.GetFromJsonAsync<JsonElement>("/api/bookings?status=Confirmed&upcoming=true&pageSize=1");
        var id = upcoming.GetProperty("items")[0].GetProperty("id").GetString();

        var skip = await admin.PatchAsJsonAsync($"/api/bookings/{id}/status", new { status = "Completed" });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, skip.StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await admin.PatchAsJsonAsync($"/api/bookings/{id}/status", new { status = "InProgress" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.PatchAsJsonAsync($"/api/bookings/{id}/status", new { status = "Completed" })).StatusCode);
    }

    [Fact]
    public async Task Customers_cannot_change_job_status()
    {
        using var client = factory.CreateClient(await factory.LoginAsync("customer@pristine.demo"));
        var mine = await client.GetFromJsonAsync<JsonElement>("/api/bookings?pageSize=1");
        var id = mine.GetProperty("items")[0].GetProperty("id").GetString();

        var response = await client.PatchAsJsonAsync($"/api/bookings/{id}/status", new { status = "Completed" });
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Search_is_safe_against_sql_injection()
    {
        using var admin = factory.CreateClient(await factory.LoginAsync("admin@pristine.demo"));
        var response = await admin.GetAsync("/api/bookings?search=' OR 1=1 --");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(0, body.GetProperty("totalCount").GetInt32());
    }

    private static async Task<Guid> FirstServiceAsync(HttpClient client)
    {
        var services = await client.GetFromJsonAsync<JsonElement>("/api/services");
        return services.EnumerateArray().First(s => s.GetProperty("slug").GetString() == "standard").GetProperty("id").GetGuid();
    }

    /// <summary>A working-day slot at the given local hour, <paramref name="daysAhead"/> days from now.</summary>
    private static DateTime FutureSlot(int daysAhead, int localHour)
    {
        var date = DateTime.UtcNow.Date.AddDays(daysAhead);
        while (date.DayOfWeek == DayOfWeek.Sunday) date = date.AddDays(1);
        return TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(date.AddHours(localHour), DateTimeKind.Unspecified), London);
    }

    private static BookingPayload NewBooking(Guid serviceId, DateTime startUtc, int bedrooms = 1) =>
        new(serviceId, bedrooms, 1, "OneTime", [], startUtc, new AddressPayload("1 Test Street", "London", "NW1 6XE"), null, null, null);

    private sealed record AddressPayload(string Street, string City, string PostalCode);

    private sealed record BookingPayload(
        Guid ServiceId, int Bedrooms, int Bathrooms, string Frequency, Guid[] ExtraIds, DateTime StartUtc,
        AddressPayload Address, string? AccessNotes, decimal? Total, decimal? Discount);
}
