using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PocketbaseNet.Api.Contracts;
using PocketbaseNet.Api.Domain.Entities;
using PocketbaseNet.Api.Infrastructure;
using PocketbaseNet.Api.Infrastructure.Services;

namespace PocketbaseNet.Api.Controllers;

[ApiController]
[Authorize(Roles = "Admin")]
[Route("api/collections")]
public class CollectionsController(
    AppDbContext db,
    CollectionPublishService publishService,
    ApiPreviewService apiPreviewService,
    ApplicationSettingsService settingsService,
    AuditLogService auditLogService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IEnumerable<CollectionResponse>>> List()
    {
        var items = await db.Collections
            .OrderBy(x => x.Name)
            .Select(x => new CollectionResponse(
                x.Id, x.Name, x.Slug, x.Description, x.SchemaJson,
                x.ListRule, x.ViewRule, x.CreateRule, x.UpdateRule, x.DeleteRule,
                x.OwnerField, x.CreatedAt, x.UpdatedAt))
            .ToListAsync();

        return Ok(items);
    }

    [HttpPost]
    public async Task<ActionResult<CollectionResponse>> Create(CollectionUpsertRequest request)
    {
        var exists = await db.Collections.AnyAsync(x => x.Slug == request.Slug);
        if (exists)
        {
            return Conflict(new { message = "Collection slug already exists" });
        }

        var collection = new CollectionDefinition
        {
            Name = request.Name,
            Slug = request.Slug.Trim().ToLowerInvariant(),
            Description = request.Description,
            SchemaJson = string.IsNullOrWhiteSpace(request.SchemaJson) ? "{}" : request.SchemaJson,
            ListRule = request.ListRule,
            ViewRule = request.ViewRule,
            CreateRule = request.CreateRule,
            UpdateRule = request.UpdateRule,
            DeleteRule = request.DeleteRule,
            OwnerField = request.OwnerField,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        db.Collections.Add(collection);
        await auditLogService.AddAsync(new AuditLog
        {
            ActorId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value,
            Action = "collections.create",
            ResourceType = "collection",
            ResourceId = collection.Id.ToString(),
            DetailJson = "{}"
        });
        await db.SaveChangesAsync();

        return Ok(new CollectionResponse(
            collection.Id, collection.Name, collection.Slug, collection.Description, collection.SchemaJson,
            collection.ListRule, collection.ViewRule, collection.CreateRule, collection.UpdateRule, collection.DeleteRule,
            collection.OwnerField, collection.CreatedAt, collection.UpdatedAt));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult> Update(Guid id, CollectionUpsertRequest request)
    {
        var collection = await db.Collections.FirstOrDefaultAsync(x => x.Id == id);
        if (collection is null)
        {
            return NotFound();
        }

        collection.Name = request.Name;
        collection.Slug = request.Slug.Trim().ToLowerInvariant();
        collection.Description = request.Description;
        collection.SchemaJson = string.IsNullOrWhiteSpace(request.SchemaJson) ? "{}" : request.SchemaJson;
        collection.ListRule = request.ListRule;
        collection.ViewRule = request.ViewRule;
        collection.CreateRule = request.CreateRule;
        collection.UpdateRule = request.UpdateRule;
        collection.DeleteRule = request.DeleteRule;
        collection.OwnerField = request.OwnerField;
        collection.UpdatedAt = DateTimeOffset.UtcNow;

        await auditLogService.AddAsync(new AuditLog
        {
            ActorId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value,
            Action = "collections.update",
            ResourceType = "collection",
            ResourceId = collection.Id.ToString(),
            DetailJson = "{}"
        });
        await db.SaveChangesAsync();

        return Ok();
    }

    [HttpDelete("{id:guid}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        var collection = await db.Collections
            .Include(c => c.Fields)
            .FirstOrDefaultAsync(x => x.Id == id);
        if (collection is null)
        {
            return NotFound();
        }

        // Delete all fields associated with this collection
        if (collection.Fields != null)
        {
            db.Fields.RemoveRange(collection.Fields);
        }

        // Delete all records in this collection
        var records = await db.Records.Where(r => r.CollectionDefinitionId == id).ToListAsync();
        if (records.Any())
        {
            db.Records.RemoveRange(records);
        }

        db.Collections.Remove(collection);
        await auditLogService.AddAsync(new AuditLog
        {
            ActorId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value,
            Action = "collections.delete",
            ResourceType = "collection",
            ResourceId = collection.Id.ToString(),
            DetailJson = "{}"
        });
        await db.SaveChangesAsync();

        return Ok();
    }

    [HttpPost("{id:guid}/truncate")]
    public async Task<ActionResult> Truncate(Guid id)
    {
        var collection = await db.Collections.FirstOrDefaultAsync(x => x.Id == id);
        if (collection is null)
        {
            return NotFound();
        }

        // Delete all records in this collection
        var records = await db.Records.Where(r => r.CollectionDefinitionId == id).ToListAsync();
        if (records.Any())
        {
            db.Records.RemoveRange(records);
        }

        await auditLogService.AddAsync(new AuditLog
        {
            ActorId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value,
            Action = "collections.truncate",
            ResourceType = "collection",
            ResourceId = collection.Id.ToString(),
            DetailJson = "{}"
        });
        await db.SaveChangesAsync();

        return Ok();
    }

    [HttpPost("{id:guid}/duplicate")]
    public async Task<ActionResult<CollectionResponse>> Duplicate(Guid id)
    {
        var original = await db.Collections
            .Include(c => c.Fields)
            .FirstOrDefaultAsync(x => x.Id == id);
        if (original is null)
        {
            return NotFound();
        }

        var newCollection = new CollectionDefinition
        {
            Name = $"{original.Name}_Duplicate",
            Slug = $"{original.Slug}_duplicate",
            Description = original.Description,
            SchemaJson = original.SchemaJson,
            ListRule = original.ListRule,
            ViewRule = original.ViewRule,
            CreateRule = original.CreateRule,
            UpdateRule = original.UpdateRule,
            DeleteRule = original.DeleteRule,
            OwnerField = original.OwnerField,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        db.Collections.Add(newCollection);
        await db.SaveChangesAsync();

        // Duplicate fields (without data)
        if (original.Fields != null)
        {
            foreach (var field in original.Fields.Where(f => !f.IsSystem))
            {
                var newField = new Field
                {
                    CollectionDefinitionId = newCollection.Id,
                    Name = field.Name,
                    Label = field.Label,
                    Type = field.Type,
                    IsRequired = field.IsRequired,
                    IsUnique = field.IsUnique,
                    DefaultValue = field.DefaultValue,
                    Config = field.Config,
                    ValidationRules = field.ValidationRules,
                    DisplayOrder = field.DisplayOrder,
                    IsSystem = false,
                    Description = field.Description
                };
                db.Fields.Add(newField);
            }
        }

        await auditLogService.AddAsync(new AuditLog
        {
            ActorId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value,
            Action = "collections.duplicate",
            ResourceType = "collection",
            ResourceId = newCollection.Id.ToString(),
            DetailJson = "{}"
        });
        await db.SaveChangesAsync();

        return Ok(new CollectionResponse(
            newCollection.Id, newCollection.Name, newCollection.Slug, newCollection.Description, newCollection.SchemaJson,
            newCollection.ListRule, newCollection.ViewRule, newCollection.CreateRule, newCollection.UpdateRule, newCollection.DeleteRule,
            newCollection.OwnerField, newCollection.CreatedAt, newCollection.UpdatedAt));
    }

    [HttpPost("{id:guid}/publish/preview")]
    public async Task<ActionResult<PublishCollectionPreviewResponse>> PreviewPublish(Guid id)
    {
        var result = await publishService.PreviewAsync(id);
        return Ok(result);
    }

    [HttpPost("{id:guid}/publish")]
    public async Task<ActionResult<PublishCollectionEnqueueResponse>> Publish(Guid id)
    {
        var actorId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var result = await publishService.EnqueuePublishAsync(id, actorId);
        return Ok(result);
    }

    [HttpGet("{id:guid}/publish-status")]
    public async Task<ActionResult<CollectionPublishStatusResponse>> PublishStatus(Guid id)
    {
        var status = await publishService.GetStatusAsync(id);
        return Ok(status);
    }

    [HttpGet("{id:guid}/publish-jobs")]
    public async Task<ActionResult<IReadOnlyList<PublishTaskStatusResponse>>> PublishJobs(Guid id)
    {
        var jobs = await publishService.ListTasksAsync(id);
        return Ok(jobs);
    }

    [HttpGet("publish-jobs/{taskId:guid}")]
    public async Task<ActionResult<PublishTaskStatusResponse>> PublishJob(Guid taskId)
    {
        var job = await publishService.GetTaskAsync(taskId);
        return job is null ? NotFound() : Ok(job);
    }

    [AllowAnonymous]
    [HttpGet("{id:guid}/api-preview")]
    public async Task<ActionResult<CollectionApiPreviewResponse>> GetApiPreview(Guid id)
    {
        var enabled = await settingsService.GetBoolConfigAsync("enableApiPreview", true);
        if (!enabled)
        {
            return NotFound(new { message = "API preview is disabled by system configuration" });
        }

        var preview = await apiPreviewService.BuildAsync(id);
        return Ok(preview);
    }

    /// <summary>
    /// Get all fields metadata for a collection (used for table field configuration)
    /// Returns non-system fields with their types and properties
    /// </summary>
    [AllowAnonymous]
    [HttpGet("{id:guid}/fields-metadata")]
    public async Task<ActionResult<FieldsMetadataResponse>> GetFieldsMetadata(Guid id)
    {
        var collection = await db.Collections
            .Include(c => c.Fields)
            .FirstOrDefaultAsync(x => x.Id == id);
        if (collection is null)
            return NotFound();

        var fields = collection.Fields
            .Where(f => !f.IsSystem)
            .OrderBy(f => f.DisplayOrder)
            .Select(f => new FieldMetadata(
                f.Name,
                f.Label,
                (int)f.Type,
                f.IsRequired,
                f.IsUnique,
                false,
                f.Description))
            .ToList();

        return Ok(new FieldsMetadataResponse(collection.Id, collection.Slug, fields));
    }
}
