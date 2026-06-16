# Domain: Organizations

## 1. Purpose
To provide multi-tenant isolation, allowing event hosts (Organizers) to manage their teams, billing boundaries, and data ownership securely.

## 2. Responsibilities
*   Managing tenant workspaces.
*   Managing team members and Role-Based Access Control (RBAC).
*   Enforcing data isolation between different event hosts.
*   Managing overarching branding and defaults for an organizer.

## 3. Core Entities
*   **TenantOrganization**: The root aggregate representing the event hosting company.
*   **OrganizationMember**: A user granted access to manage the organization.
*   **Role**: Permissions bound to a member.

## 4. Value Objects
*   `OrganizationId` (Tenant ID)
*   `PermissionSet`
*   `BrandColor`

## 5. Domain Events
*   `OrganizationCreated`
*   `MemberInvited`
*   `MemberRoleUpdated`
*   `MemberRemoved`

## 6. Business Rules
*   Every `Event` must belong to exactly one `TenantOrganization`.
*   An `OrganizationMember` must map to an existing `GlobalUser` (from Identity).
*   Data from one `TenantOrganization` cannot leak to another unless explicitly consented by the `GlobalUser`.

## 7. Relationships with other domains
*   **Events**: Acts as the parent container for all events.
*   **Identity**: Uses Identity to authenticate members.
*   **Billing**: Serves as the primary billing entity.

## 8. Ownership Boundaries
*   **Owns**: The definition of the organizing company and its staff permissions.
*   **Does NOT Own**: The definition of companies acting as Exhibitors or Sponsors (see Future Considerations).

## 9. Open Questions
*   Can a `GlobalUser` belong to multiple `TenantOrganizations`? (Likely yes, e.g., agency models).
*   How do we handle parent-child organization hierarchies for large enterprises?

## 10. Future Considerations
*   **Future Company Domain**: Currently, `Organizations` models the *Tenant* (Organizer). We may need a separate `Company` domain in the future to normalize data for companies that act as Exhibitors, Sponsors, or Attendees' employers, completely separating the concept of a "Company Identity" from a "Tenant Workspace".
