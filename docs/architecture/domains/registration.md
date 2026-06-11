# Domain: Registration

## 1. Purpose
To capture the intent of a person to attend an event and collect their event-specific information.

## 2. Responsibilities
*   Managing custom registration forms and questions.
*   Capturing event-specific attendee profiles (e.g., job title at the time of the event).
*   Managing attendee types (e.g., VIP, Student, General).
*   Handling the transition from an anonymous visitor to a registered attendee.

## 3. Core Entities
*   **AttendeeRecord**: The event-scoped representation of a participant.
*   **RegistrationForm**: The schema of questions asked during sign-up.
*   **FormResponse**: The answers provided by the user.

## 4. Value Objects
*   `RegistrationStatus` (Pending, Confirmed, Cancelled)
*   `AttendeeType`

## 5. Domain Events
*   `RegistrationStarted`
*   `RegistrationCompleted`
*   `RegistrationCancelled`
*   `AttendeeRecordUpdated`

## 6. Business Rules
*   An `AttendeeRecord` MUST map to exactly one `Event` and exactly one `GlobalUser` (Identity).
*   Registration cannot be completed if the `Event` status is Draft or Concluded.

## 7. Relationships with other domains
*   **Identity**: Uses the global user to seed the registration form, but stores the resulting event-specific profile separately.
*   **Ticketing**: A Registration often requires a valid Ticket to move to `Confirmed` status.
*   **Events**: Scoped entirely to a single Event.

## 8. Ownership Boundaries
*   **Owns**: The form data, the intent to attend, and the event-specific profile snapshot.
*   **Does NOT Own**: The payment transaction (Billing) or the inventory of available spots (Ticketing).

## 9. Open Questions
*   How do we handle group registrations (one person registering 5 colleagues)? Who owns the resulting Identities?
*   Can an attendee change their `AttendeeType` after registration is complete?

## 10. Future Considerations
*   Dynamic registration flows based on Identity attributes (e.g., auto-approving previous attendees).
