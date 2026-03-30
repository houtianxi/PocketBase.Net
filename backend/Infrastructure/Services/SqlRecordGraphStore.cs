using System.Data;
using System.Globalization;
using System.Text.Json;
using Dapper;
using PocketbaseNet.Api.Contracts;
using PocketbaseNet.Api.Domain.Entities;
using PocketbaseNet.Api.Domain.Enums;

namespace PocketbaseNet.Api.Infrastructure.Services;

public class SqlRecordGraphStore(SqlServerConnectionFactory connectionFactory)
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

        var rootSchema = ParseChildren(collection.SchemaJson);
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
            if (!childLookup.TryGetValue(childName, out var childSchema))
                throw new InvalidOperationException($"未在 schemaJson.children 中定义子表 '{childName}'。");

            var childTable = CollectionPublishService.BuildChildTableName(collection.Slug, childSchema.Name);
            var childFields = childSchema.Fields;

            var inserted = 0;
            foreach (var row in rows)
            {
                var childId = Guid.NewGuid();
                var sql = BuildChildInsertSql(childTable, row, childFields, childId, parentId, now, out var childParameters);
                await connection.ExecuteAsync(new CommandDefinition(sql, childParameters, tx, cancellationToken: cancellationToken));
                inserted++;
            }

            childrenCreated[childName] = inserted;
        }

        tx.Commit();

        var parentResponse = new RecordResponse(parentId, collection.Id, collection.Slug, data, ownerId, now, now);
        return new RecordGraphCreateResponse(parentResponse, childrenCreated);
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

        foreach (var field in fields.Where(f => !f.IsSystem))
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
        string tableName,
        Dictionary<string, object?> data,
        List<ChildFieldSchema> fields,
        Guid id,
        Guid parentId,
        DateTimeOffset now,
        out DynamicParameters parameters)
    {
        parameters = new DynamicParameters();
        parameters.Add("Id", id);
        parameters.Add("ParentId", parentId);
        parameters.Add("CreatedAt", now);
        parameters.Add("UpdatedAt", now);
        parameters.Add("DataJson", JsonSerializer.Serialize(data));

        var columns = new List<string> { "[Id]", "[ParentId]", "[CreatedAt]", "[UpdatedAt]", "[DataJson]" };
        var values = new List<string> { "@Id", "@ParentId", "@CreatedAt", "@UpdatedAt", "@DataJson" };

        foreach (var field in fields)
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

    private static List<ChildTableSchema> ParseChildren(string? schemaJson)
    {
        if (string.IsNullOrWhiteSpace(schemaJson))
            return [];

        try
        {
            var root = JsonSerializer.Deserialize<CollectionSchemaDefinition>(schemaJson) ?? new CollectionSchemaDefinition();
            return root.Children.Select(c => new ChildTableSchema(
                c.Name,
                c.Fields.Select(f => new ChildFieldSchema(f.Name, ParseFieldType(f.Type))).ToList())).ToList();
        }
        catch
        {
            return [];
        }
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

    private sealed class CollectionSchemaDefinition
    {
        public List<ChildSchemaDto> Children { get; init; } = [];
    }

    private sealed class ChildSchemaDto
    {
        public string Name { get; init; } = string.Empty;
        public List<ChildFieldDto> Fields { get; init; } = [];
    }

    private sealed class ChildFieldDto
    {
        public string Name { get; init; } = string.Empty;
        public string? Type { get; init; }
    }

    private sealed record ChildTableSchema(string Name, List<ChildFieldSchema> Fields);
    private sealed record ChildFieldSchema(string Name, FieldType Type);
}
