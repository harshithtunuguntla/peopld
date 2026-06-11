# Domain: Identity

## 1. Purpose
To serve as the global, persistent representation of a human being across all events, facilitating the platform's core "Event Memory" and relationship graph.

## 2. Responsibilities
*   Authenticating users (Sign-up, Log-in, SSO).
*   Managing global profile attributes (Name, Global Avatar, Verified Contact Methods).
*   Acting as the central node for cross-event data aggregation.
*   Enforcing data privacy and consent across the platform.

## 3. Core Entities
*   **GlobalUser**: The root aggregate representing a human.
*   **Credential**: Authentication methods linked to the user.
*   **ConsentRecord**: Privacy and data sharing agreements.

## 4. Value Objects
*   `EmailAddress`
*   `PhoneNumber`
*   `UserStatus` (e.g., Active, Suspended)

## 5. Domain Events
*   `UserCreated`
*   `UserAuthenticated`
*   `GlobalProfileUpdated`
*   `ConsentGranted` / `ConsentRevoked`

## 6. Business Rules
*   A `GlobalUser` must exist independently of any specific `Event`.
*   A user can have multiple authentication methods but only one canonical `GlobalUser` identity.
*   Data cannot be shared with an `Organization` without a valid `ConsentRecord`.

## 7. Relationships with other domains
*   **Registration**: Provides the base identity that Registration enriches with event-specific details (like an event-specific job title).
*   **Networking**: Acts as the node in the relationship graph.

## 8. Ownership Boundaries
*   **Owns**: The global authentication state and cross-event baseline profile.
*   **Does NOT Own**: Event-specific profiles (e.g., "Speaker at Event X") - this belongs to Registration/Events.

## 9. Open Questions
*   How do we handle identity merging when a user creates duplicate accounts with different emails?
*   Should B2B SSO (e.g., Okta) automatically provision a `GlobalUser` or an Organization-scoped user?

## 10. Future Considerations
*   Decentralized Identity (DID) integration.
*   Cross-platform identity syndication.
