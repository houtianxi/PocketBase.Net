namespace PocketbaseNet.Api.Infrastructure.Exceptions;

/// <summary>
/// Base exception for API errors with standard error responses
/// </summary>
public class ApiException : Exception
{
    public int StatusCode { get; set; }
    public Dictionary<string, object?>? ErrorData { get; set; }

    public ApiException(string message, int statusCode = 400, Dictionary<string, object?>? data = null)
        : base(message)
    {
        StatusCode = statusCode;
        ErrorData = data;
    }
}

/// <summary>
/// Exception for validation errors
/// </summary>
public class ValidationException : ApiException
{
    public ValidationException(string message, Dictionary<string, List<string>>? fieldErrors = null)
        : base(message, 400, fieldErrors != null ? new() { { "fields", fieldErrors } } : null)
    {
    }

    public ValidationException(Dictionary<string, List<string>> fieldErrors)
        : base("Validation failed", 400, new() { { "fields", fieldErrors } })
    {
    }
}

/// <summary>
/// Exception for not found errors
/// </summary>
public class NotFoundException : ApiException
{
    public NotFoundException(string message)
        : base(message, 404)
    {
    }
}

/// <summary>
/// Exception for forbidden/unauthorized access
/// </summary>
public class ForbiddenException : ApiException
{
    public ForbiddenException(string message = "Access denied")
        : base(message, 403)
    {
    }
}

/// <summary>
/// Exception for conflict/duplicate errors
/// </summary>
public class ConflictException : ApiException
{
    public ConflictException(string message)
        : base(message, 409)
    {
    }
}

/// <summary>
/// Exception for internal server errors
/// </summary>
public class InternalServerException : ApiException
{
    public InternalServerException(string message = "Internal server error")
        : base(message, 500)
    {
    }
}
