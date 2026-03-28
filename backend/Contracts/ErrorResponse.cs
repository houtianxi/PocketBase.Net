using System.Text.Json.Serialization;

namespace PocketbaseNet.Api.Contracts;

/// <summary>
/// Unified API error response format
/// </summary>
public class ErrorResponse
{
    /// <summary>
    /// HTTP status code
    /// </summary>
    [JsonPropertyName("code")]
    public int Code { get; set; }

    /// <summary>
    /// Error message
    /// </summary>
    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;

    /// <summary>
    /// Additional error details
    /// </summary>
    [JsonPropertyName("data")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public Dictionary<string, object?>? Data { get; set; }
}

/// <summary>
/// Validation error details for field-level errors
/// </summary>
public class FieldErrorDetail
{
    [JsonPropertyName("fields")]
    public Dictionary<string, List<string>> Fields { get; set; } = new();
}
