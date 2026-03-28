using System.Collections.Concurrent;
using System.Threading.Channels;

namespace PocketbaseNet.Api.Infrastructure.Services;

/// <summary>
/// Simple in-memory pub/sub event system for real-time updates
/// </summary>
public class EventBus
{
    
    public class Event
    {
        public string Type { get; set; } = string.Empty;
        public string CollectionSlug { get; set; } = string.Empty;
        public string Action { get; set; } = string.Empty; // create, update, delete
        public string RecordId { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
        public Dictionary<string, object?>? Data { get; set; }
    }

    private readonly ConcurrentDictionary<string, List<Channel<Event>>> _subscribers = new();
    private readonly object _lockObj = new();

    /// <summary>
    /// Subscribe to events for a specific collection
    /// </summary>
    public Channel<Event> Subscribe(string collectionSlug)
    {
        var channel = Channel.CreateUnbounded<Event>();
        
        lock (_lockObj)
        {
            var key = collectionSlug.ToLowerInvariant();
            _subscribers.AddOrUpdate(key, 
                new List<Channel<Event>> { channel },
                (k, list) =>
                {
                    list.Add(channel);
                    return list;
                });
        }

        return channel;
    }

    /// <summary>
    /// Publish an event to all subscribers
    /// </summary>
    public async Task PublishAsync(Event evt)
    {
        var key = evt.CollectionSlug.ToLowerInvariant();
        
        if (_subscribers.TryGetValue(key, out var channels))
        {
            var tasks = new List<Task>();
            foreach (var channel in channels.ToList())
            {
                tasks.Add(channel.Writer.WriteAsync(evt).AsTask());
            }
            
            await Task.WhenAll(tasks).ConfigureAwait(false);
        }
    }

    /// <summary>
    /// Cleanup closed channels
    /// </summary>
    public void CleanupClosedChannels(string collectionSlug)
    {
        var key = collectionSlug.ToLowerInvariant();
        
        if (_subscribers.TryGetValue(key, out var channels))
        {
            lock (_lockObj)
            {
                var activeChannels = channels.Where(c => !c.Reader.Completion.IsCompleted).ToList();
                if (activeChannels.Count == 0)
                {
                    _subscribers.TryRemove(key, out _);
                }
                else if (activeChannels.Count < channels.Count)
                {
                    _subscribers[key] = activeChannels;
                }
            }
        }
    }
}
