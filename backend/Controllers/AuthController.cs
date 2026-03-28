using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using PocketbaseNet.Api.Contracts;
using PocketbaseNet.Api.Domain.Entities;
using PocketbaseNet.Api.Infrastructure.Auth;
using PocketbaseNet.Api.Infrastructure.Exceptions;

namespace PocketbaseNet.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(
    UserManager<AppUser> userManager,
    SignInManager<AppUser> signInManager,
    JwtTokenService jwtTokenService) : ControllerBase
{
    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest request)
    {
        var exists = await userManager.FindByEmailAsync(request.Email);
        if (exists is not null)
        {
            throw new ConflictException("Email already registered");
        }

        var user = new AppUser
        {
            UserName = request.Email,
            Email = request.Email,
            DisplayName = request.DisplayName,
            EmailConfirmed = true
        };

        var createResult = await userManager.CreateAsync(user, request.Password);
        if (!createResult.Succeeded)
        {
            throw new ValidationException("Registration failed", new()
            {
                { "password", createResult.Errors.Select(e => e.Description).ToList() }
            });
        }

        await userManager.AddToRoleAsync(user, "User");

        var token = await jwtTokenService.CreateAccessTokenAsync(user);
        return Ok(new AuthResponse(token, user.Id, user.Email ?? string.Empty, user.DisplayName, new[] { "User" }));
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request)
    {
        var user = await userManager.FindByEmailAsync(request.Email);
        if (user is null || !user.IsActive)
        {
            throw new ApiException("Invalid email or password", 401);
        }

        var check = await signInManager.CheckPasswordSignInAsync(user, request.Password, true);
        if (!check.Succeeded)
        {
            throw new ApiException("Invalid email or password", 401);
        }

        var roles = await userManager.GetRolesAsync(user);
        var token = await jwtTokenService.CreateAccessTokenAsync(user);
        return Ok(new AuthResponse(token, user.Id, user.Email ?? string.Empty, user.DisplayName, roles.ToArray()));
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<object>> Me()
    {
        var email = User.Claims.FirstOrDefault(c => c.Type == System.Security.Claims.ClaimTypes.Email)?.Value;
        if (string.IsNullOrWhiteSpace(email))
        {
            throw new ApiException("Unauthorized", 401);
        }

        var user = await userManager.FindByEmailAsync(email);
        if (user is null)
        {
            throw new ApiException("Unauthorized", 401);
        }

        var roles = await userManager.GetRolesAsync(user);
        return Ok(new
        {
            user.Id,
            user.Email,
            user.DisplayName,
            user.IsActive,
            roles
        });
    }

    [Authorize]
    [HttpPost("refresh")]
    public async Task<ActionResult<AuthResponse>> Refresh()
    {
        var email = User.Claims.FirstOrDefault(c => c.Type == System.Security.Claims.ClaimTypes.Email)?.Value;
        if (string.IsNullOrWhiteSpace(email))
        {
            throw new ApiException("Unauthorized", 401);
        }

        var user = await userManager.FindByEmailAsync(email);
        if (user is null)
        {
            throw new ApiException("Unauthorized", 401);
        }

        var roles = await userManager.GetRolesAsync(user);
        var token = await jwtTokenService.CreateAccessTokenAsync(user);
        return Ok(new AuthResponse(token, user.Id, user.Email ?? string.Empty, user.DisplayName, roles.ToArray()));
    }

    [Authorize]
    [HttpPost("change-password")]
    public async Task<ActionResult> ChangePassword(ChangePasswordRequest request)
    {
        var email = User.Claims.FirstOrDefault(c => c.Type == System.Security.Claims.ClaimTypes.Email)?.Value;
        if (string.IsNullOrWhiteSpace(email))
        {
            throw new ApiException("Unauthorized", 401);
        }

        var user = await userManager.FindByEmailAsync(email);
        if (user is null)
        {
            throw new ApiException("Unauthorized", 401);
        }

        // Verify old password
        var oldPwdCheck = await signInManager.CheckPasswordSignInAsync(user, request.OldPassword, false);
        if (!oldPwdCheck.Succeeded)
        {
            throw new ValidationException("Current password is incorrect", new()
            {
                { "oldPassword", new() { "Current password is incorrect" } }
            });
        }

        // Change password
        var changeResult = await userManager.ChangePasswordAsync(user, request.OldPassword, request.NewPassword);
        if (!changeResult.Succeeded)
        {
            throw new ValidationException("Password change failed", new()
            {
                { "password", changeResult.Errors.Select(e => e.Description).ToList() }
            });
        }

        return Ok(new { message = "Password changed successfully" });
    }
}
