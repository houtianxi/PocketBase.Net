namespace PocketbaseNet.Api.Domain.Entities;

/// <summary>
/// Represents an option in a Select-type field
/// </summary>
public class FieldOption
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Foreign key to Field</summary>
    public Guid FieldId { get; set; }

    /// <summary>Option value</summary>
    public string Value { get; set; } = string.Empty;

    /// <summary>Display label for the option</summary>
    public string Label { get; set; } = string.Empty;

    /// <summary>Display order</summary>
    public int DisplayOrder { get; set; }

    /// <summary>Optional color for UI rendering</summary>
    public string? Color { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    // Navigation property
    public Field? Field { get; set; }
}
