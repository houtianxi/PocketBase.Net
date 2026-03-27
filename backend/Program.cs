using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using PocketbaseNet.Api.Domain.Entities;
using PocketbaseNet.Api.Infrastructure;
using PocketbaseNet.Api.Infrastructure.Auth;
using PocketbaseNet.Api.Infrastructure.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection("Jwt"));

builder.Services.AddDbContext<AppDbContext>(options =>
{
    var provider = builder.Configuration["DatabaseProvider"] ?? "Sqlite";
    Console.WriteLine($"🔍 DatabaseProvider configured as: {provider}");
    
    if (string.Equals(provider, "SqlServer", StringComparison.OrdinalIgnoreCase))
    {
        var sqlServerConnection = builder.Configuration.GetConnectionString("DefaultConnection")
            ?? "Server=(localdb)\\MSSQLLocalDB;Database=PocketbaseNet;Trusted_Connection=True;TrustServerCertificate=True;MultipleActiveResultSets=true";
        Console.WriteLine($"✅ Using SQL Server: {sqlServerConnection}");
        options.UseSqlServer(sqlServerConnection);
        return;
    }
    else
    { 
        // Local quickstart: use SQLite when SQL Server is unavailable.
        var sqliteConnection = builder.Configuration.GetConnectionString("SqliteConnection")
            ?? "Data Source=pocketbase.net.db";
        Console.WriteLine($"⚠️  Using SQLite: {sqliteConnection}");
        options.UseSqlite(sqliteConnection);
    }
});

builder.Services.AddIdentityCore<AppUser>(options =>
{
    options.User.RequireUniqueEmail = true;
    options.Password.RequireDigit = true;
    options.Password.RequireUppercase = false;
    options.Password.RequireLowercase = true;
    options.Password.RequireNonAlphanumeric = false;
    options.Password.RequiredLength = 8;
})
    .AddRoles<IdentityRole>()
    .AddEntityFrameworkStores<AppDbContext>()
    .AddSignInManager()
    .AddDefaultTokenProviders();

builder.Services.AddScoped<JwtTokenService>();
builder.Services.AddScoped<CurrentUserAccessor>();
builder.Services.AddScoped<RuleEvaluator>();
builder.Services.AddScoped<FieldService>();
builder.Services.AddScoped<IFileStorageService, LocalFileStorageService>();
builder.Services.AddHttpContextAccessor();

var jwtSection = builder.Configuration.GetSection("Jwt");
var jwtIssuer = jwtSection["Issuer"] ?? "PocketbaseNet.Api";
var jwtAudience = jwtSection["Audience"] ?? "PocketbaseNet.Client";
var jwtKey = jwtSection["Key"] ?? "CHANGE_THIS_TO_A_STRONG_AND_LONG_SECRET_KEY_1234567890";

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };
    });

builder.Services.AddAuthorization();

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        var configuredOrigins = builder.Configuration
            .GetSection("Cors:AllowedOrigins")
            .Get<string[]>() ?? [];

        policy.SetIsOriginAllowed(origin =>
            {
                if (string.IsNullOrWhiteSpace(origin))
                {
                    return false;
                }

                if (configuredOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase))
                {
                    return true;
                }

                if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri))
                {
                    return false;
                }

                var isLocalHost =
                    string.Equals(uri.Host, "localhost", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(uri.Host, "127.0.0.1", StringComparison.OrdinalIgnoreCase);

                var isHttpScheme =
                    string.Equals(uri.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase);

                return isLocalHost && isHttpScheme;
            })
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.EnsureCreatedAsync();

    if (db.Database.IsSqlServer())
    {
        await db.Database.ExecuteSqlRawAsync(@"
            IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Records_AspNetUsers_OwnerId')
                ALTER TABLE [Records] DROP CONSTRAINT [FK_Records_AspNetUsers_OwnerId];
            IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Records_OwnerId' AND object_id = OBJECT_ID('[Records]'))
                DROP INDEX [IX_Records_OwnerId] ON [Records];
        ");
    }

    var userManager = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
    var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();

    foreach (var role in new[] { "Admin", "User" })
    {
        if (!await roleManager.RoleExistsAsync(role))
        {
            await roleManager.CreateAsync(new IdentityRole(role));
        }
    }

    var adminEmail = builder.Configuration["Seed:AdminEmail"] ?? "admin@pocketbase.net";
    var adminPassword = builder.Configuration["Seed:AdminPassword"] ?? "Admin1234";
    var existing = await userManager.FindByEmailAsync(adminEmail);
    if (existing is null)
    {
        var admin = new AppUser
        {
            UserName = adminEmail,
            Email = adminEmail,
            DisplayName = "System Admin",
            EmailConfirmed = true
        };

        var createResult = await userManager.CreateAsync(admin, adminPassword);
        if (createResult.Succeeded)
        {
            await userManager.AddToRoleAsync(admin, "Admin");
        }
    }
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapGet("/api/health", () => Results.Ok(new { status = "ok", service = "PocketbaseNet.Api" }));

app.Run();
