using System.Text.Json;

namespace PocketbaseNet.Api.Contracts;

public record ApplicationSettingsResponse(
    string AppName,
    string AppSubtitle,
    string AppIconUrl,
    string SiteTitle,
    string DefaultLanguage,
    IReadOnlyList<string> SupportedLanguages,
    string PrimaryColor,
    StorageFolderSettingsResponse StorageFolders,
    JsonElement SystemConfig,
    DateTimeOffset UpdatedAt);

public record StorageFolderSettingsResponse(
    string Attachments,
    string Avatars,
    string EditorImages);

public record UpdateApplicationSettingsRequest(
    string AppName,
    string AppSubtitle,
    string AppIconUrl,
    string SiteTitle,
    string DefaultLanguage,
    IReadOnlyList<string>? SupportedLanguages,
    string PrimaryColor,
    StorageFolderSettingsRequest StorageFolders,
    JsonElement? SystemConfig);

public record StorageFolderSettingsRequest(
    string Attachments,
    string Avatars,
    string EditorImages);

public record ApplicationSettingsAuditChangeResponse(
    string Key,
    string OldValue,
    string NewValue);

public record ApplicationSettingsAuditItemResponse(
    Guid Id,
    string? ActorId,
    string ActorDisplayName,
    string ActorEmail,
    DateTimeOffset CreatedAt,
    IReadOnlyList<ApplicationSettingsAuditChangeResponse> Changes);
