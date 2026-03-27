namespace PocketbaseNet.Api.Domain.Enums;

/// <summary>
/// PocketBase-compatible field types
/// </summary>
public enum FieldType
{
    /// <summary>Single line text</summary>
    Text = 1,

    /// <summary>Email field with validation</summary>
    Email = 2,

    /// <summary>URL field with validation</summary>
    Url = 3,

    /// <summary>Number field (integer or decimal)</summary>
    Number = 4,

    /// <summary>Boolean/checkbox field</summary>
    Checkbox = 5,

    /// <summary>Date field (YYYY-MM-DD)</summary>
    Date = 6,

    /// <summary>DateTime field</summary>
    DateTime = 7,

    /// <summary>Single select from predefined options</summary>
    Select = 8,

    /// <summary>Relation to another collection</summary>
    Relation = 9,

    /// <summary>User reference field</summary>
    User = 10,

    /// <summary>File upload field</summary>
    File = 11,

    /// <summary>Multi-line text</summary>
    Textarea = 12,

    /// <summary>JSON data field</summary>
    Json = 13,

    /// <summary>Auto-increment number</summary>
    AutoIncrement = 14,

    /// <summary>Avatar image field (special file)</summary>
    Avatar = 15,

    /// <summary>Formula/computed field</summary>
    Formula = 16,

    /// <summary>Lookup field for relations</summary>
    Lookup = 17
}
