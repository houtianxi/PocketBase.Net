using System.Text.Json;
using PocketbaseNet.Api.Domain.Entities;

namespace PocketbaseNet.Api.Infrastructure.Services;

/// <summary>
/// Parser for OData-style filter and query expressions
/// </summary>
public class QueryParser
{
    /// <summary>
    /// Parse OData-style filter string
    /// Example: "email eq 'test@example.com' and status ne 'deleted'"
    /// </summary>
    public static List<QueryFilter> ParseFilter(string? filterString)
    {
        if (string.IsNullOrWhiteSpace(filterString))
            return new List<QueryFilter>();

        var filters = new List<QueryFilter>();
        var conditions = filterString.Split(new[] { " and ", " or " }, StringSplitOptions.None);

        foreach (var condition in conditions)
        {
            var filter = ParseCondition(condition.Trim());
            if (filter != null)
                filters.Add(filter);
        }

        return filters;
    }

    /// <summary>
    /// Parse sort expression
    /// Example: "-created,name" means sort by created (descending), then name (ascending)
    /// </summary>
    public static List<SortExpression> ParseSort(string? sortString)
    {
        if (string.IsNullOrWhiteSpace(sortString))
            return new List<SortExpression>();

        var sorts = new List<SortExpression>();
        var fields = sortString.Split(',');

        foreach (var field in fields)
        {
            var fieldTrim = field.Trim();
            if (string.IsNullOrWhiteSpace(fieldTrim))
                continue;

            var isDesc = fieldTrim.StartsWith('-');
            var fieldName = isDesc ? fieldTrim.Substring(1) : fieldTrim;

            if (!string.IsNullOrWhiteSpace(fieldName))
            {
                sorts.Add(new SortExpression { FieldName = fieldName, IsDescending = isDesc });
            }
        }

        return sorts;
    }

    /// <summary>
    /// Parse field selection
    /// Example: "id,email,name" returns ["id", "email", "name"]
    /// </summary>
    public static List<string> ParseFields(string? fieldsString)
    {
        if (string.IsNullOrWhiteSpace(fieldsString))
            return new List<string>();

        return fieldsString
            .Split(',')
            .Select(f => f.Trim())
            .Where(f => !string.IsNullOrWhiteSpace(f))
            .ToList();
    }

    /// <summary>
    /// Apply filters to a JSON dictionary
    /// </summary>
    public static bool ApplyFilters(Dictionary<string, object?> record, List<QueryFilter> filters, List<Field>? availableFields = null)
    {
        if (filters.Count == 0)
            return true;

        // All conditions must match (AND logic)
        foreach (var filter in filters)
        {
            if (!EvaluateFilter(record, filter, availableFields))
                return false;
        }

        return true;
    }

    /// <summary>
    /// Apply search to a record via full-text matching
    /// </summary>
    public static bool ApplySearch(Dictionary<string, object?> record, string? searchKeyword, List<Field>? searchableFields = null)
    {
        if (string.IsNullOrWhiteSpace(searchKeyword))
            return true;

        var keyword = searchKeyword.ToLowerInvariant();

        // Search all string/text fields
        foreach (var kvp in record)
        {
            // Skip if field is not searchable
            if (searchableFields != null && !searchableFields.Any(f => f.Name == kvp.Key))
                continue;

            var value = kvp.Value?.ToString()?.ToLowerInvariant() ?? string.Empty;
            if (value.Contains(keyword))
                return true;
        }

        return false;
    }

    // Private helpers

    private static QueryFilter? ParseCondition(string condition)
    {
        if (string.IsNullOrWhiteSpace(condition))
            return null;

        // Try to match operator patterns
        var operatorPatterns = new[]
        {
            (" eq ", "eq"),
            (" ne ", "ne"),
            (" lt ", "lt"),
            (" le ", "le"),
            (" gt ", "gt"),
            (" ge ", "ge"),
            (" contains(", "contains"),
            (" startswith(", "startswith"),
            (" endswith(", "endswith")
        };

        foreach (var (pattern, op) in operatorPatterns)
        {
            if (condition.Contains(pattern))
            {
                var parts = condition.Split(new[] { pattern }, StringSplitOptions.None);
                if (parts.Length == 2)
                {
                    var field = parts[0].Trim();
                    var valueStr = parts[1].Trim();
                    var value = ParseValue(valueStr);

                    return new QueryFilter
                    {
                        Field = field,
                        Operator = op,
                        Value = value
                    };
                }
            }
        }

        return null;
    }

    private static object ParseValue(string valueStr)
    {
        valueStr = valueStr.Trim();

        // Remove quotes if present
        if ((valueStr.StartsWith("'") && valueStr.EndsWith("'")) ||
            (valueStr.StartsWith("\"") && valueStr.EndsWith("\"")))
        {
            return valueStr.Substring(1, valueStr.Length - 2);
        }

        // Try to parse as number
        if (int.TryParse(valueStr, out var intValue))
            return intValue;

        if (decimal.TryParse(valueStr, out var decValue))
            return decValue;

        // Try to parse as boolean
        if (bool.TryParse(valueStr, out var boolValue))
            return boolValue;

        // Try to parse as datetime
        if (DateTime.TryParse(valueStr, out var dateValue))
            return dateValue;

        return valueStr;
    }

    private static bool EvaluateFilter(Dictionary<string, object?> record, QueryFilter filter, List<Field>? availableFields = null)
    {
        if (filter.Field == null || filter.Operator == null)
            return true;

        if (!record.TryGetValue(filter.Field, out var fieldValue))
        {
            // Field doesn't exist in record
            return filter.Operator == "isnull";
        }

        return filter.Operator.ToLowerInvariant() switch
        {
            "eq" => CompareValues(fieldValue, filter.Value, (a, b) => a == b),
            "ne" => CompareValues(fieldValue, filter.Value, (a, b) => a != b),
            "lt" => CompareValues(fieldValue, filter.Value, (a, b) => Compare(a, b) < 0),
            "le" => CompareValues(fieldValue, filter.Value, (a, b) => Compare(a, b) <= 0),
            "gt" => CompareValues(fieldValue, filter.Value, (a, b) => Compare(a, b) > 0),
            "ge" => CompareValues(fieldValue, filter.Value, (a, b) => Compare(a, b) >= 0),
            "contains" => FieldContains(fieldValue, filter.Value),
            "startswith" => FieldStartsWith(fieldValue, filter.Value),
            "endswith" => FieldEndsWith(fieldValue, filter.Value),
            "isnull" => fieldValue == null,
            "isnotnull" => fieldValue != null,
            _ => true
        };
    }

    private static bool CompareValues(object? fieldValue, object? filterValue, Func<object, object, bool> comparer)
    {
        if (fieldValue == null || filterValue == null)
            return false;

        try
        {
            return comparer(fieldValue, filterValue);
        }
        catch
        {
            return false;
        }
    }

    private static int Compare(object? a, object? b)
    {
        if (a == null && b == null) return 0;
        if (a == null) return -1;
        if (b == null) return 1;

        if (a is IComparable comp)
            return comp.CompareTo(b);

        return a.ToString()?.CompareTo(b.ToString() ?? "") ?? 0;
    }

    private static bool FieldContains(object? fieldValue, object? searchValue)
    {
        var fieldStr = fieldValue?.ToString() ?? string.Empty;
        var searchStr = searchValue?.ToString() ?? string.Empty;
        return fieldStr.Contains(searchStr, StringComparison.OrdinalIgnoreCase);
    }

    private static bool FieldStartsWith(object? fieldValue, object? searchValue)
    {
        var fieldStr = fieldValue?.ToString() ?? string.Empty;
        var searchStr = searchValue?.ToString() ?? string.Empty;
        return fieldStr.StartsWith(searchStr, StringComparison.OrdinalIgnoreCase);
    }

    private static bool FieldEndsWith(object? fieldValue, object? searchValue)
    {
        var fieldStr = fieldValue?.ToString() ?? string.Empty;
        var searchStr = searchValue?.ToString() ?? string.Empty;
        return fieldStr.EndsWith(searchStr, StringComparison.OrdinalIgnoreCase);
    }
}
