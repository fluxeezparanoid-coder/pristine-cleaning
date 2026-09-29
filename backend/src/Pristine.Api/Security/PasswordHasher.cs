namespace Pristine.Api.Security;

public interface IPasswordHasher
{
    string Hash(string password);
    bool Verify(string password, string hash);

    /// <summary>
    /// Burns the same CPU time as a real verification. Used when the account does not exist,
    /// so response timing cannot be used to enumerate registered emails.
    /// </summary>
    void SimulateVerify(string password);
}

/// <summary>BCrypt with a work factor of 12 (~250 ms per hash on modern hardware).</summary>
public sealed class BCryptPasswordHasher : IPasswordHasher
{
    private const int WorkFactor = 12;
    private static readonly string DummyHash = BCrypt.Net.BCrypt.HashPassword("dummy-password-for-timing", WorkFactor);

    public string Hash(string password) => BCrypt.Net.BCrypt.HashPassword(password, WorkFactor);

    public bool Verify(string password, string hash)
    {
        try
        {
            return BCrypt.Net.BCrypt.Verify(password, hash);
        }
        catch (BCrypt.Net.SaltParseException)
        {
            return false;
        }
    }

    public void SimulateVerify(string password) => BCrypt.Net.BCrypt.Verify(password, DummyHash);
}
