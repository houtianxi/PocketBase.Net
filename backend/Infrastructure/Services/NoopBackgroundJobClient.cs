using Hangfire;
using Hangfire.Common;
using Hangfire.States;

namespace PocketbaseNet.Api.Infrastructure.Services;

public class NoopBackgroundJobClient : IBackgroundJobClient
{
    public string Create(Job job, IState state)
    {
        throw new InvalidOperationException("当前未启用 Hangfire。请将 DatabaseProvider 配置为 SqlServer 后再使用异步发布任务。");
    }

    public bool ChangeState(string jobId, IState state, string expectedState)
    {
        throw new InvalidOperationException("当前未启用 Hangfire。请将 DatabaseProvider 配置为 SqlServer 后再使用异步发布任务。");
    }
}
