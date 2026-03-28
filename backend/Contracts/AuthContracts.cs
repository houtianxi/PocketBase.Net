namespace PocketbaseNet.Api.Contracts;

public record RegisterRequest(string Email, string Password, string DisplayName);
public record LoginRequest(string Email, string Password);
public record AuthResponse(string AccessToken, string UserId, string Email, string DisplayName, string[] Roles);
public record ChangePasswordRequest(string OldPassword, string NewPassword);
