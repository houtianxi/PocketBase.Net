using System.Text.Json;
using PocketbaseNet.Api.Domain.Enums;

namespace PocketbaseNet.Api.Contracts;

public record FieldResponse(
    Guid Id,
    Guid CollectionDefinitionId,
    string Name,
    string Label,
    FieldType Type,
    bool IsRequired,
    bool IsUnique,
    string? DefaultValue,
    JsonElement Config,
    string? ValidationRules,
    int DisplayOrder,
    bool IsSystem,
    string? Description,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt
);

public record FieldCreateRequest(
    string Name,
    string Label,
    FieldType Type,
    bool IsRequired = false,
    bool IsUnique = false,
    string? DefaultValue = null,
    string? Config = null,
    string? ValidationRules = null,
    int DisplayOrder = 0,
    string? Description = null
);

public record FieldUpdateRequest(
    string Name,
    string Label,
    FieldType Type,
    bool IsRequired,
    bool IsUnique,
    string? DefaultValue,
    string? Config = null,
    string? ValidationRules = null,
    int DisplayOrder = 0,
    string? Description = null
);

public record FieldOptionResponse(
    Guid Id,
    Guid FieldId,
    string Value,
    string Label,
    int DisplayOrder,
    string? Color
);

public record FieldOptionCreateRequest(
    string Value,
    string Label,
    int DisplayOrder = 0,
    string? Color = null
);

public record FieldRelationResponse(
    Guid Id,
    Guid FieldId,
    Guid RelatedCollectionId,
    RelationType RelationType,
    bool IsViaJoinTable,
    string? JoinTableName,
    bool CascadeDelete
);

public record FieldRelationCreateRequest(
    Guid RelatedCollectionId,
    RelationType RelationType,
    bool CascadeDelete = false
);

public record FieldTypeDefinition(
    FieldType Type,
    string Name,
    string Description,
    bool SupportsOptions,
    bool SupportsRelation,
    bool SupportsValidation,
    string[] AllowedConfigs
);

public enum RelationType
{
    OneToMany = 1,
    ManyToMany = 2
}
