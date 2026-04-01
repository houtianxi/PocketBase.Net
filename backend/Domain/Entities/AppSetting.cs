namespace PocketbaseNet.Api.Domain.Entities;

public class AppSetting
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string AppName { get; set; } = "PocketBase.Net";
    public string AppSubtitle { get; set; } = "Admin dashboard";
    public string AppIconUrl { get; set; } = string.Empty;
    public string SiteTitle { get; set; } = "PocketBase.Net";
    public string DefaultLanguage { get; set; } = "zh-CN";
    public string SupportedLanguagesJson { get; set; } = "[\"zh-CN\",\"en-US\"]";
    public string PrimaryColor { get; set; } = "#2563eb";
    public string AttachmentsFolder { get; set; } = "attachments";
    public string AvatarsFolder { get; set; } = "avatars";
    public string EditorImagesFolder { get; set; } = "editor-images";
    public string SystemConfigJson { get; set; } = "{}";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
