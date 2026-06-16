# Domain: Events

## 1. Purpose
To manage the core lifecycle, configuration, and state of an individual event or conference.

## 2. Responsibilities
*   Managing event metadata (Name, Dates, Location, Type).
*   Tracking the event lifecycle (Draft, Published, Live, Concluded).
*   Managing the event agenda (Tracks, Sessions, Speakers).
*   Configuring event-wide settings (e.g., turning Networking on/off).

## 3. Core Entities
*   **Event**: The root aggregate.
*   **Session**: An agenda item occurring at a specific time.
*   **Speaker**: An individual presenting at a session.
*   **Venue**: The physical or virtual location of the event.

## 4. Value Objects
*   `EventFormat` (In-Person, Virtual, Hybrid)
*   `DateRange` (Start and End times)
*   `EventStatus`

## 5. Domain Events
*   `EventPublished`
*   `EventStatusChanged`
*   `SessionAdded`
*   `SessionRescheduled`

## 6. Business Rules
*   An `Event` cannot be published without valid dates and a location (virtual or physical).
*   A `Session` cannot exist outside the bounds of its parent `Event`'s `DateRange`.
*   An `Event` belongs strictly to one `TenantOrganization`.

## 7. Relationships with other domains
*   **Organizations**: Inherits ownership from Organizations.
*   **Registration**: Dictates when registration can open/close based on EventStatus.
*   **Networking / AI**: Event boundaries dictate the scope of networking graphs for that specific instance.

## 8. Ownership Boundaries
*   **Owns**: The "What, When, and Where" of the event.
*   **Does NOT Own**: Who is attending (Registration) or how much it costs (Ticketing).

## 9. Open Questions
*   How do we handle recurring events or "Series" (e.g., a monthly meetup vs an annual conference)?
*   Should Speakers be linked to the global `Identity` domain, or are they just text fields on an event?

## 10. Future Considerations
*   **Future Sessions Domain**: As agenda management, speaker workflows, and content delivery (streaming/VOD) grow in complexity, `Sessions` may need to be extracted from `Events` into its own top-level domain.
