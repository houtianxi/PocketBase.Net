using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PocketbaseNet.Api.Infrastructure;

namespace PocketbaseNet.Api.Controllers;

[ApiController]
[Authorize(Roles = "Admin")]
[Route("api/logs")]
public class LogsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<object>> List(
        [FromQuery] int page = 1,
        [FromQuery] int perPage = 50,
        [FromQuery] string? search = null,
        [FromQuery] string? action = null,
        [FromQuery] string? level = null,
        [FromQuery] string? sort = "-created")
    {
        page = Math.Max(1, page);
        perPage = Math.Clamp(perPage, 1, 200);

        var query = db.AuditLogs.AsQueryable();

        // Filter by search
        if (!string.IsNullOrWhiteSpace(search))
        {
            var searchLower = search.ToLower();
            query = query.Where(x =>
                x.Action.ToLower().Contains(searchLower) ||
                x.ResourceType.ToLower().Contains(searchLower) ||
                (x.ActorId != null && x.ActorId.ToLower().Contains(searchLower)));
        }

        // Filter by action
        if (!string.IsNullOrWhiteSpace(action))
        {
            query = query.Where(x => x.Action == action);
        }

        var total = await query.CountAsync();

        // Sort
        query = sort == "-created"
            ? query.OrderByDescending(x => x.CreatedAt)
            : query.OrderBy(x => x.CreatedAt);

        var items = await query
            .Skip((page - 1) * perPage)
            .Take(perPage)
            .Select(x => new
            {
                x.Id,
                x.Action,
                x.ResourceType,
                x.ResourceId,
                x.ActorId,
                x.CreatedAt,
                x.DetailJson
            })
            .ToListAsync();

        return Ok(new
        {
            page,
            perPage,
            totalItems = total,
            totalPages = (total + perPage - 1) / perPage,
            items
        });
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(string id)
    {
        var log = await db.AuditLogs.FindAsync(id);
        if (log == null)
            return NotFound();

        db.AuditLogs.Remove(log);
        await db.SaveChangesAsync();
        return Ok();
    }

    [HttpDelete]
    public async Task<ActionResult> DeleteAll()
    {
        await db.AuditLogs.ExecuteDeleteAsync();
        return Ok();
    }

    [HttpPost("delete-older-than")]
    public async Task<ActionResult> DeleteOlderThan([FromBody] DeleteOlderThanRequest request)
    {
        var cutoffDate = DateTimeOffset.UtcNow.AddDays(-request.DaysOld);
        var deleted = await db.AuditLogs
            .Where(x => x.CreatedAt < cutoffDate)
            .ExecuteDeleteAsync();

        return Ok(new { deleted });
    }

    public record DeleteOlderThanRequest(int DaysOld);
}
