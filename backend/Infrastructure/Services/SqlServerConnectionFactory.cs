using Microsoft.Data.SqlClient;

namespace PocketbaseNet.Api.Infrastructure.Services;

public class SqlServerConnectionFactory(IConfiguration configuration)
{
    public bool IsSqlServerConfigured()
    {
        var provider = configuration["DatabaseProvider"] ?? "Sqlite";
        return string.Equals(provider, "SqlServer", StringComparison.OrdinalIgnoreCase);
    }

    public async Task<SqlConnection> CreateOpenConnectionAsync(CancellationToken cancellationToken = default)
    {
        if (!IsSqlServerConfigured())
            throw new InvalidOperationException("当前数据库提供程序不是 SqlServer，无法使用实体表发布能力。");

        var connStr = configuration.GetConnectionString("DefaultConnection");
        if (string.IsNullOrWhiteSpace(connStr))
            throw new InvalidOperationException("未配置 SQL Server 连接字符串 DefaultConnection。");

        var connection = new SqlConnection(connStr);
        await connection.OpenAsync(cancellationToken);
        return connection;
    }
}
