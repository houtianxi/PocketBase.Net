using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PocketbaseNet.Api.Contracts;
using PocketbaseNet.Api.Domain.Entities;
using PocketbaseNet.Api.Infrastructure;
using PocketbaseNet.Api.Infrastructure.Auth;
using PocketbaseNet.Api.Infrastructure.Exceptions;
using PocketbaseNet.Api.Infrastructure.Services;

namespace PocketbaseNet.Api.Controllers;

[ApiController]
[Route("api/records/{collectionSlug}")]
public class RecordsController(
    AppDbContext db,
    RuleEvaluator ruleEvaluator,
    RelationExpander relationExpander,
    EventBus eventBus,
    CurrentUserAccessor currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<object>> List(
        string collectionSlug,
        [FromQuery] int page = 1,
        [FromQuery] int perPage = 20,
        [FromQuery] string? sort = null,
        [FromQuery] string? filter = null,
        [FromQuery] string? search = null,
        [FromQuery] string? fields = null,
        [FromQuery] string? expand = null)
    {
        var collection = await db.Collections
            .Include(c => c.Fields)
            .FirstOrDefaultAsync(x => x.Slug == collectionSlug);

        if (collection is null)
        {
            throw new NotFoundException($"Collection '{collectionSlug}' not found");
        }

        if (!ruleEvaluator.CanList(collection))
        {
            throw new ForbiddenException();
        }

        page = Math.Max(1, page);
        perPage = Math.Clamp(perPage, 1, 100);

        var query = db.Records.AsNoTracking().Where(x => x.CollectionDefinitionId == collection.Id);

        if (collection.ListRule == Domain.Enums.RuleAccessLevel.Owner && !currentUser.IsAdmin)
        {
            query = query.Where(x => x.OwnerId == currentUser.UserId);
        }

        // Load all records to apply client-side filters
        var allRecords = await query.OrderByDescending(x => x.CreatedAt).ToListAsync();

        // Parse and apply filters
        var parsedFilters = QueryParser.ParseFilter(filter);
        var parsedSorts = QueryParser.ParseSort(sort);
        var selectedFields = QueryParser.ParseFields(fields);

        // Apply filters and search on client side (for JSON data)
        var filteredRecords = allRecords.Where(r =>
        {
            var data = JsonSerializer.Deserialize<Dictionary<string, object?>>(r.DataJson) ?? new();
            var passed = QueryParser.ApplyFilters(data, parsedFilters, collection.Fields.ToList());
            passed = passed && QueryParser.ApplySearch(data, search);
            return passed;
        }).ToList();

        // Apply sorting
        var sortedRecords = ApplySorting(filteredRecords, parsedSorts);

        // Apply pagination
        var total = sortedRecords.Count;
        var paginatedRecords = sortedRecords
            .Skip((page - 1) * perPage)
            .Take(perPage)
            .ToList();

        // Parse expand fields
        var expandFields = RelationExpander.ParseExpandFields(expand);

        // Map to responses with relation expansion
        var responses = new List<RecordResponse>();
        foreach (var record in paginatedRecords)
        {
            var response = ToResponse(record, collectionSlug, selectedFields);
            
            // Expand relations if requested
            if (expandFields.Count > 0)
            {
                var data = JsonSerializer.Deserialize<Dictionary<string, object?>>(record.DataJson) ?? new();
                data = await relationExpander.ExpandRelations(data, collection.Fields.ToList(), expandFields);
                
                // Rebuild response with expanded data
                response = new RecordResponse(
                    record.Id,
                    record.CollectionDefinitionId,
                    collectionSlug,
                    data,
                    record.OwnerId,
                    record.CreatedAt,
                    record.UpdatedAt);
            }
            
            responses.Add(response);
        }

        return Ok(new
        {
            page,
            perPage,
            totalItems = total,
            totalPages = (total + perPage - 1) / perPage,
            items = responses
        });
    }

    /// <summary>
    /// Server-Sent Events (SSE) endpoint for real-time record updates
    /// Usage: new EventSource('/api/records/{slug}/subscribe')
    /// </summary>
    [HttpGet("subscribe")]
    public async Task Subscribe(string collectionSlug)
    {
        var collection = await db.Collections.FirstOrDefaultAsync(x => x.Slug == collectionSlug);
        if (collection is null)
        {
            throw new NotFoundException($"Collection '{collectionSlug}' not found");
        }

        Response.ContentType = "text/event-stream";
        Response.Headers["Cache-Control"] = "no-cache";
        Response.Headers["Connection"] = "keep-alive";

        // Subscribe to events
        var channel = eventBus.Subscribe(collectionSlug);
        var reader = channel.Reader;

        try
        {
            while (await reader.WaitToReadAsync())
            {
                while (reader.TryRead(out var evt))
                {
                    var json = JsonSerializer.Serialize(evt);
                    await Response.WriteAsync($"data: {json}\n\n");
                    await Response.Body.FlushAsync();
                }
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"SSE error: {ex.Message}");
        }
        finally
        {
            channel.Writer.TryComplete();
        }
    }

    private List<EntityRecord> ApplySorting(List<EntityRecord> records, List<SortExpression> sorts)
    {
        if (sorts.Count == 0)
            return records.OrderByDescending(r => r.CreatedAt).ToList();

        IOrderedEnumerable<EntityRecord>? ordered = null;

        foreach (var sort in sorts)
        {
            var fieldName = sort.FieldName.ToLowerInvariant();

            var sortFunc = new Func<EntityRecord, IComparable?>(r =>
            {
                var data = JsonSerializer.Deserialize<Dictionary<string, object?>>(r.DataJson) ?? new();
                if (data.TryGetValue(fieldName, out var value))
                {
                    return value as IComparable ?? (value?.GetHashCode() ?? 0) as IComparable;
                }

                return fieldName switch
                {
                    "id" => r.Id,
                    "created" => r.CreatedAt,
                    "updated" => r.UpdatedAt,
                    _ => null
                };
            });

            if (ordered == null)
            {
                ordered = sort.IsDescending
                    ? records.OrderByDescending(sortFunc)
                    : records.OrderBy(sortFunc);
            }
            else
            {
                ordered = sort.IsDescending
                    ? ordered.ThenByDescending(sortFunc)
                    : ordered.ThenBy(sortFunc);
            }
        }

        return ordered?.ToList() ?? records;
    }

    [Authorize]
    [HttpPost]
    public async Task<ActionResult<RecordResponse>> Create(string collectionSlug, [FromBody] RecordCreateRequest request)
    {
        var collection = await db.Collections
            .Include(c => c.Fields)
            .FirstOrDefaultAsync(x => x.Slug == collectionSlug);
        if (collection is null)
        {
            throw new NotFoundException($"Collection '{collectionSlug}' not found");
        }

        if (!ruleEvaluator.CanCreate(collection))
        {
            throw new ForbiddenException();
        }

        var normalizedData = NormalizeAndValidateData(request.Data, collection.Fields.Where(f => !f.IsSystem).ToList(), isCreate: true);

        var record = new EntityRecord
        {
            CollectionDefinitionId = collection.Id,
            DataJson = JsonSerializer.Serialize(normalizedData),
            OwnerId = currentUser.IsAuthenticated ? currentUser.UserId : null,
            CreatedById = currentUser.UserId,
            UpdatedById = currentUser.UserId,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        db.Records.Add(record);
        db.AuditLogs.Add(new AuditLog
        {
            ActorId = currentUser.UserId,
            Action = "records.create",
            ResourceType = collectionSlug,
            ResourceId = record.Id.ToString(),
            DetailJson = "{}"
        });
        await db.SaveChangesAsync();

        // Publish create event
        await eventBus.PublishAsync(new EventBus.Event
        {
            Type = "record",
            CollectionSlug = collectionSlug,
            Action = "create",
            RecordId = record.Id.ToString(),
            Data = normalizedData
        });

        return Ok(ToResponse(record, collectionSlug));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<RecordResponse>> Get(string collectionSlug, Guid id)
    {
        var collection = await db.Collections.FirstOrDefaultAsync(x => x.Slug == collectionSlug);
        if (collection is null)
        {
            throw new NotFoundException($"Collection '{collectionSlug}' not found");
        }

        var record = await db.Records.FirstOrDefaultAsync(x => x.Id == id && x.CollectionDefinitionId == collection.Id);
        if (record is null)
        {
            throw new NotFoundException($"Record '{id}' not found in collection '{collectionSlug}'");
        }

        if (!ruleEvaluator.CanView(collection, record) && !currentUser.IsAdmin)
        {
            throw new ForbiddenException();
        }

        return Ok(ToResponse(record, collectionSlug));
    }

    [Authorize]
    [HttpPut("{id:guid}")]
    public async Task<ActionResult<RecordResponse>> Update(string collectionSlug, Guid id, [FromBody] RecordUpdateRequest request)
    {
        var collection = await db.Collections
            .Include(c => c.Fields)
            .FirstOrDefaultAsync(x => x.Slug == collectionSlug);
        if (collection is null)
        {
            throw new NotFoundException($"Collection '{collectionSlug}' not found");
        }

        var record = await db.Records.FirstOrDefaultAsync(x => x.Id == id && x.CollectionDefinitionId == collection.Id);
        if (record is null)
        {
            throw new NotFoundException($"Record '{id}' not found in collection '{collectionSlug}'");
        }

        if (!ruleEvaluator.CanUpdate(collection, record) && !currentUser.IsAdmin)
        {
            throw new ForbiddenException();
        }

        var normalizedData = NormalizeAndValidateData(request.Data, collection.Fields.Where(f => !f.IsSystem).ToList(), isCreate: false);

        record.DataJson = JsonSerializer.Serialize(normalizedData);
        record.UpdatedById = currentUser.UserId;
        record.UpdatedAt = DateTimeOffset.UtcNow;

        db.AuditLogs.Add(new AuditLog
        {
            ActorId = currentUser.UserId,
            Action = "records.update",
            ResourceType = collectionSlug,
            ResourceId = record.Id.ToString(),
            DetailJson = "{}"
        });
        await db.SaveChangesAsync();

        // Publish update event
        await eventBus.PublishAsync(new EventBus.Event
        {
            Type = "record",
            CollectionSlug = collectionSlug,
            Action = "update",
            RecordId = record.Id.ToString(),
            Data = normalizedData
        });

        return Ok(ToResponse(record, collectionSlug));
    }

    /// <summary>
    /// Analyse all records in a collection and report JSON keys that do not match
    /// any currently defined field (i.e. orphaned / legacy keys).
    /// Admin only.
    /// </summary>
    [Authorize]
    [HttpGet("analyze-data")]
    public async Task<ActionResult> AnalyzeData(string collectionSlug)
    {
        var collection = await db.Collections
            .Include(c => c.Fields)
            .FirstOrDefaultAsync(x => x.Slug == collectionSlug);

        if (collection is null)
            return NotFound(new { message = "Collection not found" });

        if (!currentUser.IsAdmin)
            return Forbid();

        var validNames = new HashSet<string>(
            collection.Fields.Select(f => f.Name),
            StringComparer.OrdinalIgnoreCase);

        var records = await db.Records
            .AsNoTracking()
            .Where(r => r.CollectionDefinitionId == collection.Id)
            .ToListAsync();

        var orphanCounts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        foreach (var record in records)
        {
            try
            {
                var data = JsonSerializer.Deserialize<Dictionary<string, object?>>(record.DataJson) ?? new();
                foreach (var key in data.Keys)
                {
                    if (!validNames.Contains(key))
                    {
                        orphanCounts.TryGetValue(key, out var cnt);
                        orphanCounts[key] = cnt + 1;
                    }
                }
            }
            catch { }
        }

        return Ok(new
        {
            totalRecords = records.Count,
            validFields = collection.Fields
                .Where(f => !f.IsSystem)
                .OrderBy(f => f.DisplayOrder)
                .Select(f => new { f.Name, f.Label })
                .ToList(),
            orphanedKeys = orphanCounts
                .Select(kvp => new { key = kvp.Key, recordCount = kvp.Value })
                .OrderByDescending(x => x.recordCount)
                .ToList()
        });
    }

    /// <summary>
    /// Remap (or delete) orphaned JSON keys in all records of a collection.
    /// Body: { "keyMap": { "oldKey": "newFieldName" } }
    /// Set newFieldName to "" to delete the key instead of remapping it.
    /// Admin only.
    /// </summary>
    [Authorize]
    [HttpPost("repair-data")]
    public async Task<ActionResult> RepairData(string collectionSlug, [FromBody] RepairDataRequest request)
    {
        var collection = await db.Collections
            .FirstOrDefaultAsync(x => x.Slug == collectionSlug);

        if (collection is null)
            return NotFound(new { message = "Collection not found" });

        if (!currentUser.IsAdmin)
            return Forbid();

        var records = await db.Records
            .Where(r => r.CollectionDefinitionId == collection.Id)
            .ToListAsync();

        int repairedCount = 0;

        foreach (var record in records)
        {
            try
            {
                var data = JsonSerializer.Deserialize<Dictionary<string, object?>>(record.DataJson) ?? new();
                bool changed = false;

                foreach (var (oldKey, newKey) in request.KeyMap)
                {
                    var existingKey = data.Keys.FirstOrDefault(k =>
                        string.Equals(k, oldKey, StringComparison.OrdinalIgnoreCase));

                    if (existingKey is null) continue;

                    if (data.TryGetValue(existingKey, out var value))
                    {
                        data.Remove(existingKey);
                        if (!string.IsNullOrWhiteSpace(newKey))
                            data[newKey] = value;
                        changed = true;
                    }
                }

                if (changed)
                {
                    record.DataJson = JsonSerializer.Serialize(data);
                    record.UpdatedAt = DateTimeOffset.UtcNow;
                    repairedCount++;
                }
            }
            catch { }
        }

        await db.SaveChangesAsync();

        return Ok(new { repairedCount, totalRecords = records.Count });
    }

    [Authorize]
    [HttpDelete("{id:guid}")]
    public async Task<ActionResult> Delete(string collectionSlug, Guid id)
    {
        var collection = await db.Collections.FirstOrDefaultAsync(x => x.Slug == collectionSlug);
        if (collection is null)
        {
            throw new NotFoundException($"Collection '{collectionSlug}' not found");
        }

        var record = await db.Records.FirstOrDefaultAsync(x => x.Id == id && x.CollectionDefinitionId == collection.Id);
        if (record is null)
        {
            throw new NotFoundException($"Record '{id}' not found in collection '{collectionSlug}'");
        }

        if (!ruleEvaluator.CanDelete(collection, record) && !currentUser.IsAdmin)
        {
            throw new ForbiddenException();
        }

        db.Records.Remove(record);
        db.AuditLogs.Add(new AuditLog
        {
            ActorId = currentUser.UserId,
            Action = "records.delete",
            ResourceType = collectionSlug,
            ResourceId = record.Id.ToString(),
            DetailJson = "{}"
        });
        await db.SaveChangesAsync();

        // Publish delete event
        await eventBus.PublishAsync(new EventBus.Event
        {
            Type = "record",
            CollectionSlug = collectionSlug,
            Action = "delete",
            RecordId = record.Id.ToString()
        });

        return Ok();
    }

    [Authorize]
    [HttpGet("export")]
    public async Task<ActionResult> Export(string collectionSlug)
    {
        var collection = await db.Collections
            .Include(c => c.Fields)
            .FirstOrDefaultAsync(x => x.Slug == collectionSlug);

        if (collection is null)
            throw new NotFoundException($"Collection '{collectionSlug}' not found");

        if (!currentUser.IsAdmin && !ruleEvaluator.CanList(collection))
            throw new ForbiddenException();

        var records = await db.Records
            .AsNoTracking()
            .Where(x => x.CollectionDefinitionId == collection.Id)
            .OrderBy(x => x.CreatedAt)
            .ToListAsync();

        var items = records.Select(r => ToResponse(r, collectionSlug)).ToList();

        var export = new
        {
            collection = collectionSlug,
            exportedAt = DateTime.UtcNow,
            count = items.Count,
            items
        };

        var json = JsonSerializer.Serialize(export, new JsonSerializerOptions { WriteIndented = true });
        var bytes = System.Text.Encoding.UTF8.GetBytes(json);
        return File(bytes, "application/json", $"{collectionSlug}-export.json");
    }

    [Authorize]
    [HttpPost("import")]
    public async Task<ActionResult<object>> Import(string collectionSlug, [FromBody] JsonElement body)
    {
        if (!currentUser.IsAdmin)
            throw new ForbiddenException();

        var collection = await db.Collections
            .Include(c => c.Fields)
            .FirstOrDefaultAsync(x => x.Slug == collectionSlug);

        if (collection is null)
            throw new NotFoundException($"Collection '{collectionSlug}' not found");

        // Accept either array of records or { items: [...] } envelope
        JsonElement[] itemsArray;
        if (body.ValueKind == JsonValueKind.Array)
        {
            itemsArray = body.EnumerateArray().ToArray();
        }
        else if (body.ValueKind == JsonValueKind.Object && body.TryGetProperty("items", out var itemsProp))
        {
            itemsArray = itemsProp.EnumerateArray().ToArray();
        }
        else
        {
            return BadRequest(new { code = 400, message = "Expected JSON array or { items: [...] } object" });
        }

        var created = 0;
        var skipped = 0;

        foreach (var item in itemsArray)
        {
            try
            {
                // Extract data - support both flat format and { data: {...} } envelope
                Dictionary<string, object?> dataDict;
                if (item.TryGetProperty("data", out var dataProp))
                {
                    dataDict = JsonSerializer.Deserialize<Dictionary<string, object?>>(dataProp.GetRawText()) ?? new();
                }
                else
                {
                    dataDict = JsonSerializer.Deserialize<Dictionary<string, object?>>(item.GetRawText()) ?? new();
                    // Remove system fields
                    foreach (var key in new[] { "id", "created", "updated", "collectionId", "collectionSlug", "ownerId" })
                        dataDict.Remove(key);
                }

                var record = new EntityRecord
                {
                    CollectionDefinitionId = collection.Id,
                    OwnerId = currentUser.UserId,
                    DataJson = JsonSerializer.Serialize(dataDict)
                };

                db.Records.Add(record);
                db.AuditLogs.Add(new AuditLog
                {
                    ActorId = currentUser.UserId,
                    Action = "records.import",
                    ResourceType = collectionSlug,
                    ResourceId = record.Id.ToString(),
                    DetailJson = "{}"
                });
                created++;
            }
            catch
            {
                skipped++;
            }
        }

        await db.SaveChangesAsync();

        return Ok(new { created, skipped, total = itemsArray.Length });
    }

    private static Dictionary<string, object?> NormalizeAndValidateData(
        Dictionary<string, object?> input,
        List<Field> fields,
        bool isCreate)
    {
        var result = new Dictionary<string, object?>(input, StringComparer.OrdinalIgnoreCase);

        foreach (var field in fields)
        {
            var config = ParseConfig(field.Config);
            var hasValue = result.TryGetValue(field.Name, out var rawValue);

            if (!hasValue && isCreate && config.TryGetValue("defaultValue", out var defaultValue))
            {
                result[field.Name] = NormalizeJsonValue(defaultValue);
                hasValue = true;
                rawValue = result[field.Name];
            }

            if (!hasValue)
                continue;

            var value = NormalizeJsonValue(rawValue);

            switch (field.Type)
            {
                case Domain.Enums.FieldType.Number:
                {
                    if (value is null || (value is string s && string.IsNullOrWhiteSpace(s)))
                    {
                        result[field.Name] = null;
                        break;
                    }

                    if (!TryToDouble(value, out var number))
                        throw CreateFieldValidationException(field, $"{GetFieldDisplayName(field)} 必须是数字");

                    if (config.TryGetValue("min", out var minObj) && TryToDouble(minObj, out var min) && number < min)
                        throw CreateFieldValidationException(field, $"{GetFieldDisplayName(field)} 必须大于等于 {FormatNumericValue(min)}");

                    if (config.TryGetValue("max", out var maxObj) && TryToDouble(maxObj, out var max) && number > max)
                        throw CreateFieldValidationException(field, $"{GetFieldDisplayName(field)} 必须小于等于 {FormatNumericValue(max)}");

                    result[field.Name] = number;
                    break;
                }
                case Domain.Enums.FieldType.Checkbox:
                {
                    if (TryToBool(value, out var boolValue))
                    {
                        result[field.Name] = boolValue;
                    }
                    else
                    {
                        throw CreateFieldValidationException(field, $"{GetFieldDisplayName(field)} 必须是 true 或 false");
                    }
                    break;
                }
                case Domain.Enums.FieldType.Select:
                {
                    var selectValue = value?.ToString() ?? string.Empty;
                    var values = ParseStringArray(config.TryGetValue("values", out var optionsObj) ? optionsObj : null);
                    if (values.Count > 0 && !string.IsNullOrWhiteSpace(selectValue) && !values.Contains(selectValue))
                        throw CreateFieldValidationException(field, $"{GetFieldDisplayName(field)} 的值 '{selectValue}' 不在可选项中");

                    result[field.Name] = selectValue;
                    break;
                }
                case Domain.Enums.FieldType.Relation:
                {
                    var relationType = config.TryGetValue("relationType", out var relationTypeObj)
                        ? relationTypeObj?.ToString() ?? "oneToMany"
                        : "oneToMany";

                    if (relationType == "manyToMany")
                    {
                        var ids = ExtractRelationIds(value);
                        result[field.Name] = ids;
                    }
                    else
                    {
                        var ids = ExtractRelationIds(value);
                        result[field.Name] = ids.FirstOrDefault() ?? string.Empty;
                    }
                    break;
                }
            }
        }

        return result;
    }

    private static ValidationException CreateFieldValidationException(Field field, string message)
    {
        return new ValidationException(message, new Dictionary<string, List<string>>
        {
            [field.Name] = new() { message }
        });
    }

    private static string GetFieldDisplayName(Field field)
    {
        return string.IsNullOrWhiteSpace(field.Description)
            ? field.Name
            : field.Description.Trim();
    }

    private static string FormatNumericValue(double value)
    {
        return Math.Abs(value % 1) < 0.0000001
            ? value.ToString("0")
            : value.ToString("0.##");
    }

    private static Dictionary<string, object?> ParseConfig(JsonElement config)
    {
        try
        {
            if (config.ValueKind == JsonValueKind.Null || config.ValueKind == JsonValueKind.Undefined)
                return new();
            return JsonSerializer.Deserialize<Dictionary<string, object?>>(config.GetRawText()) ?? new();
        }
        catch
        {
            return new();
        }
    }

    private static object? NormalizeJsonValue(object? value)
    {
        if (value is not JsonElement elem)
            return value;

        return elem.ValueKind switch
        {
            JsonValueKind.String => elem.GetString(),
            JsonValueKind.Number => elem.TryGetInt64(out var longValue) ? longValue : elem.GetDouble(),
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Array => elem.EnumerateArray().Select(e => NormalizeJsonValue(e)).ToList(),
            JsonValueKind.Object => JsonSerializer.Deserialize<Dictionary<string, object?>>(elem.GetRawText()) ?? new Dictionary<string, object?>(),
            _ => null
        };
    }

    private static bool TryToDouble(object? value, out double number)
    {
        number = 0;
        if (value is null) return false;
        if (value is double d) { number = d; return true; }
        if (value is float f) { number = f; return true; }
        if (value is decimal m) { number = (double)m; return true; }
        if (value is int i) { number = i; return true; }
        if (value is long l) { number = l; return true; }
        return double.TryParse(value.ToString(), out number);
    }

    private static bool TryToBool(object? value, out bool boolValue)
    {
        boolValue = false;
        if (value is bool b) { boolValue = b; return true; }
        return bool.TryParse(value?.ToString(), out boolValue);
    }

    private static List<string> ParseStringArray(object? value)
    {
        if (value is null) return new();

        if (value is JsonElement elem && elem.ValueKind == JsonValueKind.Array)
        {
            return elem.EnumerateArray()
                .Select(x => x.GetString())
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Select(x => x!)
                .ToList();
        }

        if (value is IEnumerable<object?> list)
        {
            return list.Select(x => x?.ToString())
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Select(x => x!)
                .ToList();
        }

        return new();
    }

    private static List<string> ExtractRelationIds(object? value)
    {
        var normalized = NormalizeJsonValue(value);
        var ids = new List<string>();

        if (normalized is null)
            return ids;

        if (normalized is string single)
        {
            if (!string.IsNullOrWhiteSpace(single)) ids.Add(single.Trim());
            return ids;
        }

        if (normalized is Dictionary<string, object?> singleObject)
        {
            if (singleObject.TryGetValue("id", out var idObj) && idObj != null)
            {
                var id = idObj.ToString();
                if (!string.IsNullOrWhiteSpace(id)) ids.Add(id.Trim());
            }
            return ids;
        }

        if (normalized is IEnumerable<object?> list)
        {
            foreach (var item in list)
            {
                if (item is string idText)
                {
                    if (!string.IsNullOrWhiteSpace(idText)) ids.Add(idText.Trim());
                    continue;
                }

                if (item is Dictionary<string, object?> itemObject && itemObject.TryGetValue("id", out var idObj) && idObj != null)
                {
                    var id = idObj.ToString();
                    if (!string.IsNullOrWhiteSpace(id)) ids.Add(id.Trim());
                }
            }
        }

        return ids.Distinct().ToList();
    }

    private static RecordResponse ToResponse(EntityRecord record, string collectionSlug, List<string>? selectedFields = null)
    {
        Dictionary<string, object?> data;
        try
        {
            data = JsonSerializer.Deserialize<Dictionary<string, object?>>(record.DataJson) ?? new Dictionary<string, object?>();
        }
        catch
        {
            data = new Dictionary<string, object?>();
        }

        // If no fields selected, include id, created, updated + all data fields
        if (selectedFields == null || selectedFields.Count == 0)
        {
            data["id"] = record.Id;
            data["created"] = record.CreatedAt;
            data["updated"] = record.UpdatedAt;
        }
        else
        {
            // Filter to selected fields only
            var filtered = new Dictionary<string, object?>();

            // Always include id, created, updated if in selected fields
            if (selectedFields.Contains("id"))
                filtered["id"] = record.Id;
            if (selectedFields.Contains("created"))
                filtered["created"] = record.CreatedAt;
            if (selectedFields.Contains("updated"))
                filtered["updated"] = record.UpdatedAt;

            // Add selected data fields
            foreach (var field in selectedFields)
            {
                if (new[] { "id", "created", "updated" }.Contains(field))
                    continue;

                if (data.TryGetValue(field, out var value))
                    filtered[field] = value;
            }

            data = filtered;
        }

        return new RecordResponse(
            record.Id,
            record.CollectionDefinitionId,
            collectionSlug,
            data,
            record.OwnerId,
            record.CreatedAt,
            record.UpdatedAt);
    }
}
