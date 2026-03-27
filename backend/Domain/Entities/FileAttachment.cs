namespace PocketbaseNet.Api.Domain.Entities;

/// <summary>
/// File attachment entity for storing file metadata and references
/// </summary>
public class FileAttachment
{
    public Guid Id { get; set; }
    
    /// <summary>
    /// The ID of the record this file belongs to
    /// </summary>
    public string RecordId { get; set; } = string.Empty;
    
    /// <summary>
    /// The ID of the collection this record belongs to
    /// </summary>
    public string CollectionSlug { get; set; } = string.Empty;
    
    /// <summary>
    /// The field name this file is attached to
    /// </summary>
    public string FieldName { get; set; } = string.Empty;
    
    /// <summary>
    /// Original file name
    /// </summary>
    public string OriginalFileName { get; set; } = string.Empty;
    
    /// <summary>
    /// Stored file name (UUID-based to avoid conflicts)
    /// </summary>
    public string StoredFileName { get; set; } = string.Empty;
    
    /// <summary>
    /// MIME type of the file
    /// </summary>
    public string MimeType { get; set; } = string.Empty;
    
    /// <summary>
    /// File size in bytes
    /// </summary>
    public long FileSize { get; set; }
    
    /// <summary>
    /// URL path to access the file
    /// </summary>
    public string Url { get; set; } = string.Empty;
    
    /// <summary>
    /// Is this file deleted/soft deleted
    /// </summary>
    public bool IsDeleted { get; set; }
    
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
