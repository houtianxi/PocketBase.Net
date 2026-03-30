namespace PocketbaseNet.Api.Contracts;

public record RecordCreateRequest(Dictionary<string, object?> Data);
public record RecordUpdateRequest(Dictionary<string, object?> Data);
public record RecordGraphCreateRequest(
    Dictionary<string, object?> Data,
    Dictionary<string, List<Dictionary<string, object?>>>? Children);

public record RecordGraphCreateResponse(
    RecordResponse Parent,
    Dictionary<string, int> ChildrenCreated);

/// <summary>
/// Maps old JSON key names to new field names during a data-repair operation.
/// Use an empty string as the new key to simply delete the orphaned key.
/// </summary>
public record RepairDataRequest(Dictionary<string, string> KeyMap);

public record RecordResponse(
    Guid Id,
    Guid CollectionId,
    string CollectionSlug,
    Dictionary<string, object?> Data,
    string? OwnerId,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);
