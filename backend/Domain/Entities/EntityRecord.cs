namespace PocketbaseNet.Api.Domain.Entities;

public class EntityRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CollectionDefinitionId { get; set; }
    public CollectionDefinition? CollectionDefinition { get; set; }

    public string DataJson { get; set; } = "{}";
    public string? OwnerId { get; set; }
    public AppUser? Owner { get; set; }

    public string? CreatedById { get; set; }
    public string? UpdatedById { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
