namespace PocketbaseNet.Api.Contracts;

public record FileAttachmentResponse(
    Guid Id,
    string RecordId,
    string CollectionSlug,
    string FieldName,
    string OriginalFileName,
    string MimeType,
    long FileSize,
    string Url,
    bool IsDeleted,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt
);

public record FileUploadRequest(
    string CollectionSlug,
    string RecordId,
    string FieldName,
    IFormFile File,
    bool IsImageOnly = false
);
