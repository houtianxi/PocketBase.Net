namespace PocketbaseNet.Api.Domain.Entities;

public class AiMessage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ConversationId { get; set; }
    public AiConversation? Conversation { get; set; }

    public string Role { get; set; } = "user";
    public string Content { get; set; } = string.Empty;
    public int TokensUsed { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
