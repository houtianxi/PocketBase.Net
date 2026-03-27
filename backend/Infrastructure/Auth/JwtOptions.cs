namespace PocketbaseNet.Api.Infrastructure.Auth;

public class JwtOptions
{
    public string Issuer { get; set; } = "PocketbaseNet.Api";
    public string Audience { get; set; } = "PocketbaseNet.Client";
    public string Key { get; set; } = string.Empty;
    public int AccessTokenMinutes { get; set; } = 120;
}
