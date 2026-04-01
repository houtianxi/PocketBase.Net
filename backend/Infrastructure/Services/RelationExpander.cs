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
    private readonly SqlRecordStore _sqlRecordStore;

    public RelationExpander(AppDbContext db, SqlRecordStore sqlRecordStore)
    {
        _db = db;
        _sqlRecordStore = sqlRecordStore;
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

    /// <summary>
    /// Returns the names of every Table-typed字段 in the collection.
    /// </summary>
    public static List<string> GetAllTableFieldNames(List<Field> fields)
    {
        return fields
            .Where(f => f.Type == Domain.Enums.FieldType.Table)
            .Select(f => f.Name)
            .ToList();
    }

    /// <summary>
    /// Automatically expand Table-type fields (e.g., OrderDetail child table).
    /// Handles both draft and published child collections with proper error handling.
    /// </summary>
    public async Task<Dictionary<string, object?>> ExpandTables(
        Dictionary<string, object?> recordData,
        List<Field> collectionFields,
        Guid parentRecordId)
    {
        var result = new Dictionary<string, object?>(recordData);
        
        foreach (var field in collectionFields.Where(f => f.Type == Domain.Enums.FieldType.Table))
        {
            try
            {
                // Parse Table field config
                var config = ParseTableFieldConfig(field);
                
                // Get related collection slug
                if (!config.TryGetValue("relatedCollectionSlug", out var relatedSlugObj))
                    continue;
                var relatedSlug = relatedSlugObj?.ToString();
                if (string.IsNullOrWhiteSpace(relatedSlug))
                    continue;

                // Get parent/child key field names
                var parentKey = config.TryGetValue("parentKey", out var pkObj) ? pkObj?.ToString() ?? "Id" : "Id";
                var childKey = config.TryGetValue("childKey", out var ckObj) ? ckObj?.ToString() ?? "ParentId" : "ParentId";

                // Determine the parent key value to match against child records
                string parentKeyValue = DetermineParentKeyValue(recordData, parentKey, parentRecordId);
                if (string.IsNullOrWhiteSpace(parentKeyValue))
                    continue;

                // Fetch related collection definition
                var relatedCollection = await _db.Collections
                    .Include(c => c.Fields)
                    .FirstOrDefaultAsync(c => c.Slug == relatedSlug);
                if (relatedCollection == null)
                {
                    System.Diagnostics.Debug.WriteLine($"[ExpandTables] Related collection not found: {relatedSlug} (field: {field.Name})");
                    continue;
                }

                // Load child records based on publish status
                var childList = new List<Dictionary<string, object?>>();
                
                try
                {
                    if (await _sqlRecordStore.IsPublishedAsync(relatedCollection.Id))
                    {
                        await LoadPublishedChildRecords(childList, relatedCollection, childKey, parentKeyValue);
                    }
                    else
                    {
                        await LoadDraftChildRecords(childList, relatedCollection, childKey, parentKeyValue);
                    }
                }
                catch (Exception ex)
                {
                    System.Diagnostics.Debug.WriteLine($"[ExpandTables] Failed to load children for table field '{field.Name}' in collection '{relatedSlug}': {ex.Message}");
                    // Continue with empty list rather than failing the entire request
                    childList = new();
                }

                result[field.Name] = childList;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[ExpandTables] Unexpected error processing table field '{field.Name}': {ex.Message}");
                // Set to empty array on unexpected error to avoid breaking API response
                result[field.Name] = new List<Dictionary<string, object?>>();
            }
        }
        
        return result;
    }

    private Dictionary<string, object?> ParseTableFieldConfig(Field field)
    {
        try
        {
            string configJson = field.Config.ValueKind == JsonValueKind.Null || field.Config.ValueKind == JsonValueKind.Undefined
                ? "{}"
                : field.Config.GetRawText();
            return JsonSerializer.Deserialize<Dictionary<string, object?>>(configJson) ?? new();
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[ParseTableFieldConfig] Failed to parse config for field '{field.Name}': {ex.Message}");
            return new();
        }
    }

    private string DetermineParentKeyValue(Dictionary<string, object?> recordData, string parentKey, Guid parentRecordId)
    {
        if (!string.Equals(parentKey, "Id", StringComparison.OrdinalIgnoreCase))
        {
            if (recordData.TryGetValue(parentKey, out var parentKeyObj) && parentKeyObj != null)
            {
                var value = NormalizeObjectValue(parentKeyObj).ToString();
                if (!string.IsNullOrWhiteSpace(value))
                    return value;
            }
        }
        return parentRecordId.ToString();
    }

    private object NormalizeObjectValue(object? value)
    {
        if (value is JsonElement je)
        {
            return je.ValueKind == JsonValueKind.String ? (je.GetString() ?? "") :
                   je.ValueKind == JsonValueKind.Number ? je.GetDecimal() :
                   je.ValueKind == JsonValueKind.True ? true :
                   je.ValueKind == JsonValueKind.False ? false :
                   value ?? "";
        }
        return value ?? "";
    }

    private async Task LoadPublishedChildRecords(
        List<Dictionary<string, object?>> childList,
        CollectionDefinition relatedCollection,
        string childKey,
        string parentKeyValue)
    {
        try
        {
            var childEntities = await _sqlRecordStore.ListAsync(relatedCollection);
            foreach (var child in childEntities)
            {
                try
                {
                    var childData = JsonSerializer.Deserialize<Dictionary<string, object?>>(child.DataJson) ?? new();
                    if (!childData.TryGetValue(childKey, out var fkVal) || fkVal == null)
                        continue;

                    var fkNormalized = NormalizeObjectValue(fkVal).ToString() ?? "";
                    if (!string.Equals(fkNormalized, parentKeyValue, StringComparison.OrdinalIgnoreCase))
                        continue;

                    childData["id"] = child.Id;
                    childData["created"] = child.CreatedAt;
                    childData["updated"] = child.UpdatedAt;
                    childList.Add(childData);
                }
                catch (Exception ex)
                {
                    System.Diagnostics.Debug.WriteLine($"[LoadPublishedChildRecords] Failed to process child record {child.Id}: {ex.Message}");
                    // Continue processing other records
                }
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[LoadPublishedChildRecords] Failed to list published records from {relatedCollection.Slug}: {ex.Message}");
            throw;
        }
    }

    private async Task LoadDraftChildRecords(
        List<Dictionary<string, object?>> childList,
        CollectionDefinition relatedCollection,
        string childKey,
        string parentKeyValue)
    {
        try
        {
            var childRecords = await _db.Records
                .Where(r => r.CollectionDefinitionId == relatedCollection.Id)
                .ToListAsync();

            foreach (var child in childRecords)
            {
                try
                {
                    var childData = JsonSerializer.Deserialize<Dictionary<string, object?>>(child.DataJson) ?? new();
                    if (!childData.TryGetValue(childKey, out var fkVal) || fkVal == null)
                        continue;

                    var fkNormalized = NormalizeObjectValue(fkVal).ToString() ?? "";
                    if (!string.Equals(fkNormalized, parentKeyValue, StringComparison.OrdinalIgnoreCase))
                        continue;

                    childData["id"] = child.Id;
                    childData["created"] = child.CreatedAt;
                    childData["updated"] = child.UpdatedAt;
                    childList.Add(childData);
                }
                catch (Exception ex)
                {
                    System.Diagnostics.Debug.WriteLine($"[LoadDraftChildRecords] Failed to process draft record {child.Id}: {ex.Message}");
                    // Continue processing other records
                }
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[LoadDraftChildRecords] Failed to list draft records from {relatedCollection.Slug}: {ex.Message}");
            throw;
        }
    }
}
