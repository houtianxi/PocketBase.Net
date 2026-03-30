using System.Data;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Dapper;
using Hangfire;
using Microsoft.EntityFrameworkCore;
using PocketbaseNet.Api.Contracts;
using PocketbaseNet.Api.Domain.Entities;
using PocketbaseNet.Api.Domain.Enums;

namespace PocketbaseNet.Api.Infrastructure.Services;

public class CollectionPublishService(
    AppDbContext db,
    SqlServerConnectionFactory connectionFactory,
    IBackgroundJobClient backgroundJobs)
{
    public async Task<PublishCollectionPreviewResponse> PreviewAsync(Guid collectionId, CancellationToken cancellationToken = default)
    {
        if (!connectionFactory.IsSqlServerConfigured())
            throw new InvalidOperationException("当前仅支持 SQL Server 发布实体表，请先将 DatabaseProvider 配置为 SqlServer。");

        var collection = await LoadCollectionAsync(collectionId, cancellationToken);
        await using var connection = await connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        await EnsurePublishTablesAsync(connection);

        var plan = await BuildPlanAsync(collection, connection, cancellationToken);
        return ToPreviewResponse(plan, "Preview");
    }

    public async Task<PublishCollectionEnqueueResponse> EnqueuePublishAsync(Guid collectionId, string? actorId, CancellationToken cancellationToken = default)
    {
        if (!connectionFactory.IsSqlServerConfigured())
            throw new InvalidOperationException("当前仅支持 SQL Server 发布实体表，请先将 DatabaseProvider 配置为 SqlServer。");

        var collection = await LoadCollectionAsync(collectionId, cancellationToken);
        await using var connection = await connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        await EnsurePublishTablesAsync(connection);

        var taskId = Guid.NewGuid();
        var createdAt = DateTimeOffset.UtcNow;

        await connection.ExecuteAsync(new CommandDefinition(@"
INSERT INTO [dbo].[CollectionPublishJobs]
([TaskId], [CollectionId], [CollectionSlug], [Status], [Progress], [CreatedAt])
VALUES
(@TaskId, @CollectionId, @CollectionSlug, @Status, @Progress, @CreatedAt);",
            new
            {
                TaskId = taskId,
                CollectionId = collection.Id,
                CollectionSlug = collection.Slug,
                Status = "Queued",
                Progress = 0,
                CreatedAt = createdAt
            }, cancellationToken: cancellationToken));

        var hangfireJobId = backgroundJobs.Enqueue<CollectionPublishService>(service => service.ExecutePublishJobAsync(taskId, collectionId, actorId, CancellationToken.None));

        await connection.ExecuteAsync(new CommandDefinition(@"
UPDATE [dbo].[CollectionPublishJobs]
SET [HangfireJobId] = @HangfireJobId
WHERE [TaskId] = @TaskId;",
            new { TaskId = taskId, HangfireJobId = hangfireJobId }, cancellationToken: cancellationToken));

        return new PublishCollectionEnqueueResponse(taskId, collection.Id, collection.Slug, hangfireJobId, "Queued", createdAt);
    }

    public async Task ExecutePublishJobAsync(Guid taskId, Guid collectionId, string? actorId, CancellationToken cancellationToken)
    {
        await using var connection = await connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        await EnsurePublishTablesAsync(connection);

        await UpdateTaskAsync(connection, taskId, "Running", 10, "正在生成迁移计划...", startedAt: DateTimeOffset.UtcNow, cancellationToken: cancellationToken);

        try
        {
            var collection = await LoadCollectionAsync(collectionId, cancellationToken);
            var plan = await BuildPlanAsync(collection, connection, cancellationToken);

            await UpdateTaskAsync(
                connection,
                taskId,
                "Running",
                40,
                plan.Message ?? "迁移计划已生成，准备执行...",
                schemaHash: plan.SchemaHash,
                planItems: plan.PlanItems,
                sqlScript: plan.SqlScript,
                cancellationToken: cancellationToken);

            using var tx = connection.BeginTransaction();
            if (!string.IsNullOrWhiteSpace(plan.SqlScript))
            {
                await connection.ExecuteAsync(new CommandDefinition(plan.SqlScript, transaction: tx, cancellationToken: cancellationToken));
            }

            await UpdateTaskAsync(connection, taskId, "Running", 70, "正在回填历史数据...", tx: tx, cancellationToken: cancellationToken);
            await BackfillLegacyRecordsAsync(connection, tx, collection, plan.TableName, cancellationToken);

            var nextVersion = await connection.ExecuteScalarAsync<int>(new CommandDefinition(@"
SELECT ISNULL(MAX([Version]), 0) + 1
FROM [dbo].[CollectionPublishVersions]
WHERE [CollectionId] = @CollectionId;",
                new { CollectionId = collection.Id }, tx, cancellationToken: cancellationToken));

            await connection.ExecuteAsync(new CommandDefinition(@"
MERGE [dbo].[CollectionPublishBindings] AS target
USING (SELECT @CollectionId AS CollectionId) AS source
ON target.CollectionId = source.CollectionId
WHEN MATCHED THEN
    UPDATE SET
        TableName = @TableName,
        IsPublished = 1,
        SchemaHash = @SchemaHash,
        SchemaSnapshot = @SchemaSnapshot,
        UpdatedAt = SYSUTCDATETIME()
WHEN NOT MATCHED THEN
    INSERT (CollectionId, CollectionSlug, TableName, IsPublished, SchemaHash, SchemaSnapshot, UpdatedAt)
    VALUES (@CollectionId, @CollectionSlug, @TableName, 1, @SchemaHash, @SchemaSnapshot, SYSUTCDATETIME());",
                new
                {
                    CollectionId = collection.Id,
                    CollectionSlug = collection.Slug,
                    TableName = plan.TableName,
                    SchemaHash = plan.SchemaHash,
                    SchemaSnapshot = plan.SchemaSnapshot
                }, tx, cancellationToken: cancellationToken));

            await connection.ExecuteAsync(new CommandDefinition(@"
INSERT INTO [dbo].[CollectionPublishVersions]
([CollectionId], [CollectionSlug], [Version], [TableName], [Script], [SchemaHash], [Status], [PublishedBy], [PublishedAt])
VALUES
(@CollectionId, @CollectionSlug, @Version, @TableName, @Script, @SchemaHash, @Status, @PublishedBy, SYSUTCDATETIME());",
                new
                {
                    CollectionId = collection.Id,
                    CollectionSlug = collection.Slug,
                    Version = nextVersion,
                    TableName = plan.TableName,
                    Script = plan.SqlScript,
                    SchemaHash = plan.SchemaHash,
                    Status = "Published",
                    PublishedBy = actorId
                }, tx, cancellationToken: cancellationToken));

            tx.Commit();

            await UpdateTaskAsync(connection, taskId, "Completed", 100, plan.Message ?? "发布完成", schemaHash: plan.SchemaHash, finishedAt: DateTimeOffset.UtcNow, planItems: plan.PlanItems, sqlScript: plan.SqlScript, cancellationToken: cancellationToken);
        }
        catch (Exception ex)
        {
            await UpdateTaskAsync(connection, taskId, "Failed", 100, ex.Message, finishedAt: DateTimeOffset.UtcNow, cancellationToken: cancellationToken);
            throw;
        }
    }

    public async Task<CollectionPublishStatusResponse> GetStatusAsync(Guid collectionId, CancellationToken cancellationToken = default)
    {
        if (!connectionFactory.IsSqlServerConfigured())
            return new CollectionPublishStatusResponse(collectionId, null, false, null, null, null, "SqlServer not configured");

        await using var connection = await connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        await EnsurePublishTablesAsync(connection);

        var binding = await connection.QueryFirstOrDefaultAsync<CollectionPublishBindingRow>(new CommandDefinition(@"
SELECT [CollectionId], [TableName], [IsPublished], [SchemaHash], [UpdatedAt]
FROM [dbo].[CollectionPublishBindings]
WHERE [CollectionId] = @CollectionId;", new { CollectionId = collectionId }, cancellationToken: cancellationToken));

        var latest = await connection.QueryFirstOrDefaultAsync<CollectionPublishVersionRow>(new CommandDefinition(@"
SELECT TOP 1 [Version], [PublishedAt], [Status]
FROM [dbo].[CollectionPublishVersions]
WHERE [CollectionId] = @CollectionId
ORDER BY [Version] DESC;", new { CollectionId = collectionId }, cancellationToken: cancellationToken));

        return new CollectionPublishStatusResponse(
            collectionId,
            binding?.TableName,
            binding?.IsPublished ?? false,
            binding?.SchemaHash,
            latest?.PublishedAt ?? binding?.UpdatedAt,
            latest?.Version,
            latest?.Status);
    }

    public async Task<IReadOnlyList<PublishTaskStatusResponse>> ListTasksAsync(Guid collectionId, CancellationToken cancellationToken = default)
    {
        await using var connection = await connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        await EnsurePublishTablesAsync(connection);

        var rows = await connection.QueryAsync<PublishJobRow>(new CommandDefinition(@"
SELECT TOP 20
    [TaskId], [CollectionId], [CollectionSlug], [HangfireJobId], [Status], [Progress], [Message],
    [SchemaHash], [CreatedAt], [StartedAt], [FinishedAt], [PlanJson], [SqlScript]
FROM [dbo].[CollectionPublishJobs]
WHERE [CollectionId] = @CollectionId
ORDER BY [CreatedAt] DESC;", new { CollectionId = collectionId }, cancellationToken: cancellationToken));

        return rows.Select(ToTaskResponse).ToList();
    }

    public async Task<PublishTaskStatusResponse?> GetTaskAsync(Guid taskId, CancellationToken cancellationToken = default)
    {
        await using var connection = await connectionFactory.CreateOpenConnectionAsync(cancellationToken);
        await EnsurePublishTablesAsync(connection);

        var row = await connection.QueryFirstOrDefaultAsync<PublishJobRow>(new CommandDefinition(@"
SELECT
    [TaskId], [CollectionId], [CollectionSlug], [HangfireJobId], [Status], [Progress], [Message],
    [SchemaHash], [CreatedAt], [StartedAt], [FinishedAt], [PlanJson], [SqlScript]
FROM [dbo].[CollectionPublishJobs]
WHERE [TaskId] = @TaskId;", new { TaskId = taskId }, cancellationToken: cancellationToken));

        return row is null ? null : ToTaskResponse(row);
    }

    private async Task<CollectionDefinition> LoadCollectionAsync(Guid collectionId, CancellationToken cancellationToken)
    {
        var collection = await db.Collections
            .Include(c => c.Fields)
            .Include(c => c.Records)
            .FirstOrDefaultAsync(c => c.Id == collectionId, cancellationToken);

        return collection ?? throw new InvalidOperationException("Collection not found");
    }

    private async Task<PublishPlan> BuildPlanAsync(CollectionDefinition collection, IDbConnection connection, CancellationToken cancellationToken)
    {
        var tableName = BuildPhysicalTableName(collection.Slug);
        var mainColumns = BuildTargetColumns(collection.Fields.Where(f => !f.IsSystem).ToList());
        var children = ParseChildrenFromSchema(collection.SchemaJson);

        var scriptParts = new List<string>();
        var warnings = new List<string>();
        var planItems = new List<PublishPlanItemResponse>();

        await BuildTablePlanAsync(connection, tableName, mainColumns, scriptParts, warnings, planItems, cancellationToken);

        foreach (var child in children)
        {
            var childTableName = BuildChildTableName(collection.Slug, child.Name);
            var childColumns = BuildChildColumns(child);
            await BuildTablePlanAsync(connection, childTableName, childColumns, scriptParts, warnings, planItems, cancellationToken);

            var fkSql = BuildChildForeignKeyScript(childTableName, tableName, child.CascadeDelete);
            scriptParts.Add(fkSql);
            planItems.Add(new PublishPlanItemResponse("ForeignKey", childTableName, "Create", $"创建子表 {childTableName} 到 {tableName} 的外键", fkSql));
        }

        if (warnings.Count > 0)
        {
            scriptParts.Add("-- Warnings");
            scriptParts.AddRange(warnings.Select(w => $"-- {w}"));
            planItems.AddRange(warnings.Select(w => new PublishPlanItemResponse("Warning", tableName, "Warning", w)));
        }

        var sqlScript = string.Join("\n\n", scriptParts.Where(s => !string.IsNullOrWhiteSpace(s)));
        var schemaHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(sqlScript)));
        var schemaSnapshot = JsonSerializer.Serialize(new { mainColumns, children });
        var message = warnings.Count == 0 ? null : string.Join(" | ", warnings);

        return new PublishPlan(collection.Id, collection.Slug, tableName, sqlScript, schemaHash, schemaSnapshot, message, planItems);
    }

    private static PublishCollectionPreviewResponse ToPreviewResponse(PublishPlan plan, string status)
    {
        return new PublishCollectionPreviewResponse(
            plan.CollectionId,
            plan.CollectionSlug,
            plan.TableName,
            status,
            plan.SqlScript,
            plan.SchemaHash,
            DateTimeOffset.UtcNow,
            plan.Message,
            plan.PlanItems);
    }

    private static async Task BuildTablePlanAsync(
        IDbConnection connection,
        string tableName,
        IReadOnlyList<PublishColumnDefinition> targetColumns,
        List<string> scriptParts,
        List<string> warnings,
        List<PublishPlanItemResponse> planItems,
        CancellationToken cancellationToken)
    {
        var existingColumns = await GetExistingColumnsAsync(connection, tableName);
        if (existingColumns.Count == 0)
        {
            var createSql = BuildCreateTableScript(tableName, targetColumns);
            scriptParts.Add(createSql);
            planItems.Add(new PublishPlanItemResponse("Table", tableName, "Create", $"创建实体表 {tableName}", createSql));

            foreach (var item in BuildUniqueIndexOperations(tableName, targetColumns))
            {
                scriptParts.Add(item.Sql);
                planItems.Add(item.PlanItem);
            }
            return;
        }

        var consumedExistingColumns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var target in targetColumns)
        {
            ExistingColumnDefinition? existing = null;
            string? existingKey = null;

            if (existingColumns.TryGetValue(target.Name, out var directExisting))
            {
                existing = directExisting;
                existingKey = target.Name;
            }
            else if (!string.IsNullOrWhiteSpace(target.RenameFrom) && existingColumns.TryGetValue(target.RenameFrom, out var renameExisting))
            {
                existing = renameExisting;
                existingKey = target.RenameFrom;

                var renameIndexSql = BuildDropUniqueIndexScript(tableName, target.RenameFrom);
                if (!string.IsNullOrWhiteSpace(renameIndexSql))
                {
                    scriptParts.Add(renameIndexSql);
                    planItems.Add(new PublishPlanItemResponse("Index", tableName, "Drop", $"删除旧唯一索引 UX_{tableName}_{target.RenameFrom}", renameIndexSql));
                }

                var renameSql = BuildRenameColumnScript(tableName, target.RenameFrom, target.Name);
                scriptParts.Add(renameSql);
                planItems.Add(new PublishPlanItemResponse("Column", $"{tableName}.{target.RenameFrom}", "Rename", $"字段 {target.RenameFrom} 重命名为 {target.Name}", renameSql));
            }
            else
            {
                var addNullableSql = target.IsNullable ? "NULL" : "NOT NULL";
                var addSql = $@"
ALTER TABLE [dbo].{Quote(tableName)}
ADD {Quote(target.Name)} {target.SqlType} {addNullableSql};";
                scriptParts.Add(addSql);
                planItems.Add(new PublishPlanItemResponse("Column", $"{tableName}.{target.Name}", "Add", $"新增字段 {target.Name}", addSql));
            }

            if (existing != null)
            {
                consumedExistingColumns.Add(existingKey!);
                var targetType = NormalizeSqlType(target.SqlType);
                var existingType = NormalizeExistingType(existing);
                var typeChanged = !string.Equals(targetType, existingType, StringComparison.OrdinalIgnoreCase);
                var nullabilityChanged = target.IsNullable != existing.IsNullable;

                if (!typeChanged && !nullabilityChanged)
                {
                    foreach (var op in BuildUniqueIndexOperations(tableName, [target]))
                    {
                        scriptParts.Add(op.Sql);
                        planItems.Add(op.PlanItem);
                    }
                    continue;
                }

                if (!target.IsNullable && existing.IsNullable)
                {
                    warnings.Add($"列 {tableName}.{target.Name} 需要从 NULL 改为 NOT NULL，已跳过自动收紧，请先清理空值后再手动处理。");
                }
                else
                {
                    var nullableSql = target.IsNullable ? "NULL" : "NOT NULL";
                    var alterSql = $@"
ALTER TABLE [dbo].{Quote(tableName)}
ALTER COLUMN {Quote(target.Name)} {target.SqlType} {nullableSql};";
                    scriptParts.Add(alterSql);
                    planItems.Add(new PublishPlanItemResponse("Column", $"{tableName}.{target.Name}", "Alter", $"修改字段 {target.Name} 类型/可空性", alterSql));
                }
            }

            foreach (var op in BuildUniqueIndexOperations(tableName, [target]))
            {
                scriptParts.Add(op.Sql);
                planItems.Add(op.PlanItem);
            }
        }

        var removableColumns = existingColumns.Keys
            .Where(c => !consumedExistingColumns.Contains(c))
            .Where(c => targetColumns.All(tc => !string.Equals(tc.Name, c, StringComparison.OrdinalIgnoreCase)))
            .Where(c => c is not "Id" and not "CreatedAt" and not "UpdatedAt" and not "OwnerId" and not "DataJson" and not "ParentId")
            .ToList();

        foreach (var removed in removableColumns)
        {
            var dropIndexSql = BuildDropUniqueIndexScript(tableName, removed);
            if (!string.IsNullOrWhiteSpace(dropIndexSql))
            {
                scriptParts.Add(dropIndexSql);
                planItems.Add(new PublishPlanItemResponse("Index", tableName, "Drop", $"删除字段 {removed} 关联唯一索引", dropIndexSql));
            }

            var dropSql = $@"
ALTER TABLE [dbo].{Quote(tableName)}
DROP COLUMN {Quote(removed)};";
            scriptParts.Add(dropSql);
            planItems.Add(new PublishPlanItemResponse("Column", $"{tableName}.{removed}", "Drop", $"删除字段 {removed}", dropSql));
        }
    }

    private static IEnumerable<(string Sql, PublishPlanItemResponse PlanItem)> BuildUniqueIndexOperations(string tableName, IEnumerable<PublishColumnDefinition> columns)
    {
        foreach (var col in columns.Where(c => c.IsUnique))
        {
            var indexName = $"UX_{tableName}_{col.Name}";
            var sql = $@"
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'{indexName}'
      AND object_id = OBJECT_ID(N'dbo.{tableName}')
)
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX {Quote(indexName)}
    ON [dbo].{Quote(tableName)} ({Quote(col.Name)})
    WHERE {Quote(col.Name)} IS NOT NULL;
END";
            yield return (sql, new PublishPlanItemResponse("Index", $"{tableName}.{col.Name}", "Create", $"创建唯一索引 {indexName}", sql));
        }
    }

    private static string BuildDropUniqueIndexScript(string tableName, string columnName)
    {
        var indexName = $"UX_{tableName}_{columnName}";
        return $@"
IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'{indexName}'
      AND object_id = OBJECT_ID(N'dbo.{tableName}')
)
BEGIN
    DROP INDEX {Quote(indexName)} ON [dbo].{Quote(tableName)};
END";
    }

    private static string BuildRenameColumnScript(string tableName, string oldName, string newName)
    {
        return $@"
IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = '{tableName}'
      AND COLUMN_NAME = '{oldName}'
)
AND NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = '{tableName}'
      AND COLUMN_NAME = '{newName}'
)
BEGIN
    EXEC sp_rename 'dbo.{tableName}.{oldName}', '{newName}', 'COLUMN';
END";
    }

    private static List<PublishColumnDefinition> BuildTargetColumns(List<Field> fields)
    {
        var columns = new List<PublishColumnDefinition>
        {
            new("Id", "UNIQUEIDENTIFIER", false),
            new("CreatedAt", "DATETIMEOFFSET(7)", false),
            new("UpdatedAt", "DATETIMEOFFSET(7)", false),
            new("OwnerId", "NVARCHAR(450)", true),
            new("DataJson", "NVARCHAR(MAX)", true)
        };

        foreach (var field in fields.OrderBy(f => f.DisplayOrder))
        {
            columns.Add(new PublishColumnDefinition(field.Name, MapSqlType(field.Type), !field.IsRequired, field.IsUnique, ExtractRenameFrom(field.Config)));
        }

        return columns.GroupBy(c => c.Name, StringComparer.OrdinalIgnoreCase).Select(g => g.First()).ToList();
    }

    private static List<PublishColumnDefinition> BuildChildColumns(ChildTableSchema child)
    {
        var columns = new List<PublishColumnDefinition>
        {
            new("Id", "UNIQUEIDENTIFIER", false),
            new("ParentId", "UNIQUEIDENTIFIER", false),
            new("CreatedAt", "DATETIMEOFFSET(7)", false),
            new("UpdatedAt", "DATETIMEOFFSET(7)", false),
            new("DataJson", "NVARCHAR(MAX)", true)
        };

        foreach (var field in child.Fields)
        {
            columns.Add(new PublishColumnDefinition(field.Name, MapSqlType(field.Type), !field.Required, field.Unique, field.RenameFrom));
        }

        return columns.GroupBy(c => c.Name, StringComparer.OrdinalIgnoreCase).Select(g => g.First()).ToList();
    }

    private static string? ExtractRenameFrom(JsonElement config)
    {
        try
        {
            if (config.ValueKind is JsonValueKind.Object && config.TryGetProperty("renameFrom", out var renameProperty))
            {
                var value = renameProperty.GetString();
                return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
            }
        }
        catch
        {
        }
        return null;
    }

    private static async Task<Dictionary<string, ExistingColumnDefinition>> GetExistingColumnsAsync(IDbConnection connection, string tableName)
    {
        var rows = await connection.QueryAsync<ExistingColumnDefinition>(@"
SELECT
    COLUMN_NAME AS [Name],
    DATA_TYPE AS [DataType],
    CHARACTER_MAXIMUM_LENGTH AS [CharacterMaximumLength],
    NUMERIC_PRECISION AS [NumericPrecision],
    NUMERIC_SCALE AS [NumericScale],
    CASE WHEN IS_NULLABLE = 'YES' THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS [IsNullable]
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo'
  AND TABLE_NAME = @TableName;", new { TableName = tableName });

        return rows.ToDictionary(r => r.Name, r => r, StringComparer.OrdinalIgnoreCase);
    }

    private static string BuildCreateTableScript(string tableName, IEnumerable<PublishColumnDefinition> columns)
    {
        var lines = new List<string>();
        foreach (var col in columns)
        {
            var nullableSql = col.IsNullable ? "NULL" : "NOT NULL";
            var defaultSql = col.Name switch
            {
                "Id" => " DEFAULT NEWID()",
                "CreatedAt" => " DEFAULT SYSUTCDATETIME()",
                "UpdatedAt" => " DEFAULT SYSUTCDATETIME()",
                _ => string.Empty
            };

            lines.Add($"    {Quote(col.Name)} {col.SqlType} {nullableSql}{defaultSql}");
        }

        lines.Add("    CONSTRAINT " + Quote($"PK_{tableName}") + " PRIMARY KEY CLUSTERED ([Id])");

        return $@"
IF OBJECT_ID(N'dbo.{tableName}', N'U') IS NULL
BEGIN
CREATE TABLE [dbo].{Quote(tableName)}
(
{string.Join(",\n", lines)}
);
END";
    }

    private static string BuildChildForeignKeyScript(string childTableName, string parentTableName, bool cascadeDelete)
    {
        var fkName = $"FK_{childTableName}_{parentTableName}_ParentId";
        var cascade = cascadeDelete ? "CASCADE" : "NO ACTION";

        return $@"
IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'{fkName}'
      AND parent_object_id = OBJECT_ID(N'dbo.{childTableName}')
)
BEGIN
    ALTER TABLE [dbo].{Quote(childTableName)}
    ADD CONSTRAINT {Quote(fkName)}
        FOREIGN KEY ([ParentId])
        REFERENCES [dbo].{Quote(parentTableName)} ([Id])
        ON DELETE {cascade};
END

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_{childTableName}_ParentId'
      AND object_id = OBJECT_ID(N'dbo.{childTableName}')
)
BEGIN
    CREATE INDEX {Quote($"IX_{childTableName}_ParentId")}
    ON [dbo].{Quote(childTableName)} ([ParentId]);
END";
    }

    private static string NormalizeSqlType(string sqlType)
    {
        var t = sqlType.Trim().ToLowerInvariant().Replace(" ", string.Empty);
        return t == "numeric(18,4)" ? "decimal(18,4)" : t;
    }

    private static string NormalizeExistingType(ExistingColumnDefinition existing)
    {
        var dataType = existing.DataType.ToLowerInvariant();
        return dataType switch
        {
            "nvarchar" => existing.CharacterMaximumLength == -1 ? "nvarchar(max)" : $"nvarchar({existing.CharacterMaximumLength})",
            "varchar" => existing.CharacterMaximumLength == -1 ? "varchar(max)" : $"varchar({existing.CharacterMaximumLength})",
            "decimal" or "numeric" => $"decimal({existing.NumericPrecision ?? 18},{existing.NumericScale ?? 0})",
            "datetimeoffset" => "datetimeoffset(7)",
            _ => dataType
        };
    }

    private static List<ChildTableSchema> ParseChildrenFromSchema(string? schemaJson)
    {
        if (string.IsNullOrWhiteSpace(schemaJson))
            return [];

        try
        {
            var root = JsonSerializer.Deserialize<CollectionSchemaDefinition>(schemaJson) ?? new CollectionSchemaDefinition();
            return root.Children
                .Where(c => !string.IsNullOrWhiteSpace(c.Name))
                .Select(c => new ChildTableSchema(
                    c.Name.Trim(),
                    c.CascadeDelete,
                    c.Fields.Where(f => !string.IsNullOrWhiteSpace(f.Name))
                        .Select(f => new ChildFieldSchema(
                            f.Name.Trim(),
                            ParseFieldType(f.Type),
                            f.Required,
                            f.Unique,
                            string.IsNullOrWhiteSpace(f.RenameFrom) ? null : f.RenameFrom.Trim()))
                        .ToList()))
                .ToList();
        }
        catch
        {
            return [];
        }
    }

    private static FieldType ParseFieldType(string? type)
    {
        if (string.IsNullOrWhiteSpace(type))
            return FieldType.Text;
        if (int.TryParse(type, out var number) && Enum.IsDefined(typeof(FieldType), number))
            return (FieldType)number;
        return Enum.TryParse<FieldType>(type, true, out var parsed) ? parsed : FieldType.Text;
    }

    private static string MapSqlType(FieldType fieldType)
    {
        return fieldType switch
        {
            FieldType.Number => "DECIMAL(18,4)",
            FieldType.Checkbox => "BIT",
            FieldType.Date => "DATE",
            FieldType.DateTime => "DATETIMEOFFSET(7)",
            FieldType.AutoIncrement => "BIGINT",
            FieldType.Textarea => "NVARCHAR(2000)",
            FieldType.Text or FieldType.Email or FieldType.Url or FieldType.Select => "NVARCHAR(500)",
            _ => "NVARCHAR(MAX)"
        };
    }

    private static string BuildPhysicalTableName(string slug)
    {
        var normalized = NormalizeName(slug, "collection");
        return $"pb_{normalized}";
    }

    public static string BuildChildTableName(string parentSlug, string childName)
    {
        var parent = NormalizeName(parentSlug, "collection");
        var child = NormalizeName(childName, "detail");
        return $"pb_{parent}_{child}";
    }

    private static string NormalizeName(string value, string fallback)
    {
        var normalized = new string(value.ToLowerInvariant().Select(ch => char.IsLetterOrDigit(ch) || ch == '_' ? ch : '_').ToArray()).Trim('_');
        return string.IsNullOrWhiteSpace(normalized) ? fallback : normalized;
    }

    private static string Quote(string identifier)
    {
        return $"[{identifier.Replace("]", "]]", StringComparison.Ordinal)}]";
    }

    private static async Task EnsurePublishTablesAsync(IDbConnection connection)
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
END;

IF OBJECT_ID(N'dbo.CollectionPublishVersions', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[CollectionPublishVersions]
    (
        [Id] BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [CollectionId] UNIQUEIDENTIFIER NOT NULL,
        [CollectionSlug] NVARCHAR(100) NOT NULL,
        [Version] INT NOT NULL,
        [TableName] NVARCHAR(128) NOT NULL,
        [Script] NVARCHAR(MAX) NOT NULL,
        [SchemaHash] NVARCHAR(64) NULL,
        [Status] NVARCHAR(30) NOT NULL,
        [PublishedBy] NVARCHAR(450) NULL,
        [PublishedAt] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSUTCDATETIME()
    );

    CREATE INDEX [IX_CollectionPublishVersions_CollectionId_Version]
    ON [dbo].[CollectionPublishVersions]([CollectionId], [Version] DESC);
END;

IF OBJECT_ID(N'dbo.CollectionPublishJobs', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[CollectionPublishJobs]
    (
        [TaskId] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
        [CollectionId] UNIQUEIDENTIFIER NOT NULL,
        [CollectionSlug] NVARCHAR(100) NOT NULL,
        [HangfireJobId] NVARCHAR(128) NULL,
        [Status] NVARCHAR(30) NOT NULL,
        [Progress] INT NOT NULL DEFAULT(0),
        [Message] NVARCHAR(MAX) NULL,
        [SchemaHash] NVARCHAR(64) NULL,
        [PlanJson] NVARCHAR(MAX) NULL,
        [SqlScript] NVARCHAR(MAX) NULL,
        [CreatedAt] DATETIMEOFFSET(7) NOT NULL DEFAULT SYSUTCDATETIME(),
        [StartedAt] DATETIMEOFFSET(7) NULL,
        [FinishedAt] DATETIMEOFFSET(7) NULL
    );

    CREATE INDEX [IX_CollectionPublishJobs_CollectionId_CreatedAt]
    ON [dbo].[CollectionPublishJobs]([CollectionId], [CreatedAt] DESC);
END;";

        await connection.ExecuteAsync(sql);
    }

    private static async Task BackfillLegacyRecordsAsync(IDbConnection connection, IDbTransaction tx, CollectionDefinition collection, string tableName, CancellationToken cancellationToken)
    {
        var fields = collection.Fields.Where(f => !f.IsSystem).OrderBy(f => f.DisplayOrder).ToList();
        foreach (var record in collection.Records)
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

            var payload = new DynamicParameters();
            payload.Add("Id", record.Id);
            payload.Add("CreatedAt", record.CreatedAt);
            payload.Add("UpdatedAt", record.UpdatedAt);
            payload.Add("OwnerId", record.OwnerId);
            payload.Add("DataJson", record.DataJson);

            var columns = new List<string> { Quote("Id"), Quote("CreatedAt"), Quote("UpdatedAt"), Quote("OwnerId"), Quote("DataJson") };
            var values = new List<string> { "@Id", "@CreatedAt", "@UpdatedAt", "@OwnerId", "@DataJson" };

            foreach (var field in fields)
            {
                if (!TryGetIgnoreCase(data, field.Name, out var rawValue))
                    continue;

                var paramName = $"p_{field.Name}";
                payload.Add(paramName, ConvertLegacyValue(field.Type, rawValue));
                columns.Add(Quote(field.Name));
                values.Add("@" + paramName);
            }

            var sql = $@"
IF NOT EXISTS (SELECT 1 FROM [dbo].{Quote(tableName)} WHERE [Id] = @Id)
BEGIN
    INSERT INTO [dbo].{Quote(tableName)} ({string.Join(",", columns)})
    VALUES ({string.Join(",", values)});
END";

            await connection.ExecuteAsync(new CommandDefinition(sql, payload, tx, cancellationToken: cancellationToken));
        }
    }

    private static bool TryGetIgnoreCase(Dictionary<string, object?> data, string key, out object? value)
    {
        if (data.TryGetValue(key, out value))
            return true;

        var actualKey = data.Keys.FirstOrDefault(k => string.Equals(k, key, StringComparison.OrdinalIgnoreCase));
        if (actualKey != null)
            return data.TryGetValue(actualKey, out value);

        value = null;
        return false;
    }

    private static object? ConvertLegacyValue(FieldType type, object? value)
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
            FieldType.Number when decimal.TryParse(value?.ToString(), out var dec) => dec,
            FieldType.Checkbox when bool.TryParse(value?.ToString(), out var b) => b,
            FieldType.Date when DateTime.TryParse(value?.ToString(), out var d) => d.Date,
            FieldType.DateTime when DateTimeOffset.TryParse(value?.ToString(), out var dto) => dto,
            FieldType.Json => value is string s ? s : JsonSerializer.Serialize(value),
            FieldType.Relation => value is string rel ? rel : JsonSerializer.Serialize(value),
            _ => value?.ToString()
        };
    }

    private static PublishTaskStatusResponse ToTaskResponse(PublishJobRow row)
    {
        var planItems = string.IsNullOrWhiteSpace(row.PlanJson)
            ? new List<PublishPlanItemResponse>()
            : JsonSerializer.Deserialize<List<PublishPlanItemResponse>>(row.PlanJson) ?? new List<PublishPlanItemResponse>();

        return new PublishTaskStatusResponse(
            row.TaskId,
            row.CollectionId,
            row.CollectionSlug,
            row.HangfireJobId,
            row.Status,
            row.Progress,
            row.Message,
            row.SchemaHash,
            row.CreatedAt,
            row.StartedAt,
            row.FinishedAt,
            planItems,
            row.SqlScript);
    }

    private static async Task UpdateTaskAsync(
        IDbConnection connection,
        Guid taskId,
        string status,
        int progress,
        string? message,
        string? schemaHash = null,
        DateTimeOffset? startedAt = null,
        DateTimeOffset? finishedAt = null,
        IReadOnlyList<PublishPlanItemResponse>? planItems = null,
        string? sqlScript = null,
        IDbTransaction? tx = null,
        CancellationToken cancellationToken = default)
    {
        await connection.ExecuteAsync(new CommandDefinition(@"
UPDATE [dbo].[CollectionPublishJobs]
SET [Status] = @Status,
    [Progress] = @Progress,
    [Message] = @Message,
    [SchemaHash] = COALESCE(@SchemaHash, [SchemaHash]),
    [StartedAt] = COALESCE(@StartedAt, [StartedAt]),
    [FinishedAt] = COALESCE(@FinishedAt, [FinishedAt]),
    [PlanJson] = COALESCE(@PlanJson, [PlanJson]),
    [SqlScript] = COALESCE(@SqlScript, [SqlScript])
WHERE [TaskId] = @TaskId;",
            new
            {
                TaskId = taskId,
                Status = status,
                Progress = progress,
                Message = message,
                SchemaHash = schemaHash,
                StartedAt = startedAt,
                FinishedAt = finishedAt,
                PlanJson = planItems == null ? null : JsonSerializer.Serialize(planItems),
                SqlScript = sqlScript
            }, tx, cancellationToken: cancellationToken));
    }

    private sealed record PublishPlan(
        Guid CollectionId,
        string CollectionSlug,
        string TableName,
        string SqlScript,
        string SchemaHash,
        string SchemaSnapshot,
        string? Message,
        IReadOnlyList<PublishPlanItemResponse> PlanItems);

    private sealed record PublishColumnDefinition(string Name, string SqlType, bool IsNullable, bool IsUnique = false, string? RenameFrom = null);

    private sealed class ExistingColumnDefinition
    {
        public string Name { get; init; } = string.Empty;
        public string DataType { get; init; } = string.Empty;
        public int? CharacterMaximumLength { get; init; }
        public int? NumericPrecision { get; init; }
        public int? NumericScale { get; init; }
        public bool IsNullable { get; init; }
    }

    private sealed record CollectionPublishBindingRow(Guid CollectionId, string TableName, bool IsPublished, string? SchemaHash, DateTimeOffset UpdatedAt);
    private sealed record CollectionPublishVersionRow(int Version, DateTimeOffset PublishedAt, string Status);

    private sealed class CollectionSchemaDefinition
    {
        public List<ChildSchemaDto> Children { get; init; } = [];
    }

    private sealed class ChildSchemaDto
    {
        public string Name { get; init; } = string.Empty;
        public bool CascadeDelete { get; init; } = true;
        public List<ChildFieldDto> Fields { get; init; } = [];
    }

    private sealed class ChildFieldDto
    {
        public string Name { get; init; } = string.Empty;
        public string? Type { get; init; }
        public bool Required { get; init; }
        public bool Unique { get; init; }
        public string? RenameFrom { get; init; }
    }

    private sealed record ChildTableSchema(string Name, bool CascadeDelete, List<ChildFieldSchema> Fields);
    private sealed record ChildFieldSchema(string Name, FieldType Type, bool Required, bool Unique, string? RenameFrom);

    private sealed class PublishJobRow
    {
        public Guid TaskId { get; init; }
        public Guid CollectionId { get; init; }
        public string CollectionSlug { get; init; } = string.Empty;
        public string? HangfireJobId { get; init; }
        public string Status { get; init; } = string.Empty;
        public int Progress { get; init; }
        public string? Message { get; init; }
        public string? SchemaHash { get; init; }
        public DateTimeOffset CreatedAt { get; init; }
        public DateTimeOffset? StartedAt { get; init; }
        public DateTimeOffset? FinishedAt { get; init; }
        public string? PlanJson { get; init; }
        public string? SqlScript { get; init; }
    }
}
