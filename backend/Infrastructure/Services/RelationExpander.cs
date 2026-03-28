using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PocketbaseNet.Api.Domain.Entities;

namespace PocketbaseNet.Api.Infrastructure.Services;

/// <summary>
/// Service for expanding related records in API responses
/// </summary>
public class RelationExpander
{
    private readonly AppDbContext _db;

    public RelationExpander(AppDbContext db)
    {
        _db = db;
    }

    /// <summary>
    /// Expand specified relation fields in a record's data
    /// </summary>
    public async Task<Dictionary<string, object?>> ExpandRelations(
        Dictionary<string, object?> recordData,
        List<Field> collectionFields,
        List<string>? expandFields)
    {
        if (expandFields == null || expandFields.Count == 0)
            return recordData;

        var result = new Dictionary<string, object?>(recordData);

        foreach (var expandField in expandFields)
        {
            var field = collectionFields.FirstOrDefault(f => 
                f.Name.Equals(expandField, StringComparison.OrdinalIgnoreCase));

            if (field is null || field.Type != Domain.Enums.FieldType.Relation)
                continue;

            // Parse relation config to get target collection ID
            var config = new Dictionary<string, object?>();
            try
            {
                string configJson;
                if (field.Config.ValueKind == JsonValueKind.Null || field.Config.ValueKind == JsonValueKind.Undefined)
                {
                    configJson = "{}";
                }
                else
                {
                    configJson = field.Config.GetRawText();
                }
                config = JsonSerializer.Deserialize<Dictionary<string, object?>>(configJson) ?? new();
            }
            catch { }

            if (!config.TryGetValue("collectionId", out var collectionIdObj))
                continue;

            var collectionIdStr = collectionIdObj?.ToString();
            if (string.IsNullOrEmpty(collectionIdStr) || !Guid.TryParse(collectionIdStr, out var collectionId))
                continue;

            // Get the relation value from record
            if (!recordData.TryGetValue(field.Name, out var relationValue) || relationValue == null)
                continue;

            // Convert JsonElement to appropriate type if needed
            if (relationValue is JsonElement elem)
            {
                relationValue = ConvertJsonElementToObject(elem);
            }

            // Handle different relation value types
            if (relationValue is string strId)
            {
                // Single relation ID
                if (Guid.TryParse(strId, out var relGuid))
                {
                    var related = await GetRelatedRecord(relGuid, collectionId);
                    if (related != null)
                        result[field.Name] = related;
                }
            }
            else if (relationValue is List<string> idList)
            {
                // Array of ID strings
                var expandedList = new List<Dictionary<string, object?>>();
                foreach (var id in idList)
                {
                    if (Guid.TryParse(id, out var relGuid))
                    {
                        var related = await GetRelatedRecord(relGuid, collectionId);
                        if (related != null)
                            expandedList.Add(related);
                    }
                }
                result[field.Name] = expandedList;
            }
            else if (relationValue is List<object> objList)
            {
                // Array of objects (might be GUIDs or strings)
                var expandedList = new List<Dictionary<string, object?>>();
                foreach (var obj in objList)
                {
                    string? id = obj as string;
                    if (!string.IsNullOrEmpty(id) && Guid.TryParse(id, out var relGuid))
                    {
                        var related = await GetRelatedRecord(relGuid, collectionId);
                        if (related != null)
                            expandedList.Add(related);
                    }
                }
                result[field.Name] = expandedList;
            }
        }

        return result;
    }

    private static object? ConvertJsonElementToObject(JsonElement elem)
    {
        return elem.ValueKind switch
        {
            JsonValueKind.String => elem.GetString(),
            JsonValueKind.Number => elem.TryGetInt32(out var i) ? (object)i : elem.GetDouble(),
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Array => elem.EnumerateArray()
                .Select(e => ConvertJsonElementToObject(e))
                .ToList(),
            JsonValueKind.Object => JsonSerializer.Deserialize<Dictionary<string, object?>>(elem.GetRawText()) ?? new(),
            _ => null
        };
    }

    private async Task<Dictionary<string, object?>?> GetRelatedRecord(Guid relId, Guid collectionId)
    {
        var related = await _db.Records
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == relId && r.CollectionDefinitionId == collectionId);
        
        if (related == null)
            return null;

        var relData = JsonSerializer.Deserialize<Dictionary<string, object?>>(related.DataJson) ?? new();
        relData["id"] = related.Id;
        relData["created"] = related.CreatedAt;
        relData["updated"] = related.UpdatedAt;
        return relData;
    }

    /// <summary>
    /// Parse expand string into field names
    /// Example: "author,tags" returns ["author", "tags"]
    /// </summary>
    public static List<string> ParseExpandFields(string? expandString)
    {
        if (string.IsNullOrWhiteSpace(expandString))
            return new();

        return expandString
            .Split(',')
            .Select(f => f.Trim())
            .Where(f => !string.IsNullOrWhiteSpace(f))
            .ToList();
    }

    /// <summary>
    /// Returns the names of every Relation-typed field in the collection.
    /// Used to auto-expand all relation fields without requiring an explicit ?expand= parameter.
    /// </summary>
    public static List<string> GetAllRelationFieldNames(List<Field> fields)
    {
        return fields
            .Where(f => f.Type == Domain.Enums.FieldType.Relation)
            .Select(f => f.Name)
            .ToList();
    }
}
