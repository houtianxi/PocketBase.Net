using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PocketbaseNet.Api.Contracts;
using PocketbaseNet.Api.Domain.Entities;
using PocketbaseNet.Api.Infrastructure;
using PocketbaseNet.Api.Infrastructure.Auth;

namespace PocketbaseNet.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/ai")]
public class AiController(AppDbContext db, CurrentUserAccessor currentUser) : ControllerBase
{
    [HttpPost("chat")]
    public async Task<ActionResult<AiSendResponse>> Chat([FromBody] AiSendRequest request)
    {
        var userId = currentUser.UserId;
        if (string.IsNullOrWhiteSpace(userId))
        {
            return Unauthorized();
        }

        AiConversation conversation;
        if (request.ConversationId.HasValue)
        {
            conversation = await db.AiConversations.FirstOrDefaultAsync(x => x.Id == request.ConversationId.Value && x.UserId == userId)
                ?? new AiConversation { UserId = userId, Title = "New Chat" };

            if (conversation.Id == Guid.Empty)
            {
                conversation.Id = Guid.NewGuid();
            }

            if (db.Entry(conversation).State == EntityState.Detached)
            {
                db.AiConversations.Add(conversation);
            }
        }
        else
        {
            conversation = new AiConversation
            {
                UserId = userId,
                Title = request.Prompt.Length > 20 ? request.Prompt[..20] : request.Prompt
            };
            db.AiConversations.Add(conversation);
        }

        var userMsg = new AiMessage
        {
            Conversation = conversation,
            Role = "user",
            Content = request.Prompt,
            TokensUsed = Math.Max(1, request.Prompt.Length / 4)
        };

        var assistantText = $"[AI 初版] 已收到你的请求：{request.Prompt}。后续可接入 OpenAI/Azure OpenAI 进行真实推理。";
        var assistantMsg = new AiMessage
        {
            Conversation = conversation,
            Role = "assistant",
            Content = assistantText,
            TokensUsed = Math.Max(1, assistantText.Length / 4)
        };

        conversation.UpdatedAt = DateTimeOffset.UtcNow;

        db.AiMessages.Add(userMsg);
        db.AiMessages.Add(assistantMsg);

        db.AuditLogs.Add(new AuditLog
        {
            ActorId = userId,
            Action = "ai.chat",
            ResourceType = "ai_conversation",
            ResourceId = conversation.Id.ToString(),
            DetailJson = "{}"
        });

        await db.SaveChangesAsync();

        return Ok(new AiSendResponse(conversation.Id, userMsg.Content, assistantMsg.Content));
    }

    [HttpGet("conversations")]
    public async Task<ActionResult<object>> Conversations()
    {
        var userId = currentUser.UserId;
        if (string.IsNullOrWhiteSpace(userId))
        {
            return Unauthorized();
        }

        var items = await db.AiConversations
            .Where(x => x.UserId == userId)
            .OrderByDescending(x => x.UpdatedAt)
            .Select(x => new { x.Id, x.Title, x.UpdatedAt, x.CreatedAt })
            .ToListAsync();

        return Ok(items);
    }

    [HttpGet("conversations/{id:guid}/messages")]
    public async Task<ActionResult<object>> Messages(Guid id)
    {
        var userId = currentUser.UserId;
        if (string.IsNullOrWhiteSpace(userId))
        {
            return Unauthorized();
        }

        var exists = await db.AiConversations.AnyAsync(x => x.Id == id && x.UserId == userId);
        if (!exists)
        {
            return NotFound();
        }

        var items = await db.AiMessages
            .Where(x => x.ConversationId == id)
            .OrderBy(x => x.CreatedAt)
            .Select(x => new { x.Id, x.Role, x.Content, x.TokensUsed, x.CreatedAt })
            .ToListAsync();

        return Ok(items);
    }
}
