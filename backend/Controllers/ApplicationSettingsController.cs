using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PocketbaseNet.Api.Contracts;
using PocketbaseNet.Api.Infrastructure.Services;

namespace PocketbaseNet.Api.Controllers;

[ApiController]
[Route("api/application-settings")]
public class ApplicationSettingsController(ApplicationSettingsService settingsService) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet("public")]
    public async Task<ActionResult<ApplicationSettingsResponse>> GetPublic(CancellationToken cancellationToken)
    {
        var settings = await settingsService.GetAsync(cancellationToken);
        return Ok(settings);
    }

    [Authorize(Roles = "Admin")]
    [HttpGet]
    public async Task<ActionResult<ApplicationSettingsResponse>> Get(CancellationToken cancellationToken)
    {
        var settings = await settingsService.GetAsync(cancellationToken);
        return Ok(settings);
    }

    [Authorize(Roles = "Admin")]
    [HttpPut]
    public async Task<ActionResult<ApplicationSettingsResponse>> Update(
        [FromBody] UpdateApplicationSettingsRequest request,
        CancellationToken cancellationToken)
    {
        var actorId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var settings = await settingsService.UpdateAsync(request, actorId, cancellationToken);
        return Ok(settings);
    }

    [Authorize(Roles = "Admin")]
    [HttpGet("audit-logs")]
    public async Task<ActionResult<IReadOnlyList<ApplicationSettingsAuditItemResponse>>> GetAuditLogs(
        [FromQuery] int take = 50,
        CancellationToken cancellationToken = default)
    {
        var logs = await settingsService.GetAuditLogsAsync(take, cancellationToken);
        return Ok(logs);
    }
}
