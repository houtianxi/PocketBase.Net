using System.Security.Claims;

namespace PocketbaseNet.Api.Infrastructure.Auth;

public class CurrentUserAccessor(IHttpContextAccessor httpContextAccessor)
{
    public string? UserId => httpContextAccessor.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier);
    public string? Email => httpContextAccessor.HttpContext?.User.FindFirstValue(ClaimTypes.Email);
    public bool IsAuthenticated => httpContextAccessor.HttpContext?.User.Identity?.IsAuthenticated ?? false;
    public bool IsAdmin => httpContextAccessor.HttpContext?.User.IsInRole("Admin") ?? false;
}
