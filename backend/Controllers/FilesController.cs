using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Mvc;
using PocketbaseNet.Api.Domain.Entities;
using PocketbaseNet.Api.Infrastructure;
using PocketbaseNet.Api.Infrastructure.Services;

namespace PocketbaseNet.Api.Controllers;

[ApiController]
[Route("api/files")]
public class FilesController(IFileStorageService fileStorageService, AppDbContext dbContext) : ControllerBase
{
    public sealed class FileMetadataResponse
    {
        public string StoredFileName { get; set; } = string.Empty;
        public string OriginalFileName { get; set; } = string.Empty;
        public string MimeType { get; set; } = string.Empty;
        public long FileSize { get; set; }
        public string Url { get; set; } = string.Empty;
        public DateTimeOffset CreatedAt { get; set; }
    }

    public sealed class UploadFileRequest
    {
        public IFormFile? File { get; set; }
        public string? CollectionSlug { get; set; }
        public string? RecordId { get; set; }
        public string? FieldName { get; set; }
    }

    /// <summary>
    /// 上传文件 (Avatar, File字段, 富文本附件)
    /// </summary>
    [HttpPost("upload")]
    [Authorize]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(100 * 1024 * 1024)] // 100MB
    public async Task<ActionResult> Upload([FromForm] UploadFileRequest request, [FromQuery] string type = "attachments")
    {
        var file = request.File;
        if (file == null || file.Length == 0)
            return BadRequest("文件不能为空");

        try
        {
            var fileName = await fileStorageService.SaveFileAsync(file, type);

            var now = DateTimeOffset.UtcNow;
            var collectionSlug = string.IsNullOrWhiteSpace(request.CollectionSlug) ? type : request.CollectionSlug.Trim();
            var recordId = string.IsNullOrWhiteSpace(request.RecordId) ? "unbound" : request.RecordId.Trim();
            var fieldName = string.IsNullOrWhiteSpace(request.FieldName) ? type : request.FieldName.Trim();

            var attachment = new FileAttachment
            {
                Id = Guid.NewGuid(),
                CollectionSlug = collectionSlug,
                RecordId = recordId,
                FieldName = fieldName,
                OriginalFileName = file.FileName,
                StoredFileName = fileName,
                MimeType = file.ContentType ?? "application/octet-stream",
                FileSize = file.Length,
                Url = $"/api/files/stream/{type}/{fileName}",
                IsDeleted = false,
                CreatedAt = now,
                UpdatedAt = now
            };

            dbContext.FileAttachments.Add(attachment);
            await dbContext.SaveChangesAsync();

            return Ok(new
            {
                fileName,
                originalFileName = file.FileName,
                fileSize = file.Length,
                contentType = file.ContentType
            });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "文件上传失败: " + ex.Message });
        }
    }

    /// <summary>
    /// 下载文件
    /// </summary>
    [HttpGet("download/{fileName}")]
    [Authorize]
    public async Task<ActionResult> Download(string fileName, [FromQuery] string type = "attachments")
    {
        if (string.IsNullOrWhiteSpace(fileName))
            return BadRequest("文件名不能为空");

        try
        {
            var (name, contentType, stream) = await fileStorageService.GetFileAsync(fileName, type);
            return File(stream, contentType, name);
        }
        catch (FileNotFoundException)
        {
            return NotFound("文件不存在");
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid("无权限访问此文件");
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "下载文件失败: " + ex.Message });
        }
    }

    /// <summary>
    /// 批量查询文件元数据（用于显示真实附件名称）
    /// </summary>
    [HttpGet("metadata")]
    [Authorize]
    public async Task<ActionResult<List<FileMetadataResponse>>> GetMetadata([FromQuery] string[] fileNames, [FromQuery] string type = "attachments")
    {
        if (fileNames == null || fileNames.Length == 0)
            return Ok(new List<FileMetadataResponse>());

        var names = fileNames
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (names.Count == 0)
            return Ok(new List<FileMetadataResponse>());

        var items = await dbContext.FileAttachments
            .AsNoTracking()
            .Where(x => !x.IsDeleted && names.Contains(x.StoredFileName))
            .OrderByDescending(x => x.CreatedAt)
            .ToListAsync();

        var filtered = items
            .Where(x =>
                string.Equals(x.CollectionSlug, type, StringComparison.OrdinalIgnoreCase) ||
                x.Url.Contains($"/api/files/stream/{type}/", StringComparison.OrdinalIgnoreCase))
            .GroupBy(x => x.StoredFileName)
            .Select(g => g.First())
            .Select(x => new FileMetadataResponse
            {
                StoredFileName = x.StoredFileName,
                OriginalFileName = x.OriginalFileName,
                MimeType = x.MimeType,
                FileSize = x.FileSize,
                Url = x.Url,
                CreatedAt = x.CreatedAt
            })
            .ToList();

        return Ok(filtered);
    }

    /// <summary>
    /// 获取文件预览 URL (用于前端直接访问)
    /// </summary>
    [HttpGet("preview/{fileName}")]
    [Authorize]
    public ActionResult GetPreviewUrl(string fileName, [FromQuery] string type = "attachments")
    {
        if (string.IsNullOrWhiteSpace(fileName))
            return BadRequest("文件名不能为空");

        if (!fileStorageService.FileExists(fileName, type))
            return NotFound("文件不存在");

        var previewUrl = $"/api/files/stream/{type}/{fileName}";
        return Ok(new { previewUrl });
    }

    /// <summary>
    /// 流式获取文件 (用于在浏览器中预览)
    /// </summary>
    [HttpGet("stream/{type}/{fileName}")]
    [AllowAnonymous]
    public async Task<ActionResult> GetFileStream(string type, string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
            return BadRequest("文件名不能为空");

        try
        {
            var (name, contentType, stream) = await fileStorageService.GetFileAsync(fileName, type);
            
            // 对于图片直接inline显示，其他文件下载
            var disposition = contentType.StartsWith("image/") ? "inline" : "attachment";
            Response.Headers.Append("Content-Disposition", $"{disposition}; filename=\"{name}\"");
            
            return File(stream, contentType);
        }
        catch (FileNotFoundException)
        {
            return NotFound("文件不存在");
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid("无权限访问此文件");
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "获取文件失败: " + ex.Message });
        }
    }

    /// <summary>
    /// 删除文件
    /// </summary>
    [HttpDelete("{fileName}")]
    [Authorize]
    public async Task<ActionResult> Delete(string fileName, [FromQuery] string type = "attachments")
    {
        if (string.IsNullOrWhiteSpace(fileName))
            return BadRequest("文件名不能为空");

        try
        {
            await fileStorageService.DeleteFileAsync(fileName, type);

            var attachments = await dbContext.FileAttachments
                .Where(x => x.StoredFileName == fileName && !x.IsDeleted)
                .ToListAsync();

            if (attachments.Count > 0)
            {
                foreach (var attachment in attachments)
                {
                    attachment.IsDeleted = true;
                    attachment.UpdatedAt = DateTimeOffset.UtcNow;
                }

                await dbContext.SaveChangesAsync();
            }

            return Ok();
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "删除文件失败: " + ex.Message });
        }
    }
}
