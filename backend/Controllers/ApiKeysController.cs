using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PocketbaseNet.Api.Contracts;
using PocketbaseNet.Api.Domain.Entities;
using PocketbaseNet.Api.Infrastructure;
using PocketbaseNet.Api.Infrastructure.Auth;
using PocketbaseNet.Api.Infrastructure.Exceptions;

namespace PocketbaseNet.Api.Controllers;

[ApiController]
[Route("api/keys")]
[Authorize(Roles = "Admin")]
public class ApiKeysController(AppDbContext db) : ControllerBase
{
    private static readonly List<string> AllScopes = ["list", "view", "create", "update", "delete"];

    // ── List all keys (secrets are never returned) ─────────────────────────
    [HttpGet]
    public async Task<ActionResult<IEnumerable<ApiKeyResponse>>> List()
    {
        var keys = await db.ApiKeys
            .OrderByDescending(k => k.CreatedAt)
            .ToListAsync();

        return Ok(keys.Select(ToResponse));
    }

    // ── Get single key ──────────────────────────────────────────────────────
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ApiKeyResponse>> Get(Guid id)
    {
        var key = await db.ApiKeys.FirstOrDefaultAsync(k => k.Id == id);
        if (key is null) throw new NotFoundException("API key not found");
        return Ok(ToResponse(key));
    }

    // ── Create key — raw key returned ONCE ─────────────────────────────────
    [HttpPost]
    public async Task<ActionResult<ApiKeyCreatedResponse>> Create([FromBody] ApiKeyCreateRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { message = "Name is required" });
        if (string.IsNullOrWhiteSpace(request.OwnerName))
            return BadRequest(new { message = "OwnerName is required" });

        var scopes = NormalizeScopes(request.Scopes);
        var allowedCollections = request.AllowedCollections?.Where(s => !string.IsNullOrWhiteSpace(s))
            .Select(s => s.Trim().ToLowerInvariant()).Distinct().ToList() ?? [];

        var (rawKey, prefix, hash) = ApiKeyAuthenticationHandler.GenerateKey();

        var apiKey = new AppApiKey
        {
            Name = request.Name.Trim(),
            Description = request.Description?.Trim(),
            OwnerName = request.OwnerName.Trim(),
            OwnerEmail = request.OwnerEmail?.Trim(),
            KeyPrefix = prefix,
            SecretHash = hash,
            Scopes = string.Join(",", scopes),
            AllowedCollectionsJson = JsonSerializer.Serialize(allowedCollections),
            IsActive = true,
            ExpiresAt = request.ExpiresAt,
            CreatedByUserId = User.FindFirstValue(ClaimTypes.NameIdentifier),
            UpdatedAt = DateTimeOffset.UtcNow,
        };

        db.ApiKeys.Add(apiKey);
        await db.SaveChangesAsync();

        return Ok(new ApiKeyCreatedResponse(
            apiKey.Id,
            apiKey.Name,
            "pbn_" + prefix,
            rawKey,
            scopes,
            allowedCollections,
            apiKey.IsActive,
            apiKey.ExpiresAt,
            apiKey.CreatedAt));
    }

    // ── Update key metadata / scopes / collections ─────────────────────────
    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ApiKeyResponse>> Update(Guid id, [FromBody] ApiKeyUpdateRequest request)
    {
        var key = await db.ApiKeys.FirstOrDefaultAsync(k => k.Id == id);
        if (key is null) throw new NotFoundException("API key not found");

        var scopes = NormalizeScopes(request.Scopes);
        var allowedCollections = request.AllowedCollections?.Where(s => !string.IsNullOrWhiteSpace(s))
            .Select(s => s.Trim().ToLowerInvariant()).Distinct().ToList() ?? [];

        key.Name = request.Name.Trim();
        key.Description = request.Description?.Trim();
        key.OwnerName = request.OwnerName.Trim();
        key.OwnerEmail = request.OwnerEmail?.Trim();
        key.Scopes = string.Join(",", scopes);
        key.AllowedCollectionsJson = JsonSerializer.Serialize(allowedCollections);
        key.IsActive = request.IsActive;
        key.ExpiresAt = request.ExpiresAt;
        key.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync();
        return Ok(ToResponse(key));
    }

    // ── Toggle active/inactive ──────────────────────────────────────────────
    [HttpPost("{id:guid}/toggle")]
    public async Task<ActionResult<ApiKeyResponse>> Toggle(Guid id)
    {
        var key = await db.ApiKeys.FirstOrDefaultAsync(k => k.Id == id);
        if (key is null) throw new NotFoundException("API key not found");

        key.IsActive = !key.IsActive;
        key.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
        return Ok(ToResponse(key));
    }

    // ── Revoke / delete ─────────────────────────────────────────────────────
    [HttpDelete("{id:guid}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        var key = await db.ApiKeys.FirstOrDefaultAsync(k => k.Id == id);
        if (key is null) throw new NotFoundException("API key not found");

        db.ApiKeys.Remove(key);
        await db.SaveChangesAsync();
        return Ok(new { message = "API key revoked" });
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private static List<string> NormalizeScopes(string? scopesInput)
    {
        if (string.IsNullOrWhiteSpace(scopesInput))
            return AllScopes;

        var requested = scopesInput
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(s => s.ToLowerInvariant())
            .Where(AllScopes.Contains)
            .Distinct()
            .ToList();

        return requested.Count == 0 ? AllScopes : requested;
    }

    private static ApiKeyResponse ToResponse(AppApiKey key)
    {
        var scopes = key.Scopes?.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList() ?? AllScopes;
        List<string> collections;
        try { collections = JsonSerializer.Deserialize<List<string>>(key.AllowedCollectionsJson ?? "[]") ?? []; }
        catch { collections = []; }

        return new ApiKeyResponse(
            key.Id,
            key.Name,
            key.OwnerName,
            key.OwnerEmail,
            key.Description,
            "pbn_" + key.KeyPrefix + "...",   // show prefix only — never full key
            scopes,
            collections,
            key.IsActive,
            key.ExpiresAt,
            key.LastUsedAt,
            key.CreatedByUserId,
            key.CreatedAt,
            key.UpdatedAt);
    }
}
