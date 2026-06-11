# Domain: Integrations

## 1. Purpose
To connect the Event Intelligence Platform with the broader SaaS ecosystem, ensuring data flows seamlessly into customers' existing workflows (CRMs, Marketing Automation, etc.).

## 2. Responsibilities
*   Managing API keys and OAuth connections for third-party services.
*   Mapping data schemas between the platform and external systems (e.g., mapping `CapturedLead` to a Salesforce `Contact`).
*   Handling inbound and outbound webhooks.
*   Managing synchronization jobs and retry logic for failed syncs.

## 3. Core Entities
*   **IntegrationApp**: The configuration for a specific third-party service (e.g., Hubspot Integration).
*   **SyncJob**: A background task moving data between systems.
*   **WebhookEndpoint**: A registered URL receiving real-time events.

## 4. Value Objects
*   `ConnectionStatus` (Healthy, Failing, Disconnected)
*   `FieldMapping` (Source Field -> Target Field)

## 5. Domain Events
*   `IntegrationConnected`
*   `SyncJobCompleted`
*   `SyncJobFailed`

## 6. Business Rules
*   Integrations must strictly adhere to the RBAC rules defined in `Organizations`.
*   Sync jobs must implement exponential backoff for external API rate limits.
*   Data synced externally must be logged for auditing and compliance.

## 7. Relationships with other domains
*   **Exhibitors**: The primary consumer of CRM integrations (syncing leads).
*   **Registration**: Often syncs inbound data from external ticketing systems if we aren't handling Ticketing.

## 8. Ownership Boundaries
*   **Owns**: The translation layer, retry queues, and third-party credential storage.
*   **Does NOT Own**: The core business logic of the data being synced.

## 9. Open Questions
*   Do we build integrations natively, or use an embedded iPaaS solution (like merge.dev or Workato)?
*   How do we handle bi-directional sync conflicts?

## 10. Future Considerations
*   An open API platform allowing developers to build custom apps on top of Event Memory.
