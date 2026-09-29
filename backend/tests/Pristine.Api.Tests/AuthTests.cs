using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Pristine.Api.Tests;

public sealed class AuthTests(PristineApiFactory factory) : IClassFixture<PristineApiFactory>
{
    [Fact]
    public async Task Register_ignores_role_in_payload_and_creates_customer()
    {
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email = "eve@example.com",
            password = "Str0ng#Password",
            fullName = "Eve Adams",
            role = "Admin" // mass-assignment attempt
        });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Customer", body.GetProperty("user").GetProperty("role").GetString());
    }

    [Theory]
    [InlineData("short1!A")]
    [InlineData("alllowercase1!")]
    [InlineData("NoDigitsHere!!")]
    [InlineData("NoSpecials1234")]
    public async Task Register_rejects_weak_passwords(string password)
    {
        using var client = factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/register",
            new { email = $"{Guid.NewGuid():N}@example.com", password, fullName = "Weak Password" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Login_failure_does_not_reveal_whether_account_exists()
    {
        using var client = factory.CreateClient();

        var unknown = await client.PostAsJsonAsync("/api/auth/login", new { email = "nobody@example.com", password = "Whatever#123" });
        var wrongPassword = await client.PostAsJsonAsync("/api/auth/login", new { email = "customer@pristine.demo", password = "Wrong#Pass123" });

        Assert.Equal(HttpStatusCode.Unauthorized, unknown.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, wrongPassword.StatusCode);
        var a = await unknown.Content.ReadFromJsonAsync<JsonElement>();
        var b = await wrongPassword.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(a.GetProperty("detail").GetString(), b.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Account_is_locked_after_five_failed_attempts()
    {
        using var client = factory.CreateClient();
        const string email = "locked@example.com";
        const string password = "Corr3ct#Password";
        (await client.PostAsJsonAsync("/api/auth/register", new { email, password, fullName = "Lock Test" })).EnsureSuccessStatusCode();

        for (var i = 0; i < 5; i++)
            await client.PostAsJsonAsync("/api/auth/login", new { email, password = "Wrong#Password1" });

        // Even the correct password is refused while the lockout is active.
        var response = await client.PostAsJsonAsync("/api/auth/login", new { email, password });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Refresh_token_is_rotated_and_reuse_revokes_the_session()
    {
        using var client = factory.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/login",
            new { email = "cleaner@pristine.demo", password = PristineApiFactory.DemoPassword });
        var original = ExtractRefreshCookie(login);

        Assert.Contains("httponly", login.Headers.GetValues("Set-Cookie").Single().ToLowerInvariant());
        Assert.Contains("samesite=strict", login.Headers.GetValues("Set-Cookie").Single().ToLowerInvariant());

        var first = await RefreshAsync(client, original);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var rotated = ExtractRefreshCookie(first);
        Assert.NotEqual(original, rotated);

        // Replaying the old token is treated as theft: rejected, and the new token dies with it.
        Assert.Equal(HttpStatusCode.Unauthorized, (await RefreshAsync(client, original)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await RefreshAsync(client, rotated)).StatusCode);
    }

    [Fact]
    public async Task Tampered_jwt_is_rejected()
    {
        var token = await factory.LoginAsync("customer@pristine.demo");
        var parts = token.Split('.');
        // Forge the payload to claim the Admin role while keeping the original signature.
        var payload = JsonSerializer.Deserialize<Dictionary<string, object>>(Base64UrlDecode(parts[1]))!;
        payload["role"] = "Admin";
        var forged = $"{parts[0]}.{Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(payload))}.{parts[2]}";

        using var client = factory.CreateClient(forged);
        var response = await client.GetAsync("/api/admin/dashboard");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    private static async Task<HttpResponseMessage> RefreshAsync(HttpClient client, string token)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/refresh");
        request.Headers.Add("Cookie", $"pristine_rt={token}");
        return await client.SendAsync(request);
    }

    private static string ExtractRefreshCookie(HttpResponseMessage response)
    {
        var cookie = response.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith("pristine_rt="));
        return cookie["pristine_rt=".Length..cookie.IndexOf(';')];
    }

    private static byte[] Base64UrlDecode(string s) =>
        Convert.FromBase64String(s.Replace('-', '+').Replace('_', '/').PadRight(s.Length + (4 - s.Length % 4) % 4, '='));

    private static string Base64UrlEncode(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
