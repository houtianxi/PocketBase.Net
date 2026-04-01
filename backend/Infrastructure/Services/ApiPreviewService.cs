using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PocketbaseNet.Api.Contracts;
using PocketbaseNet.Api.Domain.Entities;
using PocketbaseNet.Api.Domain.Enums;

namespace PocketbaseNet.Api.Infrastructure.Services;

public class ApiPreviewService(AppDbContext db)
{
    public async Task<CollectionApiPreviewResponse> BuildAsync(Guid collectionId, CancellationToken cancellationToken = default)
    {
        var collection = await db.Collections
            .Include(c => c.Fields)
            .FirstOrDefaultAsync(c => c.Id == collectionId, cancellationToken)
            ?? throw new InvalidOperationException("Collection not found");

        var fields = collection.Fields
            .Where(f => !f.IsSystem)
            .OrderBy(f => f.DisplayOrder)
            .ToList();

        var tableFields = fields.Where(f => f.Type == FieldType.Table).ToList();
        var relationFields = fields.Where(f => f.Type == FieldType.Relation).Select(f => f.Name).ToList();
        var childDefinitions = await BuildChildDefinitionsAsync(tableFields, cancellationToken);

        var endpoints = new List<ApiPreviewEndpointResponse>
        {
            BuildListEndpoint(collection, fields, relationFields, tableFields),
            BuildCreateEndpoint(collection, fields, tableFields, childDefinitions),
            BuildUpdateEndpoint(collection, fields, tableFields, childDefinitions),
            BuildDeleteEndpoint(collection)
        };

        return new CollectionApiPreviewResponse(collection.Id, collection.Name, collection.Slug, endpoints);
    }

    private static ApiPreviewEndpointResponse BuildListEndpoint(
        CollectionDefinition collection,
        List<Field> fields,
        List<string> relationFields,
        List<Field> tableFields)
    {
        var fieldNames = fields.Select(f => f.Name).ToList();
        var sortableFields = fieldNames.Count == 0 ? "created, updated" : $"created, updated, {string.Join(", ", fieldNames)}";
        var expandExample = relationFields.Count == 0 ? string.Empty : string.Join(",", relationFields.Take(2));
        var fieldsExample = fieldNames.Count == 0 ? "id,created,updated" : string.Join(",", fieldNames.Take(Math.Min(3, fieldNames.Count)).Prepend("id"));
        var filterField = fields.FirstOrDefault(f => f.Type is FieldType.Text or FieldType.Email)?.Name ?? fieldNames.FirstOrDefault() ?? "name";
        var sortField = fields.FirstOrDefault(f => f.Type is FieldType.DateTime or FieldType.Date or FieldType.Number)?.Name ?? "updated";

        var parameters = new List<ApiPreviewParameterResponse>
        {
            new("page", "query", "number", false, "页码，从 1 开始。示例：page=2 表示第 2 页。", "2"),
            new("perPage", "query", "number", false, "每页条数，范围 1-100。示例：perPage=50。", "50"),
            new("sort", "query", "string", false, $"排序字段，多个字段逗号分隔，前缀 - 表示倒序。可用字段：{sortableFields}。示例：sort=-{sortField},created", $"-{sortField},created"),
            new("filter", "query", "string", false, $"过滤表达式，支持 eq/ne/lt/gt/contains。示例：{filterField} contains 'demo'。字段可用：{string.Join(", ", fieldNames)}。", $"{filterField} contains 'demo'"),
            new("search", "query", "string", false, "全文搜索关键字，会对记录 JSON 做模糊匹配。示例：search=acme", "acme"),
            new("fields", "query", "string", false, $"仅返回指定字段，多个字段逗号分隔。示例：fields={fieldsExample}。", fieldsExample),
            new("expand", "query", "string", false,
                relationFields.Count == 0
                    ? "关系展开。当前集合没有 Relation 字段；Table 字段会自动展开子表，无需通过 expand 指定。"
                    : $"展开 Relation 字段为完整对象。示例：expand={expandExample}。Table 字段会自动展开子表，无需通过 expand 指定。可用 Relation 字段：{string.Join(", ", relationFields)}。",
                relationFields.FirstOrDefault())
        };

        var requestExample = BuildListRequestExample(collection.Slug, filterField, sortField, fieldsExample, expandExample);
        var responseExample = BuildListResponseExample(collection, fields, relationFields, tableFields);

        return new ApiPreviewEndpointResponse(
            "list",
            "List",
            "GET",
            $"/api/records/{collection.Slug}",
            "查询记录列表，支持分页、排序、过滤、搜索、字段裁剪和关系展开。",
            parameters,
            null,
            null,
            requestExample,
            responseExample,
            [
                "如果集合已发布到 SQL Server，查询会走实体表；否则走 Records JSON 存储。",
                "返回结果包含 page、perPage、totalItems、totalPages、items。",
                tableFields.Count > 0
                    ? $"当前集合包含 Table 字段：{string.Join(", ", tableFields.Select(f => f.Name))}。List 接口会自动展开这些子表数据。"
                    : "当前集合不包含 Table 字段。"
            ]);
    }

    private static ApiPreviewEndpointResponse BuildCreateEndpoint(
        CollectionDefinition collection,
        List<Field> fields,
        List<Field> tableFields,
        List<ChildPreviewDefinition> childDefinitions)
    {
        var useGraph = tableFields.Count > 0;
        var url = useGraph ? $"/api/records/{collection.Slug}/graph" : $"/api/records/{collection.Slug}";
        var bodyObject = BuildBodyExample(fields, childDefinitions, includeChildren: useGraph);
        var parameters = new List<ApiPreviewParameterResponse>();

        if (useGraph)
        {
            parameters.Add(new ApiPreviewParameterResponse(
                "children",
                "body",
                "object",
                false,
                $"主子表写入对象。推荐 key 使用子表名：{string.Join(", ", childDefinitions.Select(c => c.ChildName))}。",
                childDefinitions.FirstOrDefault()?.ChildName));
        }

        var notes = new List<string>
        {
            "顶层 data 对象用于主表字段。",
            useGraph ? "当前集合包含 Table 字段，创建时应使用 /graph 接口，children 中传子表数组。" : "当前集合不包含 Table 字段，直接使用普通 create 接口即可。"
        };

        notes.AddRange(BuildFieldNotes(fields));
        notes.AddRange(BuildChildNotes(childDefinitions));

        return new ApiPreviewEndpointResponse(
            "create",
            "Create",
            "POST",
            url,
            useGraph ? "创建主记录并可同时写入 Table 子表数据。" : "创建一条普通记录。",
            parameters,
            JsonSerializer.Serialize(bodyObject, JsonOptions),
            useGraph
                ? "直接把下面 JSON 作为请求体发送即可。data 是主表字段，children 是每个 Table 子表对应的行数组。"
                : "直接把下面 JSON 作为请求体发送即可。data 是主表字段对象。",
            BuildCreateRequestExample(collection.Slug, useGraph),
            BuildCreateOrUpdateResponseExample(collection.Slug),
            notes);
    }

    private static ApiPreviewEndpointResponse BuildUpdateEndpoint(
        CollectionDefinition collection,
        List<Field> fields,
        List<Field> tableFields,
        List<ChildPreviewDefinition> childDefinitions)
    {
        var useGraph = tableFields.Count > 0;
        var url = useGraph ? $"/api/records/{collection.Slug}/{{id}}/graph" : $"/api/records/{collection.Slug}/{{id}}";
        var parameters = new List<ApiPreviewParameterResponse>
        {
            new("id", "path", "guid", true, "要更新的记录 ID。", "00000000-0000-0000-0000-000000000001")
        };

        var bodyObject = BuildBodyExample(fields, childDefinitions, includeChildren: useGraph);
        var notes = new List<string>
        {
            "路径参数 id 必填。",
            useGraph ? "graph update 会先更新主表，再按 children 覆盖对应子表数据。" : "可以传完整 data，也可以只传需要修改的字段。"
        };

        notes.AddRange(BuildFieldNotes(fields));
        notes.AddRange(BuildChildNotes(childDefinitions));

        return new ApiPreviewEndpointResponse(
            "update",
            "Update",
            "PUT",
            url,
            useGraph ? "更新主记录并同步 Table 子表数据。" : "更新一条记录。",
            parameters,
            JsonSerializer.Serialize(bodyObject, JsonOptions),
            useGraph
                ? "直接把下面 JSON 作为请求体发送即可。id 在 URL 中传入，body 中仍然是 data 和 children。"
                : "直接把下面 JSON 作为请求体发送即可。id 在 URL 中传入。",
            BuildUpdateRequestExample(collection.Slug, useGraph),
            BuildCreateOrUpdateResponseExample(collection.Slug),
            notes);
    }

    private static ApiPreviewEndpointResponse BuildDeleteEndpoint(CollectionDefinition collection)
    {
        return new ApiPreviewEndpointResponse(
            "delete",
            "Delete",
            "DELETE",
            $"/api/records/{collection.Slug}/{{id}}",
            "按 ID 删除一条记录。",
            [
                new ApiPreviewParameterResponse("id", "path", "guid", true, "要删除的记录 ID。", "00000000-0000-0000-0000-000000000001")
            ],
            null,
            null,
            $"DELETE /api/records/{collection.Slug}/00000000-0000-0000-0000-000000000001",
            "{\n  \"success\": true\n}",
            ["Delete 请求通常只需要路径中的 id 参数。"]);
    }

    private static string BuildListRequestExample(
        string collectionSlug,
        string filterField,
        string sortField,
        string fieldsExample,
        string expandExample)
    {
        var parts = new List<string>
        {
            "page=1",
            "perPage=20",
            $"sort=-{sortField}",
            $"filter={Uri.EscapeDataString($"{filterField} contains 'demo'")}",
            "search=demo",
            $"fields={Uri.EscapeDataString(fieldsExample)}"
        };

        if (!string.IsNullOrWhiteSpace(expandExample))
            parts.Add($"expand={Uri.EscapeDataString(expandExample)}");

        return $"GET /api/records/{collectionSlug}?{string.Join("&", parts)}";
    }

    private static string BuildListResponseExample(
        CollectionDefinition collection,
        List<Field> fields,
        List<string> relationFields,
        List<Field> tableFields)
    {
        var itemData = new Dictionary<string, object?>();
        foreach (var field in fields.Where(f => f.Type != FieldType.Table).Take(3))
        {
            itemData[field.Name] = BuildExampleValue(field);
        }

        foreach (var relationField in relationFields.Take(1))
        {
            itemData[relationField] = new
            {
                id = "RELATED_RECORD_ID",
                name = "Expanded Relation"
            };
        }

        foreach (var tableField in tableFields.Take(1))
        {
            itemData[tableField.Name] = new[]
            {
                new Dictionary<string, object?>
                {
                    ["id"] = Guid.NewGuid().ToString(),
                    ["created"] = DateTimeOffset.UtcNow,
                    ["updated"] = DateTimeOffset.UtcNow,
                    ["name"] = "child-row-1"
                }
            };
        }

        var payload = new
        {
            page = 1,
            perPage = 20,
            totalItems = 1,
            totalPages = 1,
            items = new[]
            {
                new
                {
                    id = Guid.NewGuid().ToString(),
                    collectionId = collection.Id,
                    collectionSlug = collection.Slug,
                    data = itemData,
                    ownerId = "USER_ID",
                    created = DateTimeOffset.UtcNow,
                    updated = DateTimeOffset.UtcNow
                }
            }
        };

        return JsonSerializer.Serialize(payload, JsonOptions);
    }

    private static string BuildCreateRequestExample(string collectionSlug, bool useGraph)
    {
        return useGraph
            ? $"POST /api/records/{collectionSlug}/graph"
            : $"POST /api/records/{collectionSlug}";
    }

    private static string BuildUpdateRequestExample(string collectionSlug, bool useGraph)
    {
        return useGraph
            ? $"PUT /api/records/{collectionSlug}/00000000-0000-0000-0000-000000000001/graph"
            : $"PUT /api/records/{collectionSlug}/00000000-0000-0000-0000-000000000001";
    }

    private static string BuildCreateOrUpdateResponseExample(string collectionSlug)
    {
        var payload = new
        {
            id = Guid.NewGuid().ToString(),
            collectionId = Guid.NewGuid().ToString(),
            collectionSlug,
            data = new Dictionary<string, object?>
            {
                ["name"] = "示例名称"
            },
            ownerId = "USER_ID",
            created = DateTimeOffset.UtcNow,
            updated = DateTimeOffset.UtcNow
        };

        return JsonSerializer.Serialize(payload, JsonOptions);
    }

    private async Task<List<ChildPreviewDefinition>> BuildChildDefinitionsAsync(List<Field> tableFields, CancellationToken cancellationToken)
    {
        var children = new List<ChildPreviewDefinition>();
        foreach (var field in tableFields)
        {
            var config = ParseTableConfig(field.Config);
            var childName = ResolveChildName(field.Name, config);
            if (string.IsNullOrWhiteSpace(childName))
                continue;

            var childFields = await ResolveChildFieldsAsync(config, cancellationToken);
            children.Add(new ChildPreviewDefinition(
                field.Name,
                childName,
                config.RelatedCollectionSlug,
                config.ParentKey,
                config.ChildKey,
                childFields));
        }

        return children;
    }

    private async Task<List<Field>> ResolveChildFieldsAsync(TableFieldConfigDto config, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(config.RelatedCollectionSlug))
            return [];

        var related = await db.Collections
            .Include(c => c.Fields)
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Slug == config.RelatedCollectionSlug, cancellationToken);

        if (related is null)
            return [];

        var selected = config.SelectedFields
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Select(s => s.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var fields = related.Fields
            .Where(f => !f.IsSystem && f.Type != FieldType.Table)
            .OrderBy(f => f.DisplayOrder)
            .ToList();

        if (selected.Count > 0)
        {
            fields = fields.Where(f => selected.Contains(f.Name, StringComparer.OrdinalIgnoreCase)).ToList();
        }

        return fields;
    }

    private static object BuildBodyExample(List<Field> fields, List<ChildPreviewDefinition> childDefinitions, bool includeChildren)
    {
        var data = new Dictionary<string, object?>();
        foreach (var field in fields.Where(f => f.Type != FieldType.Table))
        {
            if (ShouldOmitFromExample(field.Type))
                continue;

            data[field.Name] = BuildExampleValue(field);
        }

        if (!includeChildren)
            return new { data };

        var children = new Dictionary<string, object?>();
        foreach (var child in childDefinitions)
        {
            var row = new Dictionary<string, object?>();
            foreach (var field in child.Fields)
            {
                if (ShouldOmitFromExample(field.Type))
                    continue;

                row[field.Name] = BuildExampleValue(field);
            }

            children[child.ChildName] = new[] { row };
        }

        return new { data, children };
    }

    private static IEnumerable<string> BuildFieldNotes(List<Field> fields)
    {
        var omitted = fields
            .Where(f => ShouldOmitFromExample(f.Type))
            .Select(f => f.Name)
            .ToList();

        if (omitted.Count > 0)
            yield return $"以下字段未放入示例 JSON，通常由系统生成或运行时计算：{string.Join(", ", omitted)}。";

        var required = fields
            .Where(f => f.IsRequired && f.Type != FieldType.Table)
            .Select(f => f.Name)
            .ToList();

        if (required.Count > 0)
            yield return $"主表必填字段：{string.Join(", ", required)}。";
    }

    private static IEnumerable<string> BuildChildNotes(List<ChildPreviewDefinition> children)
    {
        foreach (var child in children)
        {
            yield return $"Table 字段 {child.TableFieldName} 复用实体表 pb_{NormalizeName(child.RelatedCollectionSlug ?? child.ChildName, "collection")}，关联键 {child.ChildKey} -> 主表 {child.ParentKey}。";

            var required = child.Fields.Where(f => f.IsRequired).Select(f => f.Name).ToList();
            if (required.Count > 0)
                yield return $"子表 {child.ChildName} 必填字段：{string.Join(", ", required)}。";
        }
    }

    private static object? BuildExampleValue(Field field)
    {
        var config = field.Config.ValueKind == JsonValueKind.Object ? field.Config : default;
        return field.Type switch
        {
            FieldType.Text => field.Name switch
            {
                var name when name.Contains("code", StringComparison.OrdinalIgnoreCase) => "ORD-001",
                var name when name.Contains("name", StringComparison.OrdinalIgnoreCase) => "示例名称",
                _ => field.Label?.Trim() ?? field.Name
            },
            FieldType.Email => "demo@example.com",
            FieldType.Url => "https://example.com",
            FieldType.Number => 1,
            FieldType.Checkbox => true,
            FieldType.Date => "2026-03-31",
            FieldType.DateTime => "2026-03-31T10:00:00Z",
            FieldType.Select => ExtractFirstSelectOption(config) ?? "option-1",
            FieldType.Relation => "RELATED_RECORD_ID",
            FieldType.User => "USER_ID",
            FieldType.File => new[] { "uploaded-file.pdf" },
            FieldType.Avatar => "avatar.png",
            FieldType.Textarea => "这里填写较长文本内容。",
            FieldType.Json => new Dictionary<string, object?> { ["key"] = "value" },
            FieldType.Lookup => null,
            FieldType.Formula => null,
            FieldType.AutoIncrement => null,
            _ => field.Name
        };
    }

    private static bool ShouldOmitFromExample(FieldType type)
    {
        return type is FieldType.AutoIncrement or FieldType.Formula or FieldType.Lookup;
    }

    private static string? ExtractFirstSelectOption(JsonElement config)
    {
        if (config.ValueKind != JsonValueKind.Object)
            return null;

        if (!config.TryGetProperty("values", out var values) || values.ValueKind != JsonValueKind.Array)
            return null;

        foreach (var item in values.EnumerateArray())
        {
            if (item.ValueKind == JsonValueKind.String)
                return item.GetString();
        }

        return null;
    }

    private static TableFieldConfigDto ParseTableConfig(JsonElement config)
    {
        if (config.ValueKind != JsonValueKind.Object)
            return new TableFieldConfigDto();

        try
        {
            var selectedFields = new List<string>();
            if (config.TryGetProperty("selectedFields", out var selectedFieldsProp) && selectedFieldsProp.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in selectedFieldsProp.EnumerateArray())
                {
                    if (item.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(item.GetString()))
                        selectedFields.Add(item.GetString()!);
                }
            }

            return new TableFieldConfigDto
            {
                RelatedCollectionSlug = config.TryGetProperty("relatedCollectionSlug", out var slugProp)
                    ? slugProp.GetString() ?? string.Empty
                    : string.Empty,
                ChildTableName = config.TryGetProperty("childTableName", out var childTableProp)
                    ? childTableProp.GetString() ?? string.Empty
                    : string.Empty,
                ParentKey = config.TryGetProperty("parentKey", out var parentKeyProp)
                    ? parentKeyProp.GetString() ?? "Id"
                    : "Id",
                ChildKey = config.TryGetProperty("childKey", out var childKeyProp)
                    ? childKeyProp.GetString() ?? "ParentId"
                    : "ParentId",
                SelectedFields = selectedFields
            };
        }
        catch
        {
            return new TableFieldConfigDto();
        }
    }

    private static string ResolveChildName(string fieldName, TableFieldConfigDto config)
    {
        if (!string.IsNullOrWhiteSpace(config.ChildTableName))
            return config.ChildTableName.Trim();
        if (!string.IsNullOrWhiteSpace(config.RelatedCollectionSlug))
            return config.RelatedCollectionSlug.Trim();
        return fieldName.Trim();
    }

    private static string NormalizeName(string value, string fallback)
    {
        var normalized = new string(value.ToLowerInvariant().Select(ch => char.IsLetterOrDigit(ch) || ch == '_' ? ch : '_').ToArray()).Trim('_');
        return string.IsNullOrWhiteSpace(normalized) ? fallback : normalized;
    }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    private sealed class TableFieldConfigDto
    {
        public string RelatedCollectionSlug { get; init; } = string.Empty;
        public string ChildTableName { get; init; } = string.Empty;
        public string ParentKey { get; init; } = "Id";
        public string ChildKey { get; init; } = "ParentId";
        public List<string> SelectedFields { get; init; } = [];
    }

    private sealed record ChildPreviewDefinition(
        string TableFieldName,
        string ChildName,
        string? RelatedCollectionSlug,
        string ParentKey,
        string ChildKey,
        List<Field> Fields);
}