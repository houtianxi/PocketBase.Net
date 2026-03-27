using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PocketbaseNet.Api.Contracts;
using PocketbaseNet.Api.Domain.Entities;
using PocketbaseNet.Api.Infrastructure;
using PocketbaseNet.Api.Infrastructure.Auth;
using PocketbaseNet.Api.Infrastructure.Services;

namespace PocketbaseNet.Api.Controllers;

[ApiController]
[Route("api/records/{collectionSlug}")]
public class RecordsController(
    AppDbContext db,
    RuleEvaluator ruleEvaluator,
    CurrentUserAccessor currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<object>> List(
        string collectionSlug,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? sort = null,
        [FromQuery] string? filter = null,
        [FromQuery] string? search = null,
        [FromQuery] string? fields = null)
    {
        var collection = await db.Collections
            .Include(c => c.Fields)
            .FirstOrDefaultAsync(x => x.Slug == collectionSlug);

        if (collection is null)
        {
            return NotFound(new { message = "Collection not found" });
        }

        if (!ruleEvaluator.CanList(collection))
        {
            return Forbid();
        }

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

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
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToList();

        // Map to responses
        var responses = paginatedRecords.Select(r => ToResponse(r, collectionSlug, selectedFields)).ToList();

        return Ok(new
        {
            page,
            pageSize,
            totalItems = total,
            totalPages = (total + pageSize - 1) / pageSize,
            items = responses
        });
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
        var collection = await db.Collections.FirstOrDefaultAsync(x => x.Slug == collectionSlug);
        if (collection is null)
        {
            return NotFound(new { message = "Collection not found" });
        }

        if (!ruleEvaluator.CanCreate(collection))
        {
            return Forbid();
        }

        var record = new EntityRecord
        {
            CollectionDefinitionId = collection.Id,
            DataJson = JsonSerializer.Serialize(request.Data),
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

        return Ok(ToResponse(record, collectionSlug));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<RecordResponse>> Get(string collectionSlug, Guid id)
    {
        var collection = await db.Collections.FirstOrDefaultAsync(x => x.Slug == collectionSlug);
        if (collection is null)
        {
            return NotFound(new { message = "Collection not found" });
        }

        var record = await db.Records.FirstOrDefaultAsync(x => x.Id == id && x.CollectionDefinitionId == collection.Id);
        if (record is null)
        {
            return NotFound();
        }

        if (!ruleEvaluator.CanView(collection, record) && !currentUser.IsAdmin)
        {
            return Forbid();
        }

        return Ok(ToResponse(record, collectionSlug));
    }

    [Authorize]
    [HttpPut("{id:guid}")]
    public async Task<ActionResult<RecordResponse>> Update(string collectionSlug, Guid id, [FromBody] RecordUpdateRequest request)
    {
        var collection = await db.Collections.FirstOrDefaultAsync(x => x.Slug == collectionSlug);
        if (collection is null)
        {
            return NotFound(new { message = "Collection not found" });
        }

        var record = await db.Records.FirstOrDefaultAsync(x => x.Id == id && x.CollectionDefinitionId == collection.Id);
        if (record is null)
        {
            return NotFound();
        }

        if (!ruleEvaluator.CanUpdate(collection, record) && !currentUser.IsAdmin)
        {
            return Forbid();
        }

        record.DataJson = JsonSerializer.Serialize(request.Data);
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
            return NotFound(new { message = "Collection not found" });
        }

        var record = await db.Records.FirstOrDefaultAsync(x => x.Id == id && x.CollectionDefinitionId == collection.Id);
        if (record is null)
        {
            return NotFound();
        }

        if (!ruleEvaluator.CanDelete(collection, record) && !currentUser.IsAdmin)
        {
            return Forbid();
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

        return Ok();
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
