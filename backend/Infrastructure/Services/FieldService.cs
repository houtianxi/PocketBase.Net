using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PocketbaseNet.Api.Contracts;
using PocketbaseNet.Api.Domain.Entities;
using PocketbaseNet.Api.Domain.Enums;

namespace PocketbaseNet.Api.Infrastructure.Services;

public class FieldService
{
    private readonly AppDbContext _db;

    public FieldService(AppDbContext db)
    {
        _db = db;
    }

    /// <summary>
    /// Get all fields for a collection
    /// </summary>
    public async Task<List<FieldResponse>> GetFieldsAsync(Guid collectionId)
    {
        var fields = await _db.Fields
            .Where(f => f.CollectionDefinitionId == collectionId)
            .OrderBy(f => f.DisplayOrder)
            .AsNoTracking()
            .ToListAsync();

        return fields.Select(f => MapToResponse(f)).ToList();
    }

    /// <summary>
    /// Get a single field by ID
    /// </summary>
    public async Task<FieldResponse?> GetFieldAsync(Guid fieldId)
    {
        var field = await _db.Fields
            .AsNoTracking()
            .FirstOrDefaultAsync(f => f.Id == fieldId);

        return field == null ? null : MapToResponse(field);
    }

    /// <summary>
    /// Create a new field
    /// </summary>
    public async Task<FieldResponse> CreateFieldAsync(Guid collectionId, FieldCreateRequest request)
    {
        // Validate collection exists
        var collection = await _db.Collections.FindAsync(collectionId);
        if (collection == null)
            throw new InvalidOperationException("Collection not found");

        // Check if field name already exists in this collection
        var exists = await _db.Fields
            .AnyAsync(f => f.CollectionDefinitionId == collectionId && f.Name == request.Name);
        if (exists)
            throw new InvalidOperationException("Field name already exists in this collection");

        // Validate field name
        if (!IsValidFieldName(request.Name))
            throw new InvalidOperationException("Invalid field name. Use alphanumeric and underscore only.");

        // Determine the correct display order
        // If DisplayOrder is 0 or not explicitly provided, place the new field at the end
        var displayOrder = request.DisplayOrder;
        if (displayOrder == 0)
        {
            var maxOrder = await _db.Fields
                .Where(f => f.CollectionDefinitionId == collectionId)
                .MaxAsync(f => (int?)f.DisplayOrder) ?? -1;
            displayOrder = maxOrder + 1;
        }

        var field = new Field
        {
            CollectionDefinitionId = collectionId,
            Name = request.Name.ToLowerInvariant().Trim(),
            Label = request.Label,
            Type = request.Type,
            IsRequired = request.IsRequired,
            IsUnique = request.IsUnique,
            DefaultValue = request.DefaultValue,
            Config = string.IsNullOrWhiteSpace(request.Config) ? JsonDocument.Parse("{}").RootElement : JsonDocument.Parse(request.Config).RootElement,
            ValidationRules = request.ValidationRules,
            DisplayOrder = displayOrder,
            Description = request.Description,
            IsSystem = false
        };

        _db.Fields.Add(field);
        await _db.SaveChangesAsync();

        return MapToResponse(field);
    }

    /// <summary>
    /// Update an existing field
    /// </summary>
    public async Task<FieldResponse> UpdateFieldAsync(Guid fieldId, FieldUpdateRequest request)
    {
        var field = await _db.Fields.FindAsync(fieldId);
        if (field == null)
            throw new InvalidOperationException("Field not found");

        if (field.IsSystem)
            throw new InvalidOperationException("Cannot update system fields");

        var normalizedName = request.Name.ToLowerInvariant().Trim();
        if (!IsValidFieldName(normalizedName))
            throw new InvalidOperationException("Invalid field name. Use alphanumeric and underscore only.");

        var nameExists = await _db.Fields.AnyAsync(f =>
            f.CollectionDefinitionId == field.CollectionDefinitionId &&
            f.Id != fieldId &&
            f.Name == normalizedName);

        if (nameExists)
            throw new InvalidOperationException("Field name already exists in this collection");

        // Check if field name is changing - need to update record data
        var oldName = field.Name;
        var nameChanged = !string.Equals(oldName, normalizedName, StringComparison.OrdinalIgnoreCase);

        if (nameChanged)
        {
            // Update all records in this collection to rename the JSON key
            var records = await _db.Records
                .Where(r => r.CollectionDefinitionId == field.CollectionDefinitionId)
                .ToListAsync();

            foreach (var record in records)
            {
                try
                {
                    var data = JsonSerializer.Deserialize<Dictionary<string, object?>>(record.DataJson) ?? new();
                    // Legacy data may contain keys with different casing.
                    var oldKey = data.Keys.FirstOrDefault(k => string.Equals(k, oldName, StringComparison.OrdinalIgnoreCase));
                    if (!string.IsNullOrWhiteSpace(oldKey) && data.TryGetValue(oldKey, out var value))
                    {
                        data.Remove(oldKey);
                        data[normalizedName] = value;
                        record.DataJson = JsonSerializer.Serialize(data);
                        record.UpdatedAt = DateTimeOffset.UtcNow;
                    }
                }
                catch
                {
                    // Skip records with invalid JSON
                }
            }
        }

        field.Name = normalizedName;
        field.Label = request.Label;
        field.Type = request.Type;
        field.IsRequired = request.IsRequired;
        field.IsUnique = request.IsUnique;
        field.DefaultValue = request.DefaultValue;
        field.Config = string.IsNullOrWhiteSpace(request.Config) ? JsonDocument.Parse("{}").RootElement : JsonDocument.Parse(request.Config).RootElement;
        field.ValidationRules = request.ValidationRules;
        field.DisplayOrder = request.DisplayOrder;
        field.Description = request.Description;
        field.UpdatedAt = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync();

        return MapToResponse(field);
    }

    /// <summary>
    /// Delete a field
    /// </summary>
    public async Task DeleteFieldAsync(Guid fieldId)
    {
        var field = await _db.Fields.FindAsync(fieldId);
        if (field == null)
            throw new InvalidOperationException("Field not found");

        if (field.IsSystem)
            throw new InvalidOperationException("Cannot delete system fields");

        _db.Fields.Remove(field);
        await _db.SaveChangesAsync();
    }

    /// <summary>
    /// Reorder fields
    /// </summary>
    public async Task ReorderFieldsAsync(Guid collectionId, Dictionary<Guid, int> fieldOrders)
    {
        var fields = await _db.Fields
            .Where(f => f.CollectionDefinitionId == collectionId)
            .ToListAsync();

        foreach (var field in fields)
        {
            if (fieldOrders.TryGetValue(field.Id, out var order))
            {
                field.DisplayOrder = order;
            }
        }

        await _db.SaveChangesAsync();
    }

    /// <summary>
    /// Seed system fields for a new collection
    /// </summary>
    public async Task SeedSystemFieldsAsync(Guid collectionId)
    {
        var systemFields = new[]
        {
            new Field
            {
                CollectionDefinitionId = collectionId,
                Name = "id",
                Label = "ID",
                Type = FieldType.Text,
                IsSystem = true,
                DisplayOrder = 0,
                IsRequired = true
            },
            new Field
            {
                CollectionDefinitionId = collectionId,
                Name = "created",
                Label = "Created",
                Type = FieldType.DateTime,
                IsSystem = true,
                DisplayOrder = 1,
                IsRequired = true
            },
            new Field
            {
                CollectionDefinitionId = collectionId,
                Name = "updated",
                Label = "Updated",
                Type = FieldType.DateTime,
                IsSystem = true,
                DisplayOrder = 2,
                IsRequired = true
            }
        };

        _db.Fields.AddRange(systemFields);
        await _db.SaveChangesAsync();
    }

    /// <summary>
    /// Get all field type definitions
    /// </summary>
    public List<FieldTypeDefinition> GetFieldTypeDefinitions()
    {
        return new[]
        {
            new FieldTypeDefinition(
                FieldType.Text,
                "Text",
                "Single line text",
                false, false, true,
                new[] { "minLength", "maxLength", "pattern", "displayInRelation" }
            ),
            new FieldTypeDefinition(
                FieldType.Email,
                "Email",
                "Email field with validation",
                false, false, true,
                new[] { "pattern", "displayInRelation" }
            ),
            new FieldTypeDefinition(
                FieldType.Url,
                "URL",
                "URL field with validation",
                false, false, true,
                new[] { "pattern", "displayInRelation" }
            ),
            new FieldTypeDefinition(
                FieldType.Number,
                "Number",
                "Numeric field (integer or decimal)",
                false, false, true,
                new[] { "min", "max", "step", "precision", "displayInRelation" }
            ),
            new FieldTypeDefinition(
                FieldType.Checkbox,
                "Checkbox",
                "Boolean checkbox field",
                false, false, false,
                new[] { "defaultValue", "displayInRelation" }
            ),
            new FieldTypeDefinition(
                FieldType.Date,
                "Date",
                "Date field (YYYY-MM-DD)",
                false, false, true,
                new[] { "min", "max" }
            ),
            new FieldTypeDefinition(
                FieldType.DateTime,
                "DateTime",
                "DateTime field with time and timezone",
                false, false, true,
                new[] { "min", "max" }
            ),
            new FieldTypeDefinition(
                FieldType.Select,
                "Select",
                "Single select from predefined options",
                true, false, false,
                new[] { "values", "maxSelect", "defaultValue", "displayInRelation" }
            ),
            new FieldTypeDefinition(
                FieldType.Relation,
                "Relation",
                "Relation to another collection",
                false, true, false,
                new[] { "collectionId", "relationType", "displayInRelation" }
            ),
            new FieldTypeDefinition(
                FieldType.User,
                "User",
                "User reference field",
                false, false, false,
                new string[] { }
            ),
            new FieldTypeDefinition(
                FieldType.File,
                "File",
                "File upload field",
                false, false, false,
                new[] { "maxSize", "mimeTypes" }
            ),
            new FieldTypeDefinition(
                FieldType.Textarea,
                "Textarea",
                "Multi-line text field",
                false, false, true,
                new[] { "minLength", "maxLength", "displayInRelation" }
            ),
            new FieldTypeDefinition(
                FieldType.Json,
                "JSON",
                "JSON data field",
                false, false, false,
                new string[] { }
            ),
            new FieldTypeDefinition(
                FieldType.Avatar,
                "Avatar",
                "Avatar image upload field",
                false, false, false,
                new[] { "maxSize" }
            )
        }.ToList();
    }

    // Helper methods

    private static FieldResponse MapToResponse(Field field)
    {
        return new FieldResponse(
            field.Id,
            field.CollectionDefinitionId,
            field.Name,
            field.Label,
            field.Type,
            field.IsRequired,
            field.IsUnique,
            field.DefaultValue,
            field.Config,
            field.ValidationRules,
            field.DisplayOrder,
            field.IsSystem,
            field.Description,
            field.CreatedAt,
            field.UpdatedAt
        );
    }

    private static bool IsValidFieldName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            return false;

        // Field name must be alphanumeric + underscore, max 100 chars
        return name.Length <= 100 && System.Text.RegularExpressions.Regex.IsMatch(name, @"^[a-zA-Z_][a-zA-Z0-9_]*$");
    }
}
