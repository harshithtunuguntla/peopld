# Domain: Notifications

## 1. Purpose
To deliver timely, relevant alerts to users across multiple channels (Email, SMS, Push, In-App) without causing alert fatigue.

## 2. Responsibilities
*   Routing messages to the correct delivery channel based on user preference.
*   Managing notification templates (rendering dynamic content).
*   Handling delivery receipts and bounce management.
*   Enforcing "Do Not Disturb" and opt-out preferences.

## 3. Core Entities
*   **NotificationTemplate**: The blueprint for a message (e.g., "Meeting Reminder").
*   **DeliveryJob**: The execution of sending a notification.
*   **UserPreference**: A user's settings for what they want to receive and where.

## 4. Value Objects
*   `Channel` (Email, SMS, APNs, FCM, WebSockets)
*   `DeliveryStatus` (Queued, Sent, Delivered, Bounced)

## 5. Domain Events
*   `NotificationSent`
*   `NotificationFailed`
*   `PreferencesUpdated`

## 6. Business Rules
*   No notification may be sent if the user has opted out of that category in `UserPreference`.
*   Critical transactional notifications (e.g., Password Reset, Ticket Purchase) bypass marketing opt-outs.
*   Delivery failures must be logged and trigger fallback channels if configured.

## 7. Relationships with other domains
*   **Identity**: Consumes contact methods (Email, Phone) and manages the privacy opt-outs.
*   **All Domains**: Other domains request Notifications to be sent (e.g., Meetings requests a reminder).

## 8. Ownership Boundaries
*   **Owns**: The routing logic, template rendering, and integration with delivery providers (e.g., Twilio, SendGrid).
*   **Does NOT Own**: The business logic triggering the alert. (e.g., It doesn't know *why* a meeting is starting, it just sends the payload it was given).

## 9. Open Questions
*   For the "India-First" strategy, is WhatsApp Business API treated as a core channel equivalent to SMS?
*   Do we aggregate low-priority notifications into a "Daily Digest" email?

## 10. Future Considerations
*   AI-optimized delivery times (sending notifications when the user is historically most active).
