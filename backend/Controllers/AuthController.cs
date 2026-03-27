using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using PocketbaseNet.Api.Contracts;
using PocketbaseNet.Api.Domain.Entities;
using PocketbaseNet.Api.Infrastructure.Auth;

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
            return Conflict(new { message = "Email already exists" });
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
            return BadRequest(new { message = "Register failed", errors = createResult.Errors.Select(e => e.Description) });
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
            return Unauthorized(new { message = "Invalid credentials" });
        }

        var check = await signInManager.CheckPasswordSignInAsync(user, request.Password, true);
        if (!check.Succeeded)
        {
            return Unauthorized(new { message = "Invalid credentials" });
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
            return Unauthorized();
        }

        var user = await userManager.FindByEmailAsync(email);
        if (user is null)
        {
            return Unauthorized();
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
            return Unauthorized();
        }

        var user = await userManager.FindByEmailAsync(email);
        if (user is null)
        {
            return Unauthorized();
        }

        var roles = await userManager.GetRolesAsync(user);
        var token = await jwtTokenService.CreateAccessTokenAsync(user);
        return Ok(new AuthResponse(token, user.Id, user.Email ?? string.Empty, user.DisplayName, roles.ToArray()));
    }
}
