using PocketbaseNet.Api.Domain.Entities;
using PocketbaseNet.Api.Domain.Enums;
using PocketbaseNet.Api.Infrastructure.Auth;

namespace PocketbaseNet.Api.Infrastructure.Services;

public class RuleEvaluator(CurrentUserAccessor currentUser)
{
    public bool CanList(CollectionDefinition collection) => Check(collection.ListRule, null);
    public bool CanView(CollectionDefinition collection, EntityRecord record) => Check(collection.ViewRule, record);
    public bool CanCreate(CollectionDefinition collection) => Check(collection.CreateRule, null);
    public bool CanUpdate(CollectionDefinition collection, EntityRecord record) => Check(collection.UpdateRule, record);
    public bool CanDelete(CollectionDefinition collection, EntityRecord record) => Check(collection.DeleteRule, record);

    private bool Check(RuleAccessLevel level, EntityRecord? record)
    {
        return level switch
        {
            RuleAccessLevel.Public => true,
            RuleAccessLevel.Authenticated => currentUser.IsAuthenticated,
            RuleAccessLevel.Owner => currentUser.IsAuthenticated && record is not null && record.OwnerId == currentUser.UserId,
            RuleAccessLevel.Admin => currentUser.IsAdmin,
            _ => false
        };
    }
}
