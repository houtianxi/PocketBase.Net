using PocketbaseNet.Api.Domain.Entities;
using PocketbaseNet.Api.Domain.Enums;
using PocketbaseNet.Api.Infrastructure.Auth;
using Microsoft.Extensions.Logging;

namespace PocketbaseNet.Api.Infrastructure.Services;

public class RuleEvaluator(CurrentUserAccessor currentUser, ILogger<RuleEvaluator> logger)
{
    public bool CanList(CollectionDefinition collection) => Check(collection.ListRule, null, $"List:{collection.Name}");
    public bool CanView(CollectionDefinition collection, EntityRecord record) => Check(collection.ViewRule, record, $"View:{collection.Name}");
    public bool CanCreate(CollectionDefinition collection) => Check(collection.CreateRule, null, $"Create:{collection.Name}");
    public bool CanUpdate(CollectionDefinition collection, EntityRecord record) => Check(collection.UpdateRule, record, $"Update:{collection.Name}");
    public bool CanDelete(CollectionDefinition collection, EntityRecord record) => Check(collection.DeleteRule, record, $"Delete:{collection.Name}");

    private bool Check(RuleAccessLevel level, EntityRecord? record, string context)
    {
        var result = level switch
        {
            RuleAccessLevel.Public => true,
            RuleAccessLevel.Authenticated => currentUser.IsAuthenticated,
            RuleAccessLevel.Owner => currentUser.IsAuthenticated && record is not null && record.OwnerId == currentUser.UserId,
            RuleAccessLevel.Admin => currentUser.IsAdmin,
            _ => false
        };

        logger.LogInformation(
            "Permission check - Context: {Context}, Rule: {Rule}, UserId: {UserId}, IsAuth: {IsAuth}, IsAdmin: {IsAdmin}, Result: {Result}",
            context, level, currentUser.UserId ?? "NONE", currentUser.IsAuthenticated, currentUser.IsAdmin, result
        );

        return result;
    }
}
