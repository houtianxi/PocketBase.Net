using System.Data;
using System.Globalization;
using System.Text.Json;
using Dapper;
using Microsoft.EntityFrameworkCore;
using PocketbaseNet.Api.Domain.Entities;
using PocketbaseNet.Api.Domain.Enums;

namespace PocketbaseNet.Api.Infrastructure.Services;

public class SqlRecordStore(
    AppDbContext db,
    SqlServerConnectionFactory connectionFactory)
{
    public async Task<bool> IsPublishedAsync(Guid collectionId, CancellationToken cancellationToken = default)
    {
        if (!connectionFactory.IsSqlServerConfigured())
            return false;

        await using var connection = await connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        await EnsurePublishBindingTableAsync(connection);

        var published = await connection.ExecuteScalarAsync<int>(new CommandDefinition(@"
SELECT COUNT(1)
FROM [dbo].[CollectionPublishBindings]
WHERE [CollectionId] = @CollectionId
  AND [IsPublished] = 1;", new { CollectionId = collectionId }, cancellationToken: cancellationToken));

        return published > 0;
    }

    public async Task<List<EntityRecord>> ListAsync(CollectionDefinition collection, CancellationToken cancellationToken = default)
    {
        var tableName = await GetPublishedTableNameAsync(collection.Id, cancellationToken)
            ?? throw new InvalidOperationException("集合未发布到实体表。");

        await using var connection = await connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        var fieldNames = await GetCollectionFieldNamesAsync(collection.Id, cancellationToken);

        var selectColumns = new[] { "Id", "CreatedAt", "UpdatedAt", "OwnerId", "DataJson" }
            .Concat(fieldNames)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Select(Quote)
            .ToArray();

        var sql = $"SELECT {string.Join(",", selectColumns)} FROM [dbo].{Quote(tableName)};";
        var rows = await connection.QueryAsync(sql);
        var result = new List<EntityRecord>();
        foreach (var row in rows)
        {
            result.Add(ToEntityRecord((IDictionary<string, object?>)row, collection.Id, fieldNames));
        }

        return result;
    }

    public async Task<EntityRecord?> GetAsync(CollectionDefinition collection, Guid id, CancellationToken cancellationToken = default)
    {
        var tableName = await GetPublishedTableNameAsync(collection.Id, cancellationToken)
            ?? throw new InvalidOperationException("集合未发布到实体表。");

        await using var connection = await connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        var fieldNames = await GetCollectionFieldNamesAsync(collection.Id, cancellationToken);

        var selectColumns = new[] { "Id", "CreatedAt", "UpdatedAt", "OwnerId", "DataJson" }
            .Concat(fieldNames)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Select(Quote)
            .ToArray();

        var sql = $"SELECT {string.Join(",", selectColumns)} FROM [dbo].{Quote(tableName)} WHERE [Id] = @Id;";
        var row = await connection.QueryFirstOrDefaultAsync(sql, new { Id = id });
        if (row is null)
            return null;

        return ToEntityRecord((IDictionary<string, object?>)row, collection.Id, fieldNames);
    }

    public async Task<EntityRecord> CreateAsync(
        CollectionDefinition collection,
        Dictionary<string, object?> data,
        string? ownerId,
        CancellationToken cancellationToken = default)
    {
        var tableName = await GetPublishedTableNameAsync(collection.Id, cancellationToken)
            ?? throw new InvalidOperationException("集合未发布到实体表。");

        await using var connection = await connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        var fields = await db.Fields
            .Where(f => f.CollectionDefinitionId == collection.Id && !f.IsSystem && f.Type != FieldType.Table)
            .OrderBy(f => f.DisplayOrder)
            .ToListAsync(cancellationToken);

        var id = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        var payload = new DynamicParameters();

        payload.Add("Id", id);
        payload.Add("CreatedAt", now);
        payload.Add("UpdatedAt", now);
        payload.Add("OwnerId", ownerId);
        payload.Add("DataJson", JsonSerializer.Serialize(data));

        var columns = new List<string> { Quote("Id"), Quote("CreatedAt"), Quote("UpdatedAt"), Quote("OwnerId"), Quote("DataJson") };
        var values = new List<string> { "@Id", "@CreatedAt", "@UpdatedAt", "@OwnerId", "@DataJson" };

        foreach (var field in fields)
        {
            if (!data.TryGetValue(field.Name, out var rawValue))
                continue;

            var paramName = $"p_{field.Name}";
            payload.Add(paramName, ConvertToSqlValue(field.Type, rawValue));
            columns.Add(Quote(field.Name));
            values.Add("@" + paramName);
        }

        var sql = $@"
INSERT INTO [dbo].{Quote(tableName)} ({string.Join(",", columns)})
VALUES ({string.Join(",", values)});";

        await connection.ExecuteAsync(new CommandDefinition(sql, payload, cancellationToken: cancellationToken));

        return new EntityRecord
        {
            Id = id,
            CollectionDefinitionId = collection.Id,
            OwnerId = ownerId,
            CreatedAt = now,
            UpdatedAt = now,
            DataJson = JsonSerializer.Serialize(data)
        };
    }

    public async Task<EntityRecord?> UpdateAsync(
        CollectionDefinition collection,
        Guid id,
        Dictionary<string, object?> data,
        CancellationToken cancellationToken = default)
    {
        var tableName = await GetPublishedTableNameAsync(collection.Id, cancellationToken)
            ?? throw new InvalidOperationException("集合未发布到实体表。");

        await using var connection = await connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        var fields = await db.Fields
            .Where(f => f.CollectionDefinitionId == collection.Id && !f.IsSystem && f.Type != FieldType.Table)
            .OrderBy(f => f.DisplayOrder)
            .ToListAsync(cancellationToken);

        var existing = await GetAsync(collection, id, cancellationToken);
        if (existing is null)
            return null;

        var now = DateTimeOffset.UtcNow;
        var payload = new DynamicParameters();
        payload.Add("Id", id);
        payload.Add("UpdatedAt", now);
        payload.Add("DataJson", JsonSerializer.Serialize(data));

        var sets = new List<string>
        {
            "[UpdatedAt] = @UpdatedAt",
            "[DataJson] = @DataJson"
        };

        foreach (var field in fields)
        {
            var paramName = $"p_{field.Name}";
            data.TryGetValue(field.Name, out var rawValue);
            payload.Add(paramName, ConvertToSqlValue(field.Type, rawValue));
            sets.Add($"{Quote(field.Name)} = @{paramName}");
        }

        var sql = $@"
UPDATE [dbo].{Quote(tableName)}
SET {string.Join(",", sets)}
WHERE [Id] = @Id;";

        await connection.ExecuteAsync(new CommandDefinition(sql, payload, cancellationToken: cancellationToken));

        existing.DataJson = JsonSerializer.Serialize(data);
        existing.UpdatedAt = now;
        return existing;
    }

    public async Task<bool> DeleteAsync(CollectionDefinition collection, Guid id, CancellationToken cancellationToken = default)
    {
        var tableName = await GetPublishedTableNameAsync(collection.Id, cancellationToken)
            ?? throw new InvalidOperationException("集合未发布到实体表。");

        await using var connection = await connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        var affected = await connection.ExecuteAsync(new CommandDefinition(
            $"DELETE FROM [dbo].{Quote(tableName)} WHERE [Id] = @Id;",
            new { Id = id }, cancellationToken: cancellationToken));

        return affected > 0;
    }

    private async Task<string?> GetPublishedTableNameAsync(Guid collectionId, CancellationToken cancellationToken)
    {
        if (!connectionFactory.IsSqlServerConfigured())
            return null;

        await using var connection = await connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        await EnsurePublishBindingTableAsync(connection);

        return await connection.QueryFirstOrDefaultAsync<string>(new CommandDefinition(@"
SELECT [TableName]
FROM [dbo].[CollectionPublishBindings]
WHERE [CollectionId] = @CollectionId
  AND [IsPublished] = 1;", new { CollectionId = collectionId }, cancellationToken: cancellationToken));
    }

    private async Task<List<string>> GetCollectionFieldNamesAsync(Guid collectionId, CancellationToken cancellationToken)
    {
        return await db.Fields
            .Where(f => f.CollectionDefinitionId == collectionId && !f.IsSystem && f.Type != FieldType.Table)
            .OrderBy(f => f.DisplayOrder)
            .Select(f => f.Name)
            .ToListAsync(cancellationToken);
    }

    private static EntityRecord ToEntityRecord(IDictionary<string, object?> dict, Guid collectionId, IEnumerable<string> fieldNames)
    {
        var data = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);

        if (dict.TryGetValue("DataJson", out var dataJsonObj) && dataJsonObj is string dataJsonText && !string.IsNullOrWhiteSpace(dataJsonText))
        {
            try
            {
                var payload = JsonSerializer.Deserialize<Dictionary<string, object?>>(dataJsonText);
                if (payload != null)
                {
                    foreach (var (k, v) in payload)
                        data[k] = v;
                }
            }
            catch
            {
                // Ignore legacy invalid json row and continue with typed columns.
            }
        }

        foreach (var field in fieldNames)
        {
            if (dict.TryGetValue(field, out var value))
            {
                var raw = value is DBNull ? null : value;
                // Re-parse JSON string column values (e.g. manyToMany arrays stored as '[...]')
                // so they are serialized as proper JSON arrays/objects in DataJson, not raw strings.
                if (raw is string strVal && strVal.Length > 1 && (strVal[0] == '[' || strVal[0] == '{'))
                {
                    try { raw = JsonSerializer.Deserialize<JsonElement>(strVal); }
                    catch { /* keep as string */ }
                }
                data[field] = raw;
            }
        }

        var id = dict.TryGetValue("Id", out var idObj) && idObj is Guid g ? g : Guid.Empty;
        //data["Id"] = id;
        var createdAt = dict.TryGetValue("CreatedAt", out var createdObj) && createdObj is DateTimeOffset c ? c : DateTimeOffset.UtcNow;
        var updatedAt = dict.TryGetValue("UpdatedAt", out var updatedObj) && updatedObj is DateTimeOffset u ? u : DateTimeOffset.UtcNow;
        var ownerId = dict.TryGetValue("OwnerId", out var ownerObj) ? ownerObj?.ToString() : null;

        return new EntityRecord
        {
            Id = id,
            CollectionDefinitionId = collectionId,
            OwnerId = ownerId,
            CreatedAt = createdAt,
            UpdatedAt = updatedAt,
            DataJson = JsonSerializer.Serialize(data)
        };
    }

    private static object? ConvertToSqlValue(FieldType type, object? value)
    {
        if (value is null)
            return null;

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

    private static async Task EnsurePublishBindingTableAsync(IDbConnection connection)
    {
        const string sql = @"
IF OBJECT_ID(N'dbo.CollectionPublishBindings', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[CollectionPublishBindings]
    (
        [CollectionId] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
        [CollectionSlug] NVARCHAR(100) NOT NULL,
        [TableName] NVARCHAR(128) NOT NULL,
        [IsPublished] BIT NOT NULL DEFAULT(0),
        [SchemaHash] NVARCHAR(64) NULL,
        [SchemaSnapshot] NVARCHAR(MAX) NULL,
        [UpdatedAt] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSUTCDATETIME()
    );
END;";

        await connection.ExecuteAsync(sql);
    }

    private static string Quote(string identifier)
    {
        return $"[{identifier.Replace("]", "]]", StringComparison.Ordinal)}]";
    }
}
