using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PocketbaseNet.Api.Contracts;
using PocketbaseNet.Api.Domain.Entities;
using PocketbaseNet.Api.Infrastructure.Exceptions;

namespace PocketbaseNet.Api.Infrastructure.Services;

public class ApplicationSettingsService(AppDbContext db)
{
    private sealed record ConfigChange(string Key, string OldValue, string NewValue);

    private sealed record SettingsAuditPayload(IReadOnlyList<ConfigChange> Changes);

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    public async Task<ApplicationSettingsResponse> GetAsync(CancellationToken cancellationToken = default)
    {
        var setting = await GetOrCreateAsync(cancellationToken);
        return ToResponse(setting);
    }

    public async Task<ApplicationSettingsResponse> UpdateAsync(
        UpdateApplicationSettingsRequest request,
        string? actorId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.AppName))
            throw new ValidationException("应用名称不能为空", new Dictionary<string, List<string>> { ["appName"] = ["应用名称不能为空"] });

        if (string.IsNullOrWhiteSpace(request.SiteTitle))
            throw new ValidationException("站点标题不能为空", new Dictionary<string, List<string>> { ["siteTitle"] = ["站点标题不能为空"] });

        var setting = await GetOrCreateAsync(cancellationToken);
        var oldResponse = ToResponse(setting);

        var supported = NormalizeLanguages(request.SupportedLanguages);
        if (!supported.Contains(request.DefaultLanguage, StringComparer.OrdinalIgnoreCase))
            supported.Add(request.DefaultLanguage.Trim());

        setting.AppName = request.AppName.Trim();
        setting.AppSubtitle = request.AppSubtitle?.Trim() ?? string.Empty;
        setting.AppIconUrl = request.AppIconUrl?.Trim() ?? string.Empty;
        setting.SiteTitle = request.SiteTitle.Trim();
        setting.DefaultLanguage = NormalizeLanguage(request.DefaultLanguage);
        setting.SupportedLanguagesJson = JsonSerializer.Serialize(supported, JsonOptions);
        setting.PrimaryColor = NormalizeColor(request.PrimaryColor);
        setting.AttachmentsFolder = NormalizeFolder(request.StorageFolders.Attachments, "attachments");
        setting.AvatarsFolder = NormalizeFolder(request.StorageFolders.Avatars, "avatars");
        setting.EditorImagesFolder = NormalizeFolder(request.StorageFolders.EditorImages, "editor-images");
        var newSystemConfigJson = request.SystemConfig?.ValueKind is JsonValueKind.Object
            ? request.SystemConfig.Value.GetRawText()
            : "{}";
        setting.SystemConfigJson = newSystemConfigJson;
        setting.UpdatedAt = DateTimeOffset.UtcNow;

        var newResponse = ToResponse(setting);
        var changes = BuildChanges(oldResponse, newResponse);

        if (changes.Count > 0 && IsAuditEnabled(newResponse.SystemConfig))
        {
            var payload = new SettingsAuditPayload(changes);
            db.AuditLogs.Add(new AuditLog
            {
                ActorId = actorId,
                Action = "application-settings.update",
                ResourceType = "application-setting",
                ResourceId = setting.Id.ToString(),
                DetailJson = JsonSerializer.Serialize(payload, JsonOptions),
                CreatedAt = setting.UpdatedAt
            });
        }

        await db.SaveChangesAsync(cancellationToken);
        return newResponse;
    }

    public async Task<bool> GetBoolConfigAsync(string key, bool defaultValue, CancellationToken cancellationToken = default)
    {
        var config = await GetSystemConfigAsync(cancellationToken);
        if (TryGetPropertyIgnoreCase(config, key, out var value))
        {
            if (value.ValueKind == JsonValueKind.True || value.ValueKind == JsonValueKind.False)
                return value.GetBoolean();

            if (value.ValueKind == JsonValueKind.String && bool.TryParse(value.GetString(), out var parsed))
                return parsed;
        }

        return defaultValue;
    }

    public async Task<int> GetIntConfigAsync(string key, int defaultValue, CancellationToken cancellationToken = default)
    {
        var config = await GetSystemConfigAsync(cancellationToken);
        if (TryGetPropertyIgnoreCase(config, key, out var value))
        {
            if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var n))
                return n;

            if (value.ValueKind == JsonValueKind.String && int.TryParse(value.GetString(), out var parsed))
                return parsed;
        }

        return defaultValue;
    }

    public async Task<IReadOnlyList<ApplicationSettingsAuditItemResponse>> GetAuditLogsAsync(
        int take = 50,
        CancellationToken cancellationToken = default)
    {
        var clampedTake = Math.Clamp(take, 1, 200);

        var logs = await db.AuditLogs
            .AsNoTracking()
            .Where(x => x.Action == "application-settings.update")
            .OrderByDescending(x => x.CreatedAt)
            .Take(clampedTake)
            .ToListAsync(cancellationToken);

        var actorIds = logs
            .Select(x => x.ActorId)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var actorMap = await db.Users
            .AsNoTracking()
            .Where(x => actorIds.Contains(x.Id))
            .Select(x => new { x.Id, x.DisplayName, x.Email })
            .ToDictionaryAsync(
                x => x.Id,
                x => new { x.DisplayName, x.Email },
                StringComparer.OrdinalIgnoreCase,
                cancellationToken);

        return logs.Select(log =>
        {
            actorMap.TryGetValue(log.ActorId ?? string.Empty, out var actor);
            return new ApplicationSettingsAuditItemResponse(
                log.Id,
                log.ActorId,
                actor?.DisplayName ?? "Unknown",
                actor?.Email ?? string.Empty,
                log.CreatedAt,
                ParseAuditChanges(log.DetailJson));
        }).ToList();
    }

    public async Task<string> ResolveStorageFolderAsync(string type, CancellationToken cancellationToken = default)
    {
        var setting = await GetOrCreateAsync(cancellationToken);
        var key = type?.Trim().ToLowerInvariant() ?? "attachments";

        return key switch
        {
            "avatars" => setting.AvatarsFolder,
            "editor-images" => setting.EditorImagesFolder,
            _ => setting.AttachmentsFolder
        };
    }

    private async Task<AppSetting> GetOrCreateAsync(CancellationToken cancellationToken)
    {
        var setting = await db.Set<AppSetting>().OrderBy(x => x.CreatedAt).FirstOrDefaultAsync(cancellationToken);
        if (setting is not null)
            return setting;

        setting = new AppSetting();
        db.Set<AppSetting>().Add(setting);
        await db.SaveChangesAsync(cancellationToken);
        return setting;
    }

    private static ApplicationSettingsResponse ToResponse(AppSetting setting)
    {
        var supported = ParseSupportedLanguages(setting.SupportedLanguagesJson);
        var systemConfig = ParseJsonObject(setting.SystemConfigJson);

        return new ApplicationSettingsResponse(
            setting.AppName,
            setting.AppSubtitle,
            setting.AppIconUrl,
            setting.SiteTitle,
            setting.DefaultLanguage,
            supported,
            setting.PrimaryColor,
            new StorageFolderSettingsResponse(setting.AttachmentsFolder, setting.AvatarsFolder, setting.EditorImagesFolder),
            systemConfig,
            setting.UpdatedAt);
    }

    private static List<string> ParseSupportedLanguages(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return ["zh-CN", "en-US"];

        try
        {
            var parsed = JsonSerializer.Deserialize<List<string>>(json) ?? [];
            var normalized = NormalizeLanguages(parsed);
            return normalized.Count == 0 ? ["zh-CN", "en-US"] : normalized;
        }
        catch
        {
            return ["zh-CN", "en-US"];
        }
    }

    private static JsonElement ParseJsonObject(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return JsonSerializer.SerializeToElement(new Dictionary<string, object?>());

        try
        {
            var element = JsonSerializer.Deserialize<JsonElement>(json);
            if (element.ValueKind == JsonValueKind.Object)
                return element;
        }
        catch
        {
            // ignored
        }

        return JsonSerializer.SerializeToElement(new Dictionary<string, object?>());
    }

    private static List<string> NormalizeLanguages(IReadOnlyList<string>? languages)
    {
        var allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "zh-CN",
            "en-US"
        };

        var normalized = (languages ?? ["zh-CN", "en-US"])
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(NormalizeLanguage)
            .Where(allowed.Contains)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (normalized.Count == 0)
            normalized = ["zh-CN", "en-US"];

        return normalized;
    }

    private static string NormalizeLanguage(string? language)
    {
        var value = language?.Trim();
        return string.Equals(value, "en", StringComparison.OrdinalIgnoreCase)
            ? "en-US"
            : string.Equals(value, "zh", StringComparison.OrdinalIgnoreCase)
                ? "zh-CN"
                : string.IsNullOrWhiteSpace(value)
                    ? "zh-CN"
                    : value;
    }

    private static string NormalizeColor(string? color)
    {
        if (string.IsNullOrWhiteSpace(color))
            return "#2563eb";

        var value = color.Trim();
        if (value.StartsWith('#') && (value.Length == 7 || value.Length == 4))
            return value;

        return "#2563eb";
    }

    private static string NormalizeFolder(string? folder, string fallback)
    {
        if (string.IsNullOrWhiteSpace(folder))
            return fallback;

        var value = folder.Trim().Replace('\\', '/').Trim('/');
        value = value.Replace("..", string.Empty);
        return string.IsNullOrWhiteSpace(value) ? fallback : value;
    }

    private async Task<JsonElement> GetSystemConfigAsync(CancellationToken cancellationToken)
    {
        var setting = await GetOrCreateAsync(cancellationToken);
        return ParseJsonObject(setting.SystemConfigJson);
    }

    private static bool TryGetPropertyIgnoreCase(JsonElement element, string key, out JsonElement value)
    {
        value = default;
        if (element.ValueKind != JsonValueKind.Object)
            return false;

        foreach (var property in element.EnumerateObject())
        {
            if (string.Equals(property.Name, key, StringComparison.OrdinalIgnoreCase))
            {
                value = property.Value;
                return true;
            }
        }

        return false;
    }

    private static List<ConfigChange> BuildChanges(ApplicationSettingsResponse oldValue, ApplicationSettingsResponse newValue)
    {
        var changes = new List<ConfigChange>();
        AddChange(changes, "appName", oldValue.AppName, newValue.AppName);
        AddChange(changes, "appSubtitle", oldValue.AppSubtitle, newValue.AppSubtitle);
        AddChange(changes, "appIconUrl", oldValue.AppIconUrl, newValue.AppIconUrl);
        AddChange(changes, "siteTitle", oldValue.SiteTitle, newValue.SiteTitle);
        AddChange(changes, "defaultLanguage", oldValue.DefaultLanguage, newValue.DefaultLanguage);
        AddChange(changes, "supportedLanguages", oldValue.SupportedLanguages, newValue.SupportedLanguages);
        AddChange(changes, "primaryColor", oldValue.PrimaryColor, newValue.PrimaryColor);
        AddChange(changes, "storageFolders.attachments", oldValue.StorageFolders.Attachments, newValue.StorageFolders.Attachments);
        AddChange(changes, "storageFolders.avatars", oldValue.StorageFolders.Avatars, newValue.StorageFolders.Avatars);
        AddChange(changes, "storageFolders.editorImages", oldValue.StorageFolders.EditorImages, newValue.StorageFolders.EditorImages);

        foreach (var configChange in BuildSystemConfigChanges(oldValue.SystemConfig, newValue.SystemConfig))
            changes.Add(configChange);

        return changes;
    }

    private static IEnumerable<ConfigChange> BuildSystemConfigChanges(JsonElement oldConfig, JsonElement newConfig)
    {
        if (oldConfig.ValueKind != JsonValueKind.Object && newConfig.ValueKind != JsonValueKind.Object)
            yield break;

        var keys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (oldConfig.ValueKind == JsonValueKind.Object)
        {
            foreach (var p in oldConfig.EnumerateObject())
                keys.Add(p.Name);
        }
        if (newConfig.ValueKind == JsonValueKind.Object)
        {
            foreach (var p in newConfig.EnumerateObject())
                keys.Add(p.Name);
        }

        foreach (var key in keys.OrderBy(x => x, StringComparer.OrdinalIgnoreCase))
        {
            var oldFound = TryGetPropertyIgnoreCase(oldConfig, key, out var oldProp);
            var newFound = TryGetPropertyIgnoreCase(newConfig, key, out var newProp);

            var oldSerialized = oldFound ? JsonSerializer.Serialize(oldProp) : "null";
            var newSerialized = newFound ? JsonSerializer.Serialize(newProp) : "null";

            if (!string.Equals(oldSerialized, newSerialized, StringComparison.Ordinal))
            {
                yield return new ConfigChange($"systemConfig.{key}", oldSerialized, newSerialized);
            }
        }
    }

    private static void AddChange(List<ConfigChange> changes, string key, object? oldValue, object? newValue)
    {
        var oldSerialized = JsonSerializer.Serialize(oldValue);
        var newSerialized = JsonSerializer.Serialize(newValue);
        if (!string.Equals(oldSerialized, newSerialized, StringComparison.Ordinal))
        {
            changes.Add(new ConfigChange(key, oldSerialized, newSerialized));
        }
    }

    private static IReadOnlyList<ApplicationSettingsAuditChangeResponse> ParseAuditChanges(string? detailJson)
    {
        if (string.IsNullOrWhiteSpace(detailJson))
            return [];

        try
        {
            var payload = JsonSerializer.Deserialize<SettingsAuditPayload>(detailJson, JsonOptions);
            if (payload?.Changes == null)
                return [];

            return payload.Changes
                .Select(x => new ApplicationSettingsAuditChangeResponse(x.Key, x.OldValue, x.NewValue))
                .ToList();
        }
        catch
        {
            return [];
        }
    }

    private static bool IsAuditEnabled(JsonElement systemConfig)
    {
        if (TryGetPropertyIgnoreCase(systemConfig, "enableAuditLog", out var value))
        {
            if (value.ValueKind == JsonValueKind.True || value.ValueKind == JsonValueKind.False)
                return value.GetBoolean();

            if (value.ValueKind == JsonValueKind.String && bool.TryParse(value.GetString(), out var parsed))
                return parsed;
        }

        return true;
    }
}
