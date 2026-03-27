using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PocketbaseNet.Api.Contracts;
using PocketbaseNet.Api.Infrastructure.Services;

namespace PocketbaseNet.Api.Controllers;

[ApiController]
[Authorize(Roles = "Admin")]
[Route("api/collections/{collectionId}/fields")]
public class FieldsController(FieldService fieldService) : ControllerBase
{
    /// <summary>
    /// Get all fields for a collection
    /// </summary>
    [HttpGet]
    [AllowAnonymous]
    public async Task<ActionResult<List<FieldResponse>>> ListFields(Guid collectionId)
    {
        try
        {
            var fields = await fieldService.GetFieldsAsync(collectionId);
            return Ok(fields);
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    /// <summary>
    /// Get a single field
    /// </summary>
    [HttpGet("{fieldId:guid}")]
    [AllowAnonymous]
    public async Task<ActionResult<FieldResponse>> GetField(Guid collectionId, Guid fieldId)
    {
        try
        {
            var field = await fieldService.GetFieldAsync(fieldId);
            if (field == null)
                return NotFound(new { message = "Field not found" });

            if (field.CollectionDefinitionId != collectionId)
                return BadRequest(new { message = "Field does not belong to this collection" });

            return Ok(field);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    /// <summary>
    /// Create a new field
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<FieldResponse>> CreateField(Guid collectionId, [FromBody] FieldCreateRequest request)
    {
        try
        {
            var field = await fieldService.CreateFieldAsync(collectionId, request);
            return CreatedAtAction(nameof(GetField), new { collectionId, fieldId = field.Id }, field);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    /// <summary>
    /// Update a field
    /// </summary>
    [HttpPut("{fieldId:guid}")]
    public async Task<ActionResult<FieldResponse>> UpdateField(Guid collectionId, Guid fieldId, [FromBody] FieldUpdateRequest request)
    {
        try
        {
            var field = await fieldService.GetFieldAsync(fieldId);
            if (field == null || field.CollectionDefinitionId != collectionId)
                return NotFound(new { message = "Field not found" });

            var updated = await fieldService.UpdateFieldAsync(fieldId, request);
            return Ok(updated);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    /// <summary>
    /// Delete a field
    /// </summary>
    [HttpDelete("{fieldId:guid}")]
    public async Task<ActionResult> DeleteField(Guid collectionId, Guid fieldId)
    {
        try
        {
            var field = await fieldService.GetFieldAsync(fieldId);
            if (field == null || field.CollectionDefinitionId != collectionId)
                return NotFound(new { message = "Field not found" });

            await fieldService.DeleteFieldAsync(fieldId);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    /// <summary>
    /// Reorder fields in a collection
    /// </summary>
    [HttpPost("reorder")]
    public async Task<ActionResult> ReorderFields(Guid collectionId, [FromBody] JsonElement requestBody)
    {
        try
        {
            var fieldOrders = ParseFieldOrders(requestBody);
            await fieldService.ReorderFieldsAsync(collectionId, fieldOrders);
            return Ok(new { message = "Fields reordered successfully" });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    private static Dictionary<Guid, int> ParseFieldOrders(JsonElement requestBody)
    {
        var fieldOrders = new Dictionary<Guid, int>();

        if (requestBody.ValueKind == JsonValueKind.Object && requestBody.TryGetProperty("fieldIds", out var fieldIdsElement) && fieldIdsElement.ValueKind == JsonValueKind.Array)
        {
            var index = 0;
            foreach (var item in fieldIdsElement.EnumerateArray())
            {
                if (item.ValueKind == JsonValueKind.String && Guid.TryParse(item.GetString(), out var fieldId))
                {
                    fieldOrders[fieldId] = index++;
                }
            }

            return fieldOrders;
        }

        if (requestBody.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in requestBody.EnumerateObject())
            {
                if (Guid.TryParse(property.Name, out var fieldId) && property.Value.ValueKind == JsonValueKind.Number && property.Value.TryGetInt32(out var order))
                {
                    fieldOrders[fieldId] = order;
                }
            }
        }

        if (fieldOrders.Count == 0)
        {
            throw new InvalidOperationException("Invalid reorder payload");
        }

        return fieldOrders;
    }

    /// <summary>
    /// Get all available field type definitions
    /// </summary>
    [HttpGet("types")]
    [AllowAnonymous]
    public ActionResult<List<FieldTypeDefinition>> GetFieldTypes()
    {
        var types = fieldService.GetFieldTypeDefinitions();
        return Ok(types);
    }
}
