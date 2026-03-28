namespace PocketbaseNet.Api.Contracts;

// ─── Requests ───────────────────────────────────────────────────────────────

public record ApiKeyCreateRequest(
    string Name,
    string OwnerName,
    string? OwnerEmail,
    string? Description,
    /// <summary>Comma-separated: list,view,create,update,delete. Null/empty = all.</summary>
    string? Scopes,
    /// <summary>Collection slugs to allow. Null/empty = all collections.</summary>
    List<string>? AllowedCollections,
    DateTimeOffset? ExpiresAt
);

public record ApiKeyUpdateRequest(
    string Name,
    string OwnerName,
    string? OwnerEmail,
    string? Description,
    string? Scopes,
    List<string>? AllowedCollections,
    DateTimeOffset? ExpiresAt,
    bool IsActive
);

// ─── Responses ──────────────────────────────────────────────────────────────

public record ApiKeyResponse(
    Guid Id,
    string Name,
    string OwnerName,
    string? OwnerEmail,
    string? Description,
    string KeyPrefix,
    List<string> Scopes,
    List<string> AllowedCollections,
    bool IsActive,
    DateTimeOffset? ExpiresAt,
    DateTimeOffset? LastUsedAt,
    string? CreatedByUserId,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt
);

/// <summary>Returned only once on creation — contains the raw key.</summary>
public record ApiKeyCreatedResponse(
    Guid Id,
    string Name,
    string KeyPrefix,
    /// <summary>Full raw key — show to user immediately, never stored.</summary>
    string RawKey,
    List<string> Scopes,
    List<string> AllowedCollections,
    bool IsActive,
    DateTimeOffset? ExpiresAt,
    DateTimeOffset CreatedAt
);
