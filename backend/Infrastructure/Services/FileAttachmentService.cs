using Microsoft.EntityFrameworkCore;
using PocketbaseNet.Api.Domain.Entities;

namespace PocketbaseNet.Api.Infrastructure.Services;

public class FileAttachmentService
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;
    private const long MaxFileSize = 10 * 1024 * 1024; // 10MB
    private readonly string[] AllowedImageMimeTypes = { "image/jpeg", "image/png", "image/gif", "image/webp" };
    private readonly string[] AllowedMimeTypes = { "image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf", "text/plain", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };

    public FileAttachmentService(AppDbContext db, IWebHostEnvironment env)
    {
        _db = db;
        _env = env;
    }

    public async Task<FileAttachment> UploadFileAsync(string collectionSlug, string recordId, string fieldName, IFormFile file, bool isImageOnly = false)
    {
        // Validate file size
        if (file.Length > MaxFileSize)
            throw new InvalidOperationException($"File size exceeds maximum allowed size of {MaxFileSize / (1024 * 1024)}MB");

        // Validate MIME type
        var allowedTypes = isImageOnly ? AllowedImageMimeTypes : AllowedMimeTypes;
        if (!allowedTypes.Contains(file.ContentType?.ToLower() ?? ""))
            throw new InvalidOperationException($"File type '{file.ContentType}' is not allowed");

        // Ensure uploads directory
        var uploadsDir = Path.Combine(_env.ContentRootPath, "uploads", collectionSlug);
        Directory.CreateDirectory(uploadsDir);

        // Generate storage filename
        var storedFileName = $"{Guid.NewGuid()}{Path.GetExtension(file.FileName)}";
        var filePath = Path.Combine(uploadsDir, storedFileName);

        // Save file to disk
        using (var stream = new FileStream(filePath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }

        // Create database entry
        var attachment = new FileAttachment
        {
            Id = Guid.NewGuid(),
            RecordId = recordId,
            CollectionSlug = collectionSlug,
            FieldName = fieldName,
            OriginalFileName = file.FileName,
            StoredFileName = storedFileName,
            MimeType = file.ContentType ?? "application/octet-stream",
            FileSize = file.Length,
            Url = $"/api/files/download/{collectionSlug}/{storedFileName}",
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        _db.FileAttachments.Add(attachment);
        await _db.SaveChangesAsync();

        return attachment;
    }

    public async Task<FileAttachment?> GetFileAsync(Guid fileId)
    {
        return await _db.FileAttachments
            .AsNoTracking()
            .FirstOrDefaultAsync(f => f.Id == fileId && !f.IsDeleted);
    }

    public async Task<List<FileAttachment>> GetRecordFilesAsync(string collectionSlug, string recordId, string? fieldName = null)
    {
        var query = _db.FileAttachments
            .AsNoTracking()
            .Where(f => f.CollectionSlug == collectionSlug && f.RecordId == recordId && !f.IsDeleted);

        if (!string.IsNullOrWhiteSpace(fieldName))
            query = query.Where(f => f.FieldName == fieldName);

        return await query.OrderByDescending(f => f.CreatedAt).ToListAsync();
    }

    public async Task DeleteFileAsync(Guid fileId)
    {
        var attachment = await _db.FileAttachments.FindAsync(fileId);
        if (attachment == null || attachment.IsDeleted)
            throw new InvalidOperationException("File not found");

        // Delete physical file
        var filePath = Path.Combine(_env.ContentRootPath, "uploads", attachment.CollectionSlug, attachment.StoredFileName);
        if (File.Exists(filePath))
        {
            File.Delete(filePath);
        }

        // Soft delete
        attachment.IsDeleted = true;
        attachment.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();
    }

    public string GetFilePath(string collectionSlug, string storedFileName)
    {
        return Path.Combine(_env.ContentRootPath, "uploads", collectionSlug, storedFileName);
    }
}
