# Domain: Meetings

## 1. Purpose
To handle the synchronous scheduling and coordination of interactions between attendees, exhibitors, and sponsors.

## 2. Responsibilities
*   Managing user availability and blocked time slots.
*   Handling meeting requests, acceptances, and rescheduling.
*   Assigning physical or virtual locations to meetings.
*   Managing meeting limits and rules (e.g., max 10 meetings per day).

## 3. Core Entities
*   **Meeting**: The scheduled interaction.
*   **AvailabilityCalendar**: A user's open and blocked times.
*   **Location**: A physical table/booth or a virtual video room.

## 4. Value Objects
*   `TimeSlot` (Start time, End time)
*   `MeetingStatus` (Pending, Accepted, Declined, Cancelled, Completed)

## 5. Domain Events
*   `MeetingRequested`
*   `MeetingAccepted`
*   `MeetingRescheduled`
*   `LocationAssigned`

## 6. Business Rules
*   A `Meeting` cannot be `Accepted` if either participant does not have an open `TimeSlot` in their `AvailabilityCalendar`.
*   A physical `Location` cannot be double-booked for the same `TimeSlot`.
*   Meetings must fall within the overall `DateRange` of the `Event`.

## 7. Relationships with other domains
*   **Networking**: A successfully completed Meeting strongly implies a Connection for the Relationship Graph.
*   **Events**: Dictates the valid overarching time boundaries.
*   **Messaging**: Often, users chat before requesting a meeting.

## 8. Ownership Boundaries
*   **Owns**: Time, scheduling logic, and physical/virtual table inventory.
*   **Does NOT Own**: The relationship itself (Networking) or the video streaming infrastructure (potentially Events/Sessions).

## 9. Open Questions
*   How do we handle timezone conversions seamlessly for hybrid events?
*   If a user cancels their registration, how do we gracefully cancel and notify all their scheduled meetings?

## 10. Future Considerations
*   Group meetings (1-to-many or many-to-many).
*   AI-driven auto-scheduling (finding the optimal time for both parties automatically).
