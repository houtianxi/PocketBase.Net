namespace PocketbaseNet.Api.Domain.Entities;

/// <summary>
/// Represents a third-party API key for external application access.
/// The raw key is shown only once on creation; only the SHA-256 hash is stored.
/// Key format displayed to user: pbn_XXXXXXXXXXXXXXXX (prefix 12 hex chars + secret)
/// </summary>
public class AppApiKey
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Application / project name given by admin.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Purpose or notes about this key.</summary>
    public string? Description { get; set; }

    /// <summary>Contact person name.</summary>
    public string OwnerName { get; set; } = string.Empty;

    /// <summary>Contact email (optional).</summary>
    public string? OwnerEmail { get; set; }

    /// <summary>First 12 hex characters of the key — stored in plain text for fast lookup.</summary>
    public string KeyPrefix { get; set; } = string.Empty;

    /// <summary>SHA-256 hash of the full key value.</summary>
    public string SecretHash { get; set; } = string.Empty;

    /// <summary>
    /// Comma-separated list of allowed scopes: list, view, create, update, delete.
    /// Empty = all scopes allowed.
    /// </summary>
    public string Scopes { get; set; } = "list,view,create,update,delete";

    /// <summary>
    /// JSON array of collection slugs this key is allowed to access.
    /// Empty JSON array "[]" = all collections.
    /// </summary>
    public string AllowedCollectionsJson { get; set; } = "[]";

    public bool IsActive { get; set; } = true;

    /// <summary>Null = never expires.</summary>
    public DateTimeOffset? ExpiresAt { get; set; }

    public DateTimeOffset? LastUsedAt { get; set; }

    /// <summary>The admin user who created this key.</summary>
    public string? CreatedByUserId { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
