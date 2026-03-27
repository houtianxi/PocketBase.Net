using System.Text.Json;
using PocketbaseNet.Api.Domain.Enums;

namespace PocketbaseNet.Api.Domain.Entities;

/// <summary>
/// Represents a field definition within a collection
/// </summary>
public class Field
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Foreign key to CollectionDefinition</summary>
    public Guid CollectionDefinitionId { get; set; }

    /// <summary>Field name (used in API and database)</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>Display label for UI</summary>
    public string Label { get; set; } = string.Empty;

    /// <summary>Field type (Text, Email, Number, etc.)</summary>
    public FieldType Type { get; set; } = FieldType.Text;

    /// <summary>Whether the field is required</summary>
    public bool IsRequired { get; set; }

    /// <summary>Whether the field must be unique</summary>
    public bool IsUnique { get; set; }

    /// <summary>Default value as JSON string</summary>
    public string? DefaultValue { get; set; }

    /// <summary>Field-specific configuration (options list, relation config, etc.)</summary>
    public JsonElement Config { get; set; }

    /// <summary>Validation rules as JSON (pattern, min, max, etc.)</summary>
    public string? ValidationRules { get; set; }

    /// <summary>Display order in forms and tables</summary>
    public int DisplayOrder { get; set; }

    /// <summary>Whether this is a system field (id, created, updated) - cannot be deleted</summary>
    public bool IsSystem { get; set; }

    /// <summary>User-provided description</summary>
    public string? Description { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    // Navigation property
    public CollectionDefinition? CollectionDefinition { get; set; }
    public ICollection<FieldOption> Options { get; set; } = new List<FieldOption>();
    public ICollection<FieldRelation> Relations { get; set; } = new List<FieldRelation>();
}
