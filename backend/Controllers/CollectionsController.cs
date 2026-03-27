using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PocketbaseNet.Api.Contracts;
using PocketbaseNet.Api.Domain.Entities;
using PocketbaseNet.Api.Infrastructure;

namespace PocketbaseNet.Api.Controllers;

[ApiController]
[Authorize(Roles = "Admin")]
[Route("api/collections")]
public class CollectionsController(AppDbContext db) : ControllerBase
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
        db.AuditLogs.Add(new AuditLog
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

        db.AuditLogs.Add(new AuditLog
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
        db.AuditLogs.Add(new AuditLog
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

        db.AuditLogs.Add(new AuditLog
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

        db.AuditLogs.Add(new AuditLog
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
}
