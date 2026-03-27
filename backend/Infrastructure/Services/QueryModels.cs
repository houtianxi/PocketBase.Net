namespace PocketbaseNet.Api.Infrastructure.Services;

/// <summary>
/// Represents a paged result set
/// </summary>
public class PagedResult<T>
{
    public List<T> Items { get; set; } = new();
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int TotalItems { get; set; }
    public int TotalPages => (TotalItems + PageSize - 1) / PageSize;
}

/// <summary>
/// Represents a query filter condition
/// </summary>
public class QueryFilter
{
    public string? Field { get; set; }
    public string? Operator { get; set; }
    public object? Value { get; set; }
    public List<QueryFilter>? Conditions { get; set; } // For AND/OR operations
}

/// <summary>
/// Represents query parameters for record listing
/// </summary>
public class RecordQueryParams
{
    /// <summary>Page number (1-based)</summary>
    public int Page { get; set; } = 1;

    /// <summary>Page size (max 100)</summary>
    public int PageSize { get; set; } = 20;

    /// <summary>Sort field(s) - format: "field1,-field2" (- for desc)</summary>
    public string? Sort { get; set; }

    /// <summary>Filter conditions - OData format: "field eq 'value' and status ne 'deleted'"</summary>
    public string? Filter { get; set; }

    /// <summary>Full text search keyword</summary>
    public string? Search { get; set; }

    /// <summary>Comma-separated field names to include (default: all)</summary>
    public string? Fields { get; set; }

    /// <summary>Expand related records - format: "relationField1,relationField2"</summary>
    public string? Expand { get; set; }
}

/// <summary>
/// Represents a sort expression
/// </summary>
public class SortExpression
{
    public string FieldName { get; set; } = string.Empty;
    public bool IsDescending { get; set; }
}

/// <summary>
/// Filter operators supported by the system
/// </summary>
public enum FilterOperator
{
    Equals,           // eq, =
    NotEquals,        // ne, !=
    LessThan,         // lt, <
    LessThanOrEqual,  // le, <=
    GreaterThan,      // gt, >
    GreaterThanOrEqual, // ge, >=
    Contains,         // contains, like, ~
    StartsWith,       // startswith
    EndsWith,         // endswith
    In,               // in
    NotIn,            // notin
    IsNull,           // isnull
    IsNotNull         // isnotnull
}
