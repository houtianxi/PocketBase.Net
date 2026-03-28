using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using PocketbaseNet.Api.Contracts;
using PocketbaseNet.Api.Infrastructure.Exceptions;

namespace PocketbaseNet.Api.Infrastructure.Middleware;

/// <summary>
/// Global exception handling middleware that converts all exceptions to standard ErrorResponse
/// </summary>
public class ErrorHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ErrorHandlingMiddleware> _logger;

    public ErrorHandlingMiddleware(RequestDelegate next, ILogger<ErrorHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            await HandleExceptionAsync(context, ex);
        }
    }

    private static Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        context.Response.ContentType = "application/json";

        ErrorResponse response;
        int statusCode;

        // Handle custom API exceptions
        if (exception is ApiException apiException)
        {
            statusCode = apiException.StatusCode;
            response = new ErrorResponse
            {
                Code = statusCode,
                Message = apiException.Message,
                Data = apiException.ErrorData
            };
        }
        // Handle validation errors
        else if (exception is ArgumentException argEx)
        {
            statusCode = StatusCodes.Status400BadRequest;
            response = new ErrorResponse
            {
                Code = statusCode,
                Message = argEx.Message
            };
        }
        // Handle unauthorized/forbidden
        else if (exception is UnauthorizedAccessException)
        {
            statusCode = StatusCodes.Status403Forbidden;
            response = new ErrorResponse
            {
                Code = statusCode,
                Message = "Access denied"
            };
        }
        // Default to 500 for unhandled exceptions
        else
        {
            statusCode = StatusCodes.Status500InternalServerError;
            response = new ErrorResponse
            {
                Code = statusCode,
                Message = "Internal server error"
            };

            // Log unhandled exception
            System.Diagnostics.Debug.WriteLine($"Unhandled exception: {exception}");
        }

        context.Response.StatusCode = statusCode;
        return context.Response.WriteAsJsonAsync(response);
    }
}

public static class ErrorHandlingMiddlewareExtensions
{
    public static IApplicationBuilder UseErrorHandling(this IApplicationBuilder builder)
    {
        return builder.UseMiddleware<ErrorHandlingMiddleware>();
    }
}
