using PocketbaseNet.Api.Domain.Enums;

namespace PocketbaseNet.Api.Domain.Entities;

public class CollectionDefinition
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string SchemaJson { get; set; } = "{}";

    public RuleAccessLevel ListRule { get; set; } = RuleAccessLevel.Authenticated;
    public RuleAccessLevel ViewRule { get; set; } = RuleAccessLevel.Authenticated;
    public RuleAccessLevel CreateRule { get; set; } = RuleAccessLevel.Authenticated;
    public RuleAccessLevel UpdateRule { get; set; } = RuleAccessLevel.Owner;
    public RuleAccessLevel DeleteRule { get; set; } = RuleAccessLevel.Owner;

    public string? OwnerField { get; set; } = "ownerId";
    public bool IsSystem { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    // Navigation properties
    public ICollection<EntityRecord> Records { get; set; } = new List<EntityRecord>();
    public ICollection<Field> Fields { get; set; } = new List<Field>();
}
