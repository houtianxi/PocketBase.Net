using PocketbaseNet.Api.Domain.Enums;

namespace PocketbaseNet.Api.Contracts;

/// <summary>Configuration for a Table field type - stores mapping to related collection</summary>
public record TableFieldConfig(
    string RelatedCollectionSlug,
    List<string> SelectedFields,
    string ParentKey = "Id",
    string ChildKey = "ParentId",
    bool OnDeleteCascade = true,
    string Mode = "create-only");

/// <summary>Metadata for a field - used when configuring table fields</summary>
public record FieldMetadata(
    string Name,
    string Label,
    int Type,
    bool IsRequired,
    bool IsUnique,
    bool IsSystem,
    string? Description);

/// <summary>Response containing all fields of a collection for selection/configuration</summary>
public record FieldsMetadataResponse(
    Guid CollectionId,
    string CollectionSlug,
    List<FieldMetadata> Fields);

public record CollectionUpsertRequest(
    string Name,
    string Slug,
    string Description,
    string SchemaJson,
    RuleAccessLevel ListRule,
    RuleAccessLevel ViewRule,
    RuleAccessLevel CreateRule,
    RuleAccessLevel UpdateRule,
    RuleAccessLevel DeleteRule,
    string? OwnerField);

public record CollectionResponse(
    Guid Id,
    string Name,
    string Slug,
    string Description,
    string SchemaJson,
    RuleAccessLevel ListRule,
    RuleAccessLevel ViewRule,
    RuleAccessLevel CreateRule,
    RuleAccessLevel UpdateRule,
    RuleAccessLevel DeleteRule,
    string? OwnerField,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public record PublishCollectionRequest(
    bool DryRun = false);

public record PublishPlanItemResponse(
    string Type,
    string Target,
    string Action,
    string Summary,
    string? Sql = null
);

/// <summary>Response for publish preview, including dependency warnings</summary>
public record PublishCollectionPreviewResponse(
    Guid CollectionId,
    string CollectionSlug,
    string TableName,
    string Status,
    string SqlScript,
    string SchemaHash,
    DateTimeOffset RequestedAt,
    string? Message,
    IReadOnlyList<PublishPlanItemResponse> PlanItems,
    List<string>? UnpublishedDependencies = null);

public record PublishCollectionEnqueueResponse(
    Guid TaskId,
    Guid CollectionId,
    string CollectionSlug,
    string? HangfireJobId,
    string Status,
    DateTimeOffset CreatedAt);

public record CollectionPublishStatusResponse(
    Guid CollectionId,
    string? TableName,
    bool IsPublished,
    string? SchemaHash,
    DateTimeOffset? LastPublishedAt,
    int? LatestVersion,
    string? LatestStatus);

public record PublishTaskStatusResponse(
    Guid TaskId,
    Guid CollectionId,
    string CollectionSlug,
    string? HangfireJobId,
    string Status,
    int Progress,
    string? Message,
    string? SchemaHash,
    DateTimeOffset CreatedAt,
    DateTimeOffset? StartedAt,
    DateTimeOffset? FinishedAt,
    IReadOnlyList<PublishPlanItemResponse> PlanItems,
    string? SqlScript);

public record CollectionApiPreviewResponse(
    Guid CollectionId,
    string CollectionName,
    string CollectionSlug,
    IReadOnlyList<ApiPreviewEndpointResponse> Endpoints);

public record ApiPreviewEndpointResponse(
    string Key,
    string Label,
    string Method,
    string Url,
    string Summary,
    IReadOnlyList<ApiPreviewParameterResponse> Parameters,
    string? RequestBodyExample,
    string? RequestBodyDescription,
    string? RequestExample,
    string? ResponseExample,
    IReadOnlyList<string> Notes);

public record ApiPreviewParameterResponse(
    string Name,
    string Location,
    string Type,
    bool Required,
    string Description,
    string? Example = null,
    IReadOnlyList<string>? AllowedValues = null);
