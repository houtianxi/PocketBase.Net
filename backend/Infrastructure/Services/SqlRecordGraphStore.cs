using System.Data;
using System.Globalization;
using System.Text.Json;
using Dapper;
using Microsoft.EntityFrameworkCore;
using PocketbaseNet.Api.Contracts;
using PocketbaseNet.Api.Domain.Entities;
using PocketbaseNet.Api.Domain.Enums;

namespace PocketbaseNet.Api.Infrastructure.Services;

public class SqlRecordGraphStore(SqlServerConnectionFactory connectionFactory, AppDbContext db)
{
    public async Task<RecordGraphCreateResponse> CreateGraphAsync(
        CollectionDefinition collection,
        Dictionary<string, object?> data,
        Dictionary<string, List<Dictionary<string, object?>>>? children,
        List<Field> fields,
        string? ownerId,
        CancellationToken cancellationToken = default)
    {
        if (!connectionFactory.IsSqlServerConfigured())
            throw new InvalidOperationException("当前数据库未配置 SqlServer，无法执行主子表事务写入。");

        var rootSchema = await BuildEffectiveChildrenAsync(collection, fields, cancellationToken);
        var childLookup = rootSchema.ToDictionary(c => c.Name, c => c, StringComparer.OrdinalIgnoreCase);
        var tableName = BuildPhysicalTableName(collection.Slug);

        await using var connection = await connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        using var tx = connection.BeginTransaction();

        var parentId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        var parentSql = BuildInsertSql(tableName, data, fields, parentId, now, ownerId, out var parentParameters);
        await connection.ExecuteAsync(new CommandDefinition(parentSql, parentParameters, tx, cancellationToken: cancellationToken));

        var childrenCreated = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var (childName, rows) in children ?? new Dictionary<string, List<Dictionary<string, object?>>>(StringComparer.OrdinalIgnoreCase))
        {
            var childSchema = ResolveChildSchemaOrThrow(rootSchema, childLookup, fields, childName);
            var childBinding = ResolveChildBinding(collection.Slug, childSchema);
            var childFields = childSchema.Fields;

            var inserted = 0;
            foreach (var row in rows)
            {
                var childId = Guid.NewGuid();
                var sql = BuildChildInsertSql(childBinding, row, childFields, childId, parentId, now, ownerId, out var childParameters);
                await connection.ExecuteAsync(new CommandDefinition(sql, childParameters, tx, cancellationToken: cancellationToken));
                inserted++;
            }

            childrenCreated[childName] = inserted;
        }

        tx.Commit();

        var parentResponse = new RecordResponse(parentId, collection.Id, collection.Slug, data, ownerId, now, now);
        return new RecordGraphCreateResponse(parentResponse, childrenCreated);
    }

    public async Task<RecordGraphCreateResponse> UpdateGraphAsync(
        CollectionDefinition collection,
        Guid recordId,
        Dictionary<string, object?> data,
        Dictionary<string, List<Dictionary<string, object?>>>? children,
        List<Field> fields,
        string? ownerId,
        CancellationToken cancellationToken = default)
    {
        if (!connectionFactory.IsSqlServerConfigured())
            throw new InvalidOperationException("当前数据库未配置 SqlServer，无法执行主子表事务写入。");

        var rootSchema = await BuildEffectiveChildrenAsync(collection, fields, cancellationToken);
        var childLookup = rootSchema.ToDictionary(c => c.Name, c => c, StringComparer.OrdinalIgnoreCase);
        var tableName = BuildPhysicalTableName(collection.Slug);

        await using var connection = await connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        using var tx = connection.BeginTransaction();

        var now = DateTimeOffset.UtcNow;
        var parentSql = BuildUpdateSql(tableName, data, fields, recordId, now, out var parentParameters);
        var affected = await connection.ExecuteAsync(new CommandDefinition(parentSql, parentParameters, tx, cancellationToken: cancellationToken));
        if (affected == 0)
            throw new InvalidOperationException($"Record '{recordId}' not found in collection '{collection.Slug}'.");

        var childrenCreated = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var (childName, rows) in children ?? new Dictionary<string, List<Dictionary<string, object?>>>(StringComparer.OrdinalIgnoreCase))
        {
            var childSchema = ResolveChildSchemaOrThrow(rootSchema, childLookup, fields, childName);
            var childBinding = ResolveChildBinding(collection.Slug, childSchema);
            await connection.ExecuteAsync(new CommandDefinition($"DELETE FROM [dbo].[{childBinding.TableName}] WHERE [{childBinding.LinkFieldName}] = @ParentId;", new { ParentId = recordId }, tx, cancellationToken: cancellationToken));

            var inserted = 0;
            foreach (var row in rows)
            {
                var childId = Guid.NewGuid();
                var sql = BuildChildInsertSql(childBinding, row, childSchema.Fields, childId, recordId, now, ownerId, out var childParameters);
                await connection.ExecuteAsync(new CommandDefinition(sql, childParameters, tx, cancellationToken: cancellationToken));
                inserted++;
            }

            childrenCreated[childName] = inserted;
        }

        tx.Commit();
        var parentResponse = new RecordResponse(recordId, collection.Id, collection.Slug, data, ownerId, now, now);
        return new RecordGraphCreateResponse(parentResponse, childrenCreated);
    }

    public async Task<List<Dictionary<string, object?>>> ListChildRowsAsync(
        CollectionDefinition collection,
        Guid parentId,
        string childName,
        CancellationToken cancellationToken = default)
    {
        if (!connectionFactory.IsSqlServerConfigured())
            throw new InvalidOperationException("当前数据库未配置 SqlServer，无法读取主子表数据。");

        var rootSchema = await BuildEffectiveChildrenAsync(collection, collection.Fields.ToList(), cancellationToken);
        var childLookup = rootSchema.ToDictionary(c => c.Name, c => c, StringComparer.OrdinalIgnoreCase);
        var childSchema = ResolveChildSchemaOrThrow(rootSchema, childLookup, collection.Fields.ToList(), childName);
        var childBinding = ResolveChildBinding(collection.Slug, childSchema);
        await using var connection = await connectionFactory.CreateOpenConnectionAsync(cancellationToken);

        var rows = await connection.QueryAsync(new CommandDefinition(
            $"SELECT * FROM [dbo].[{childBinding.TableName}] WHERE [{childBinding.LinkFieldName}] = @ParentId ORDER BY [CreatedAt] ASC;",
            new { ParentId = parentId },
            cancellationToken: cancellationToken));

        var result = new List<Dictionary<string, object?>>();
        foreach (var row in rows)
        {
            var dict = ((IDictionary<string, object?>)row)
                .Where(kv => !string.Equals(kv.Key, childBinding.LinkFieldName, StringComparison.OrdinalIgnoreCase)
                    && kv.Key is not "Id" and not "CreatedAt" and not "UpdatedAt" and not "DataJson" and not "OwnerId")
                .ToDictionary(kv => kv.Key, kv => kv.Value is DBNull ? null : kv.Value, StringComparer.OrdinalIgnoreCase);

            result.Add(dict);
        }

        return result;
    }

    private static string BuildInsertSql(
        string tableName,
        Dictionary<string, object?> data,
        List<Field> fields,
        Guid id,
        DateTimeOffset now,
        string? ownerId,
        out DynamicParameters parameters)
    {
        parameters = new DynamicParameters();
        parameters.Add("Id", id);
        parameters.Add("CreatedAt", now);
        parameters.Add("UpdatedAt", now);
        parameters.Add("OwnerId", ownerId);
        parameters.Add("DataJson", JsonSerializer.Serialize(data));

        var columns = new List<string> { "[Id]", "[CreatedAt]", "[UpdatedAt]", "[OwnerId]", "[DataJson]" };
        var values = new List<string> { "@Id", "@CreatedAt", "@UpdatedAt", "@OwnerId", "@DataJson" };

        foreach (var field in fields.Where(f => !f.IsSystem && f.Type != FieldType.Table))
        {
            if (!TryGetIgnoreCase(data, field.Name, out var rawValue))
                continue;

            var parameterName = $"p_{field.Name}";
            parameters.Add(parameterName, ConvertValue(field.Type, rawValue));
            columns.Add($"[{field.Name}]");
            values.Add("@" + parameterName);
        }

        return $@"
INSERT INTO [dbo].[{tableName}] ({string.Join(",", columns)})
VALUES ({string.Join(",", values)});";
    }

    private static string BuildChildInsertSql(
        ChildTableBinding binding,
        Dictionary<string, object?> data,
        List<ChildFieldSchema> fields,
        Guid id,
        Guid parentId,
        DateTimeOffset now,
        string? ownerId,
        out DynamicParameters parameters)
    {
        parameters = new DynamicParameters();
        parameters.Add("Id", id);
        parameters.Add("LinkParentId", parentId);
        parameters.Add("CreatedAt", now);
        parameters.Add("UpdatedAt", now);
        parameters.Add("DataJson", JsonSerializer.Serialize(data));
        if (binding.IncludeOwnerId)
            parameters.Add("OwnerId", ownerId);

        var columns = new List<string> { "[Id]", $"[{binding.LinkFieldName}]", "[CreatedAt]", "[UpdatedAt]", "[DataJson]" };
        var values = new List<string> { "@Id", "@LinkParentId", "@CreatedAt", "@UpdatedAt", "@DataJson" };

        if (binding.IncludeOwnerId)
        {
            columns.Add("[OwnerId]");
            values.Add("@OwnerId");
        }

        foreach (var field in fields)
        {
            if (string.Equals(field.Name, binding.LinkFieldName, StringComparison.OrdinalIgnoreCase))
                continue;

            if (!TryGetIgnoreCase(data, field.Name, out var rawValue))
                continue;

            var parameterName = $"p_{field.Name}";
            parameters.Add(parameterName, ConvertValue(field.Type, rawValue));
            columns.Add($"[{field.Name}]");
            values.Add("@" + parameterName);
        }

        return $@"
INSERT INTO [dbo].[{binding.TableName}] ({string.Join(",", columns)})
VALUES ({string.Join(",", values)});";
    }

    private static string BuildUpdateSql(
        string tableName,
        Dictionary<string, object?> data,
        List<Field> fields,
        Guid id,
        DateTimeOffset now,
        out DynamicParameters parameters)
    {
        parameters = new DynamicParameters();
        parameters.Add("Id", id);
        parameters.Add("UpdatedAt", now);
        parameters.Add("DataJson", JsonSerializer.Serialize(data));

        var sets = new List<string>
        {
            "[UpdatedAt] = @UpdatedAt",
            "[DataJson] = @DataJson"
        };

        foreach (var field in fields.Where(f => !f.IsSystem && f.Type != FieldType.Table))
        {
            var parameterName = $"p_{field.Name}";
            data.TryGetValue(field.Name, out var rawValue);
            parameters.Add(parameterName, ConvertValue(field.Type, rawValue));
            sets.Add($"[{field.Name}] = @{parameterName}");
        }

        return $@"
UPDATE [dbo].[{tableName}]
SET {string.Join(",", sets)}
WHERE [Id] = @Id;";
    }

    private static readonly JsonSerializerOptions _schemaParseOptions = new() { PropertyNameCaseInsensitive = true };

    private static List<ChildTableSchema> ParseChildren(string? schemaJson)
    {
        if (string.IsNullOrWhiteSpace(schemaJson))
            return [];

        try
        {
            // Use case-insensitive options to support both camelCase (FieldService-synced) and PascalCase schemas.
            var root = JsonSerializer.Deserialize<CollectionSchemaDefinition>(schemaJson, _schemaParseOptions) ?? new CollectionSchemaDefinition();
            return root.Children
                .Where(c => !string.IsNullOrWhiteSpace(c.Name))
                .Select(c => new ChildTableSchema(
                    c.Name.Trim(),
                    string.IsNullOrWhiteSpace(c.RelatedCollectionSlug) ? null : c.RelatedCollectionSlug.Trim(),
                    string.IsNullOrWhiteSpace(c.ChildKey) ? "ParentId" : c.ChildKey.Trim(),
                    c.Fields
                        .Where(f => !string.IsNullOrWhiteSpace(f.Name))
                        .Select(f => new ChildFieldSchema(f.Name.Trim(), ParseFieldType(f.Type)))
                        .ToList()))
                .ToList();
        }
        catch
        {
            return [];
        }
    }

    private async Task<List<ChildTableSchema>> BuildEffectiveChildrenAsync(
        CollectionDefinition collection,
        List<Field> fields,
        CancellationToken cancellationToken)
    {
        var fromSchemaJson = ParseChildren(collection.SchemaJson);
        if (fromSchemaJson.Count > 0)
            return fromSchemaJson;

        // Fallback: derive children from table field configs when schemaJson.children is not filled.
        var derived = new List<ChildTableSchema>();
        var tableFields = fields.Where(f => f.Type == FieldType.Table).ToList();
        foreach (var field in tableFields)
        {
            var cfg = ParseTableFieldConfig(field.Config);
            var childName = ResolveDerivedChildName(field.Name, cfg);
            if (string.IsNullOrWhiteSpace(childName))
                continue;

            if (derived.Any(c => string.Equals(c.Name, childName, StringComparison.OrdinalIgnoreCase)))
                continue;

            // If relatedCollectionSlug is missing from config, auto-detect by checking if a collection with that slug exists.
            var effectiveRelatedSlug = string.IsNullOrWhiteSpace(cfg.RelatedCollectionSlug) ? null : cfg.RelatedCollectionSlug.Trim();
            if (effectiveRelatedSlug is null)
            {
                var maybeRelated = await db.Collections
                    .AsNoTracking()
                    .FirstOrDefaultAsync(c => c.Slug == childName, cancellationToken);
                if (maybeRelated is not null)
                    effectiveRelatedSlug = maybeRelated.Slug;
            }

            var childFields = await ResolveDerivedChildFieldsAsync(cfg, cancellationToken);
            derived.Add(new ChildTableSchema(
                childName,
                effectiveRelatedSlug,
                string.IsNullOrWhiteSpace(cfg.ChildKey) ? "ParentId" : cfg.ChildKey.Trim(),
                childFields));
        }

        return derived;
    }

    private async Task<List<ChildFieldSchema>> ResolveDerivedChildFieldsAsync(TableFieldConfigDto cfg, CancellationToken cancellationToken)
    {
        var selectedFieldNames = cfg.SelectedFields
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Select(name => name.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (string.IsNullOrWhiteSpace(cfg.RelatedCollectionSlug))
        {
            return selectedFieldNames
                .Select(name => new ChildFieldSchema(name, FieldType.Text))
                .ToList();
        }

        var related = await db.Collections
            .Include(c => c.Fields)
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Slug == cfg.RelatedCollectionSlug, cancellationToken);

        if (related is null)
        {
            return selectedFieldNames
                .Select(name => new ChildFieldSchema(name, FieldType.Text))
                .ToList();
        }

        var candidateFields = related.Fields.Where(f => !f.IsSystem).ToList();
        if (selectedFieldNames.Count > 0)
        {
            candidateFields = candidateFields
                .Where(f => selectedFieldNames.Contains(f.Name, StringComparer.OrdinalIgnoreCase))
                .ToList();
        }

        return candidateFields
            .Where(f => !string.IsNullOrWhiteSpace(f.Name) && f.Type != FieldType.Table)
            .Select(f => new ChildFieldSchema(f.Name.Trim(), f.Type))
            .ToList();
    }

    private static string ResolveDerivedChildName(string tableFieldName, TableFieldConfigDto cfg)
    {
        if (!string.IsNullOrWhiteSpace(cfg.ChildTableName))
            return cfg.ChildTableName.Trim();
        if (!string.IsNullOrWhiteSpace(cfg.RelatedCollectionSlug))
            return cfg.RelatedCollectionSlug.Trim();
        return tableFieldName.Trim();
    }

    private static FieldType ParseFieldType(string? type)
    {
        if (string.IsNullOrWhiteSpace(type)) return FieldType.Text;
        if (int.TryParse(type, out var intValue) && Enum.IsDefined(typeof(FieldType), intValue)) return (FieldType)intValue;
        return Enum.TryParse<FieldType>(type, true, out var parsed) ? parsed : FieldType.Text;
    }

    private static string BuildPhysicalTableName(string slug)
    {
        var normalized = new string(slug.ToLowerInvariant().Select(ch => char.IsLetterOrDigit(ch) || ch == '_' ? ch : '_').ToArray()).Trim('_');
        if (string.IsNullOrWhiteSpace(normalized)) normalized = "collection";
        return $"pb_{normalized}";
    }

    private static bool TryGetIgnoreCase(Dictionary<string, object?> data, string key, out object? value)
    {
        if (data.TryGetValue(key, out value)) return true;
        var actual = data.Keys.FirstOrDefault(k => string.Equals(k, key, StringComparison.OrdinalIgnoreCase));
        if (actual != null) return data.TryGetValue(actual, out value);
        value = null;
        return false;
    }

    private static object? ConvertValue(FieldType type, object? value)
    {
        if (value is JsonElement elem)
        {
            value = elem.ValueKind switch
            {
                JsonValueKind.String => elem.GetString(),
                JsonValueKind.Number => elem.TryGetDecimal(out var dec) ? dec : elem.GetDouble(),
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                JsonValueKind.Array => elem.GetRawText(),
                JsonValueKind.Object => elem.GetRawText(),
                _ => null
            };
        }

        return type switch
        {
            FieldType.Number when decimal.TryParse(value?.ToString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var dec) => dec,
            FieldType.Checkbox when bool.TryParse(value?.ToString(), out var b) => b,
            FieldType.Date when DateTime.TryParse(value?.ToString(), out var d) => d.Date,
            FieldType.DateTime when DateTimeOffset.TryParse(value?.ToString(), out var dto) => dto,
            FieldType.Json => value is string s ? s : JsonSerializer.Serialize(value),
            FieldType.Relation => value is string rel ? rel : JsonSerializer.Serialize(value),
            _ => value?.ToString()
        };
    }

    private static ChildTableSchema? ResolveChildSchemaFallback(List<ChildTableSchema> rootSchema, string childName)
    {
        if (string.IsNullOrWhiteSpace(childName))
            return null;

        var byFieldName = rootSchema
            .Where(c => c.Fields.Any(f => string.Equals(f.Name, childName, StringComparison.OrdinalIgnoreCase)))
            .ToList();

        if (byFieldName.Count == 1)
            return byFieldName[0];

        return byFieldName.FirstOrDefault();
    }

    private static ChildTableSchema ResolveChildSchemaOrThrow(
        List<ChildTableSchema> rootSchema,
        Dictionary<string, ChildTableSchema> childLookup,
        List<Field> fields,
        string childName)
    {
        if (childLookup.TryGetValue(childName, out var byName))
            return byName;

        var fallback = ResolveChildSchemaFallback(rootSchema, childName);
        if (fallback is not null)
            return fallback;

        var byTableFieldConfig = ResolveChildSchemaFromTableFields(rootSchema, fields, childName);
        if (byTableFieldConfig is not null)
            return byTableFieldConfig;

        throw new InvalidOperationException($"未在 schemaJson.children 中定义子表 '{childName}'。");
    }

    private static ChildTableBinding ResolveChildBinding(string parentSlug, ChildTableSchema childSchema)
    {
        if (!string.IsNullOrWhiteSpace(childSchema.RelatedCollectionSlug))
        {
            return new ChildTableBinding(
                BuildPhysicalTableName(childSchema.RelatedCollectionSlug),
                string.IsNullOrWhiteSpace(childSchema.ChildKey) ? "ParentId" : childSchema.ChildKey,
                IncludeOwnerId: true);
        }

        return new ChildTableBinding(
            CollectionPublishService.BuildChildTableName(parentSlug, childSchema.Name),
            "ParentId",
            IncludeOwnerId: false);
    }

    private static ChildTableSchema? ResolveChildSchemaFromTableFields(
        List<ChildTableSchema> rootSchema,
        List<Field> fields,
        string childName)
    {
        if (rootSchema.Count == 0 || string.IsNullOrWhiteSpace(childName))
            return null;

        var tableFields = fields.Where(f => f.Type == FieldType.Table).ToList();
        foreach (var field in tableFields)
        {
            var config = ParseTableFieldConfig(field.Config);

            // Support clients that accidentally use table field name / childKey as children key.
            var keyMatchesTableField = string.Equals(field.Name, childName, StringComparison.OrdinalIgnoreCase)
                || (!string.IsNullOrWhiteSpace(config.ChildKey)
                    && string.Equals(config.ChildKey, childName, StringComparison.OrdinalIgnoreCase));

            var nameCandidates = new[]
            {
                config.RelatedCollectionSlug,
                config.ChildTableName,
                field.Name
            };

            if (keyMatchesTableField)
            {
                foreach (var candidate in nameCandidates)
                {
                    if (string.IsNullOrWhiteSpace(candidate))
                        continue;

                    var match = rootSchema.FirstOrDefault(c => string.Equals(c.Name, candidate, StringComparison.OrdinalIgnoreCase));
                    if (match is not null)
                        return match;
                }
            }

            // Also support when childName itself is relatedCollectionSlug/childTableName.
            if ((!string.IsNullOrWhiteSpace(config.RelatedCollectionSlug)
                    && string.Equals(config.RelatedCollectionSlug, childName, StringComparison.OrdinalIgnoreCase))
                || (!string.IsNullOrWhiteSpace(config.ChildTableName)
                    && string.Equals(config.ChildTableName, childName, StringComparison.OrdinalIgnoreCase)))
            {
                var direct = rootSchema.FirstOrDefault(c => string.Equals(c.Name, childName, StringComparison.OrdinalIgnoreCase));
                if (direct is not null)
                    return direct;
            }
        }

        return null;
    }

    private static TableFieldConfigDto ParseTableFieldConfig(JsonElement config)
    {
        if (config.ValueKind != JsonValueKind.Object)
            return new TableFieldConfigDto();

        try
        {
            return new TableFieldConfigDto
            {
                RelatedCollectionSlug = config.TryGetProperty("relatedCollectionSlug", out var relatedSlug)
                    ? relatedSlug.GetString() ?? string.Empty
                    : string.Empty,
                ChildTableName = config.TryGetProperty("childTableName", out var childTable)
                    ? childTable.GetString() ?? string.Empty
                    : string.Empty,
                ChildKey = config.TryGetProperty("childKey", out var childKey)
                    ? childKey.GetString() ?? string.Empty
                    : string.Empty
                ,
                SelectedFields = config.TryGetProperty("selectedFields", out var selectedFields) && selectedFields.ValueKind == JsonValueKind.Array
                    ? selectedFields.EnumerateArray()
                        .Where(item => item.ValueKind == JsonValueKind.String)
                        .Select(item => item.GetString() ?? string.Empty)
                        .Where(s => !string.IsNullOrWhiteSpace(s))
                        .ToList()
                    : []
            };
        }
        catch
        {
            return new TableFieldConfigDto();
        }
    }

    private sealed class CollectionSchemaDefinition
    {
        public List<ChildSchemaDto> Children { get; init; } = [];
    }

    private sealed class ChildSchemaDto
    {
        public string Name { get; init; } = string.Empty;
        public string? RelatedCollectionSlug { get; init; }
        public string? ChildKey { get; init; }
        public List<ChildFieldDto> Fields { get; init; } = [];
    }

    private sealed class ChildFieldDto
    {
        public string Name { get; init; } = string.Empty;
        public string? Type { get; init; }
    }

    private sealed class TableFieldConfigDto
    {
        public string RelatedCollectionSlug { get; init; } = string.Empty;
        public string ChildTableName { get; init; } = string.Empty;
        public string ChildKey { get; init; } = string.Empty;
        public List<string> SelectedFields { get; init; } = [];
    }

    private sealed record ChildTableSchema(string Name, string? RelatedCollectionSlug, string ChildKey, List<ChildFieldSchema> Fields);
    private sealed record ChildFieldSchema(string Name, FieldType Type);
    private sealed record ChildTableBinding(string TableName, string LinkFieldName, bool IncludeOwnerId);
}
