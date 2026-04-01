using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PocketbaseNet.Api.Domain.Entities;
using PocketbaseNet.Api.Infrastructure;
using PocketbaseNet.Api.Infrastructure.Services;

namespace PocketbaseNet.Api.Controllers;

[ApiController]
[Authorize(Roles = "Admin")]
[Route("api/users")]
public class UsersController(UserManager<AppUser> userManager, AppDbContext db, AuditLogService auditLogService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<object>> List([FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = userManager.Users.OrderByDescending(x => x.CreatedAt);
        var total = await query.CountAsync();
        var pageUsers = await query.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();

        var items = new List<object>(pageUsers.Count);
        foreach (var user in pageUsers)
        {
            var roles = await userManager.GetRolesAsync(user);
            var role = roles.FirstOrDefault() ?? "User";
            items.Add(new
            {
                user.Id,
                user.Email,
                user.DisplayName,
                user.IsActive,
                Role = role,
                user.CreatedAt,
                user.UpdatedAt
            });
        }

        return Ok(new { page, pageSize, totalItems = total, items });
    }

    [HttpPost]
    public async Task<ActionResult> Create([FromBody] CreateUserRequest request)
    {
        var user = new AppUser
        {
            UserName = request.Email,
            Email = request.Email,
            DisplayName = request.DisplayName,
            IsActive = true,
            EmailConfirmed = true
        };

        var result = await userManager.CreateAsync(user, request.Password);
        if (!result.Succeeded)
        {
            return BadRequest(new { message = "Create failed", errors = result.Errors.Select(e => e.Description) });
        }

        await userManager.AddToRoleAsync(user, request.Role is "Admin" ? "Admin" : "User");

        await auditLogService.AddAsync(new AuditLog
        {
            ActorId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value,
            Action = "users.create",
            ResourceType = "user",
            ResourceId = user.Id,
            DetailJson = "{}"
        });
        await db.SaveChangesAsync();

        return Ok(new { user.Id, user.Email, user.DisplayName });
    }

    [HttpPut("{id}")]
    public async Task<ActionResult> Update(string id, [FromBody] UpdateUserRequest request)
    {
        var user = await userManager.FindByIdAsync(id);
        if (user is null)
        {
            return NotFound();
        }

        user.DisplayName = request.DisplayName;
        user.IsActive = request.IsActive;
        user.UpdatedAt = DateTimeOffset.UtcNow;

        if (!string.IsNullOrWhiteSpace(request.Password))
        {
            var token = await userManager.GeneratePasswordResetTokenAsync(user);
            var reset = await userManager.ResetPasswordAsync(user, token, request.Password);
            if (!reset.Succeeded)
            {
                return BadRequest(new { message = "Password update failed", errors = reset.Errors.Select(e => e.Description) });
            }
        }

        var update = await userManager.UpdateAsync(user);
        if (!update.Succeeded)
        {
            return BadRequest(new { message = "Update failed", errors = update.Errors.Select(e => e.Description) });
        }

        var roles = await userManager.GetRolesAsync(user);
        if (roles.Count > 0)
        {
            await userManager.RemoveFromRolesAsync(user, roles);
        }
        await userManager.AddToRoleAsync(user, request.Role is "Admin" ? "Admin" : "User");

        await auditLogService.AddAsync(new AuditLog
        {
            ActorId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value,
            Action = "users.update",
            ResourceType = "user",
            ResourceId = user.Id,
            DetailJson = "{}"
        });
        await db.SaveChangesAsync();

        return Ok();
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(string id)
    {
        var user = await userManager.FindByIdAsync(id);
        if (user is null)
        {
            return NotFound();
        }

        var result = await userManager.DeleteAsync(user);
        if (!result.Succeeded)
        {
            return BadRequest(new { message = "Delete failed", errors = result.Errors.Select(e => e.Description) });
        }

        await auditLogService.AddAsync(new AuditLog
        {
            ActorId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value,
            Action = "users.delete",
            ResourceType = "user",
            ResourceId = id,
            DetailJson = "{}"
        });
        await db.SaveChangesAsync();

        return Ok();
    }

    public record CreateUserRequest(string Email, string DisplayName, string Password, string Role = "User");
    public record UpdateUserRequest(string DisplayName, bool IsActive, string Role = "User", string? Password = null);
}
