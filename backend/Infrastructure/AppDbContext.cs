using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using PocketbaseNet.Api.Domain.Entities;

namespace PocketbaseNet.Api.Infrastructure;

public class AppDbContext : IdentityDbContext<AppUser, IdentityRole, string>
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<CollectionDefinition> Collections => Set<CollectionDefinition>();
    public DbSet<EntityRecord> Records => Set<EntityRecord>();
    public DbSet<Field> Fields => Set<Field>();
    public DbSet<FieldOption> FieldOptions => Set<FieldOption>();
    public DbSet<FieldRelation> FieldRelations => Set<FieldRelation>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<AiConversation> AiConversations => Set<AiConversation>();
    public DbSet<AiMessage> AiMessages => Set<AiMessage>();
    public DbSet<FileAttachment> FileAttachments => Set<FileAttachment>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<CollectionDefinition>(entity =>
        {
            entity.HasIndex(x => x.Slug).IsUnique();
            entity.Property(x => x.Name).HasMaxLength(100);
            entity.Property(x => x.Slug).HasMaxLength(100);
        });

        builder.Entity<EntityRecord>(entity =>
        {
            entity.HasIndex(x => new { x.CollectionDefinitionId, x.CreatedAt });
            entity.HasOne(x => x.CollectionDefinition)
                .WithMany(x => x.Records)
                .HasForeignKey(x => x.CollectionDefinitionId)
                .OnDelete(DeleteBehavior.Cascade);
            // Store OwnerId as a plain string — no FK constraint to AspNetUsers
            // This avoids FK violations when the user is deleted or tokens are reused across DB resets
            entity.Ignore(x => x.Owner);
            entity.Property(x => x.OwnerId).HasMaxLength(450);
        });

        builder.Entity<Field>(entity =>
        {
            entity.HasIndex(x => new { x.CollectionDefinitionId, x.Name }).IsUnique();
            entity.HasIndex(x => new { x.CollectionDefinitionId, x.DisplayOrder });
            entity.Property(x => x.Name).HasMaxLength(100);
            entity.Property(x => x.Label).HasMaxLength(200);
            entity.Property(x => x.Config)
                .HasConversion(
                    v => v.GetRawText(),
                    v => JsonDocument.Parse(v).RootElement
                );
            entity.HasOne(x => x.CollectionDefinition)
                .WithMany(x => x.Fields)
                .HasForeignKey(x => x.CollectionDefinitionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<FieldOption>(entity =>
        {
            entity.HasIndex(x => new { x.FieldId, x.DisplayOrder });
            entity.Property(x => x.Value).HasMaxLength(255);
            entity.Property(x => x.Label).HasMaxLength(255);
            entity.HasOne(x => x.Field)
                .WithMany(x => x.Options)
                .HasForeignKey(x => x.FieldId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<FieldRelation>(entity =>
        {
            entity.HasIndex(x => new { x.FieldId, x.RelatedCollectionId });
            entity.Property(x => x.JoinTableName).HasMaxLength(255);
            entity.HasOne(x => x.Field)
                .WithMany(x => x.Relations)
                .HasForeignKey(x => x.FieldId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.RelatedCollection)
                .WithMany()
                .HasForeignKey(x => x.RelatedCollectionId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<AuditLog>(entity =>
        {
            entity.HasIndex(x => x.CreatedAt);
            entity.Property(x => x.Action).HasMaxLength(100);
            entity.Property(x => x.ResourceType).HasMaxLength(100);
            entity.Property(x => x.ResourceId).HasMaxLength(128);
        });

        builder.Entity<AiConversation>(entity =>
        {
            entity.HasIndex(x => new { x.UserId, x.UpdatedAt });
            entity.Property(x => x.UserId).HasMaxLength(64);
        });

        builder.Entity<AiMessage>(entity =>
        {
            entity.HasIndex(x => new { x.ConversationId, x.CreatedAt });
            entity.Property(x => x.Role).HasMaxLength(24);
            entity.HasOne(x => x.Conversation)
                .WithMany(x => x.Messages)
                .HasForeignKey(x => x.ConversationId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<FileAttachment>(entity =>
        {
            entity.HasIndex(x => new { x.CollectionSlug, x.RecordId });
            entity.HasIndex(x => new { x.CollectionSlug, x.FieldName });
            entity.HasIndex(x => x.CreatedAt);
            entity.Property(x => x.RecordId).HasMaxLength(128);
            entity.Property(x => x.CollectionSlug).HasMaxLength(100);
            entity.Property(x => x.FieldName).HasMaxLength(100);
            entity.Property(x => x.OriginalFileName).HasMaxLength(500);
            entity.Property(x => x.StoredFileName).HasMaxLength(500);
            entity.Property(x => x.MimeType).HasMaxLength(100);
        });
    }
}
