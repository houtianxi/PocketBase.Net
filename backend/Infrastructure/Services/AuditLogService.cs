using PocketbaseNet.Api.Domain.Entities;

namespace PocketbaseNet.Api.Infrastructure.Services;

public class AuditLogService(AppDbContext db, ApplicationSettingsService settingsService)
{
    private bool? _enabledCache;

    public async Task<bool> IsEnabledAsync(CancellationToken cancellationToken = default)
    {
        if (_enabledCache.HasValue)
            return _enabledCache.Value;

        _enabledCache = await settingsService.GetBoolConfigAsync("enableAuditLog", true, cancellationToken);
        return _enabledCache.Value;
    }

    public async Task<bool> AddAsync(AuditLog log, CancellationToken cancellationToken = default)
    {
        if (!await IsEnabledAsync(cancellationToken))
            return false;

        db.AuditLogs.Add(log);
        return true;
    }
}
