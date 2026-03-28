using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PocketbaseNet.Api.Infrastructure;

namespace PocketbaseNet.Api.Infrastructure.Auth;

public static class ApiKeyDefaults
{
    public const string AuthenticationScheme = "ApiKey";
    public const string HeaderName = "X-API-Key";
    /// <summary>Claim that holds comma-separated scopes granted by the key.</summary>
    public const string ScopesClaim = "apikey:scopes";
    /// <summary>Claim that holds JSON array of allowed collection slugs (empty = all).</summary>
    public const string AllowedCollectionsClaim = "apikey:collections";
    public const string KeyIdClaim = "apikey:id";
}

public class ApiKeyAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    AppDbContext db)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue(ApiKeyDefaults.HeaderName, out var keyValues))
            return AuthenticateResult.NoResult();

        var rawKey = keyValues.FirstOrDefault();
        if (string.IsNullOrWhiteSpace(rawKey))
            return AuthenticateResult.NoResult();

        // Key format: pbn_XXXXXXXXXXXX (prefix 12 chars) + remaining secret
        if (!rawKey.StartsWith("pbn_", StringComparison.Ordinal) || rawKey.Length < 20)
            return AuthenticateResult.Fail("Invalid API key format.");

        var prefix = rawKey[4..16]; // chars 4–15 (12 chars)

        var apiKey = await db.ApiKeys
            .AsNoTracking()
            .FirstOrDefaultAsync(k => k.KeyPrefix == prefix);

        if (apiKey is null)
            return AuthenticateResult.Fail("Invalid API key.");

        if (!apiKey.IsActive)
            return AuthenticateResult.Fail("API key is disabled.");

        if (apiKey.ExpiresAt.HasValue && apiKey.ExpiresAt.Value < DateTimeOffset.UtcNow)
            return AuthenticateResult.Fail("API key has expired.");

        // Verify hash
        var hash = ComputeSha256(rawKey);
        if (!hash.Equals(apiKey.SecretHash, StringComparison.OrdinalIgnoreCase))
            return AuthenticateResult.Fail("Invalid API key.");

        // Update LastUsedAt without loading all columns
        await db.ApiKeys
            .Where(k => k.Id == apiKey.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(k => k.LastUsedAt, DateTimeOffset.UtcNow));

        var claims = new List<Claim>
        {
            new(ClaimTypes.Name, apiKey.Name),
            new(ClaimTypes.NameIdentifier, apiKey.Id.ToString()),
            new(ApiKeyDefaults.ScopesClaim, apiKey.Scopes ?? string.Empty),
            new(ApiKeyDefaults.AllowedCollectionsClaim, apiKey.AllowedCollectionsJson ?? "[]"),
            new(ApiKeyDefaults.KeyIdClaim, apiKey.Id.ToString()),
            // Give ApiKey users a special role so controllers can identify them
            new(ClaimTypes.Role, "ApiKey"),
        };

        var identity = new ClaimsIdentity(claims, ApiKeyDefaults.AuthenticationScheme);
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, ApiKeyDefaults.AuthenticationScheme);

        return AuthenticateResult.Success(ticket);
    }

    public static string ComputeSha256(string raw)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(raw));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    public static (string rawKey, string prefix, string hash) GenerateKey()
    {
        var randomBytes = RandomNumberGenerator.GetBytes(32);
        var keyBody = Convert.ToHexString(randomBytes).ToLowerInvariant(); // 64 hex chars
        var rawKey = "pbn_" + keyBody;                                     // total 68 chars
        var prefix = keyBody[..12];                                         // first 12 hex chars
        var hash = ComputeSha256(rawKey);
        return (rawKey, prefix, hash);
    }
}
