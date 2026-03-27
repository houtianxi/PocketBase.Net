namespace PocketbaseNet.Api.Domain.Entities;

/// <summary>
/// Represents a relation configuration for Relation-type fields
/// </summary>
public class FieldRelation
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Foreign key to the Relation-type Field</summary>
    public Guid FieldId { get; set; }

    /// <summary>Foreign key to the target CollectionDefinition</summary>
    public Guid RelatedCollectionId { get; set; }

    /// <summary>Type of relation: OneToMany or ManyToMany</summary>
    public RelationType RelationType { get; set; } = RelationType.OneToMany;

    /// <summary>For many-to-many, whether to use a join table</summary>
    public bool IsViaJoinTable { get; set; }

    /// <summary>Join table name (for m-m relations)</summary>
    public string? JoinTableName { get; set; }

    /// <summary>Cascade delete related records</summary>
    public bool CascadeDelete { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    // Navigation properties
    public Field? Field { get; set; }
    public CollectionDefinition? RelatedCollection { get; set; }
}

/// <summary>
/// Type of relation between fields
/// </summary>
public enum RelationType
{
    /// <summary>One to Many (1-n)</summary>
    OneToMany = 1,

    /// <summary>Many to Many (m-m)</summary>
    ManyToMany = 2
}
