using System.Text.RegularExpressions;

namespace PocketbaseNet.Api.Infrastructure.Services;

public interface IFileStorageService
{
    Task<string> SaveFileAsync(IFormFile file, string subdirectory = "attachments");
    Task<(string fileName, string contentType, Stream fileStream)> GetFileAsync(string fileName, string subdirectory = "attachments");
    Task DeleteFileAsync(string fileName, string subdirectory = "attachments");
    bool FileExists(string fileName, string subdirectory = "attachments");
    string GetStoragePath(string subdirectory = "attachments");
}

public class LocalFileStorageService : IFileStorageService
{
    private readonly string _storageBasePath;
    private readonly ILogger<LocalFileStorageService> _logger;

    public LocalFileStorageService(ILogger<LocalFileStorageService> logger)
    {
        _logger = logger;
        
        // 存储路径：{项目根}/storage
        _storageBasePath = Path.Combine(AppContext.BaseDirectory, "..", "..", "storage");
        
        // 确保目录存在
        Directory.CreateDirectory(_storageBasePath);
    }

    public async Task<string> SaveFileAsync(IFormFile file, string subdirectory = "attachments")
    {
        if (file == null || file.Length == 0)
            throw new ArgumentException("文件不能为空");

        // 验证文件大小 (100MB)
        const long maxFileSize = 100 * 1024 * 1024;
        if (file.Length > maxFileSize)
            throw new ArgumentException("文件大小不能超过 100MB");

        // 生成安全的文件名
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        var fileName = $"{Guid.NewGuid()}{extension}";

        // 创建子目录
        var directoryPath = Path.Combine(_storageBasePath, subdirectory);
        Directory.CreateDirectory(directoryPath);

        var filePath = Path.Combine(directoryPath, fileName);

        try
        {
            // 保存文件
            using (var stream = new FileStream(filePath, FileMode.Create))
            {
                await file.CopyToAsync(stream);
            }

            _logger.LogInformation($"文件已保存: {subdirectory}/{fileName}");
            return fileName;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"保存文件失败: {file.FileName}");
            
            // 删除已创建的文件
            if (File.Exists(filePath))
                File.Delete(filePath);
            
            throw;
        }
    }

    public async Task<(string fileName, string contentType, Stream fileStream)> GetFileAsync(string fileName, string subdirectory = "attachments")
    {
        if (string.IsNullOrWhiteSpace(fileName))
            throw new ArgumentException("文件名不能为空");

        var filePath = Path.Combine(_storageBasePath, subdirectory, fileName);

        // 安全检查：防止路径遍历
        var fullPath = Path.GetFullPath(filePath);
        var basePath = Path.GetFullPath(Path.Combine(_storageBasePath, subdirectory));
        
        if (!fullPath.StartsWith(basePath))
            throw new UnauthorizedAccessException("无效的文件路径");

        if (!File.Exists(filePath))
            throw new FileNotFoundException("文件不存在");

        var contentType = GetContentType(fileName);
        var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read);

        return (Path.GetFileName(filePath), contentType, stream);
    }

    public async Task DeleteFileAsync(string fileName, string subdirectory = "attachments")
    {
        if (string.IsNullOrWhiteSpace(fileName))
            return;

        var filePath = Path.Combine(_storageBasePath, subdirectory, fileName);

        // 安全检查
        var fullPath = Path.GetFullPath(filePath);
        var basePath = Path.GetFullPath(Path.Combine(_storageBasePath, subdirectory));
        
        if (!fullPath.StartsWith(basePath))
            return;

        try
        {
            if (File.Exists(filePath))
            {
                File.Delete(filePath);
                _logger.LogInformation($"文件已删除: {subdirectory}/{fileName}");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"删除文件失败: {fileName}");
        }
    }

    public bool FileExists(string fileName, string subdirectory = "attachments")
    {
        if (string.IsNullOrWhiteSpace(fileName))
            return false;

        var filePath = Path.Combine(_storageBasePath, subdirectory, fileName);
        return File.Exists(filePath);
    }

    public string GetStoragePath(string subdirectory = "attachments")
    {
        return Path.Combine(_storageBasePath, subdirectory);
    }

    private static string GetContentType(string fileName)
    {
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        return extension switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".gif" => "image/gif",
            ".webp" => "image/webp",
            ".pdf" => "application/pdf",
            ".doc" => "application/msword",
            ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".xls" => "application/vnd.ms-excel",
            ".xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ".ppt" => "application/vnd.ms-powerpoint",
            ".pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            ".txt" => "text/plain",
            ".mp3" => "audio/mpeg",
            ".mp4" => "video/mp4",
            ".zip" => "application/zip",
            _ => "application/octet-stream"
        };
    }
}
