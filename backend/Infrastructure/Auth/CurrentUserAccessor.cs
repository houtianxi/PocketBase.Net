using System.Security.Claims;

namespace PocketbaseNet.Api.Infrastructure.Auth;

public class CurrentUserAccessor(IHttpContextAccessor httpContextAccessor)
{
    private ClaimsPrincipal? User => httpContextAccessor.HttpContext?.User;

    public string? UserId => User?.FindFirstValue(ClaimTypes.NameIdentifier);
    public string? Email => User?.FindFirstValue(ClaimTypes.Email);
    public bool IsAuthenticated => User?.Identity?.IsAuthenticated ?? false;
    public bool IsAdmin => User?.IsInRole("Admin") ?? false;

    // ── ApiKey specific ──────────────────────────────────────────────────────
    public bool IsApiKey => User?.IsInRole("ApiKey") ?? false;

    public IReadOnlyList<string> ApiKeyScopes
    {
        get
        {
            var scopesValue = User?.FindFirstValue(ApiKeyDefaults.ScopesClaim) ?? string.Empty;
            if (string.IsNullOrWhiteSpace(scopesValue))
                return ["list", "view", "create", "update", "delete"];
            return scopesValue.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        }
    }

    public IReadOnlyList<string> ApiKeyAllowedCollections
    {
        get
        {
            var json = User?.FindFirstValue(ApiKeyDefaults.AllowedCollectionsClaim) ?? "[]";
            try
            {
                var list = System.Text.Json.JsonSerializer.Deserialize<List<string>>(json) ?? [];
                return list;
            }
            catch { return []; }
        }
    }

    public bool ApiKeyHasScope(string scope)
        => !IsApiKey || ApiKeyScopes.Contains(scope, StringComparer.OrdinalIgnoreCase);

    public bool ApiKeyCanAccessCollection(string collectionSlug)
    {
        if (!IsApiKey) return true;
        var allowed = ApiKeyAllowedCollections;
        return allowed.Count == 0 || allowed.Contains(collectionSlug, StringComparer.OrdinalIgnoreCase);
    }
}
