# Domain: Messaging

## 1. Purpose
To facilitate asynchronous text-based communication between users before, during, and after an event.

## 2. Responsibilities
*   Managing 1:1 direct messages.
*   Managing group chats or session-specific channels.
*   Handling read receipts, typing indicators, and message history.
*   Enforcing blocking and moderation rules.

## 3. Core Entities
*   **Thread** (or Channel): A container for a sequence of messages.
*   **Message**: The individual payload of communication.
*   **Participant**: A user taking part in a thread.

## 4. Value Objects
*   `MessagePayload` (Text, Image URL)
*   `ThreadStatus` (Active, Archived, Blocked)

## 5. Domain Events
*   `MessageSent`
*   `MessageRead`
*   `ThreadCreated`

## 6. Business Rules
*   A `Message` can only be appended to a `Thread` if the `ThreadStatus` is Active.
*   A user cannot send a message to a user who has blocked them (enforced via Networking/Identity).
*   Channel history might be ephemeral or persistent depending on Event settings.

## 7. Relationships with other domains
*   **Networking**: A Thread might be unlocked only *after* a Connection is accepted.
*   **Events**: Channel chats are often bound to specific `Sessions`.
*   **Notifications**: Triggers push notifications for unread messages.

## 8. Ownership Boundaries
*   **Owns**: The text payloads, chat UI state, and message delivery.
*   **Does NOT Own**: The relationship status (Networking) or the video call functionality.

## 9. Open Questions
*   Does Messaging persist forever (Event Memory) or does it wipe after the event?
*   Are we building real-time websockets from scratch, or using an external PaaS (e.g., Sendbird, Stream)?

## 10. Future Considerations
*   WhatsApp integration (routing messages through WhatsApp Business API).
*   AI summarization of long threads.
