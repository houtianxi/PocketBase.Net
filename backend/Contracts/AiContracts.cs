namespace PocketbaseNet.Api.Contracts;

public record AiSendRequest(string Prompt, Guid? ConversationId = null);
public record AiSendResponse(Guid ConversationId, string UserMessage, string AssistantMessage);
