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
