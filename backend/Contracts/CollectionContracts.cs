using PocketbaseNet.Api.Domain.Enums;

namespace PocketbaseNet.Api.Contracts;

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

public record PublishCollectionPreviewResponse(
    Guid CollectionId,
    string CollectionSlug,
    string TableName,
    string Status,
    string SqlScript,
    string SchemaHash,
    DateTimeOffset RequestedAt,
    string? Message,
    IReadOnlyList<PublishPlanItemResponse> PlanItems);

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
