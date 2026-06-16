# Domain: Exhibitors

## 1. Purpose
To manage the experience, lead generation, and ROI for companies hosting a booth (physical or virtual) at an event.

## 2. Responsibilities
*   Managing virtual booth profiles and branding.
*   Managing the exhibitor's team members (staffing the booth).
*   Handling lead capture workflows (badge scanning, virtual interaction tracking).
*   Managing inbound meeting requests specifically targeted at the company.

## 3. Core Entities
*   **ExhibitorProfile**: The event-scoped representation of the exhibiting company.
*   **ExhibitorStaff**: An attendee authorized to act on behalf of the exhibitor.
*   **CapturedLead**: A record of a user interacting with the exhibitor.

## 4. Value Objects
*   `BoothLocation`
*   `LeadScore` (Hot, Warm, Cold)

## 5. Domain Events
*   `ExhibitorOnboarded`
*   `LeadCaptured`
*   `LeadQualified`

## 6. Business Rules
*   An `ExhibitorStaff` member must also be a registered `AttendeeRecord` for the event.
*   A `CapturedLead` cannot be created without explicit interaction or consent from the user (e.g., scanning a badge, dropping a virtual business card).

## 7. Relationships with other domains
*   **Organizations**: Inherits the overarching company context (see Future Considerations).
*   **Identity/Registration**: Leads are mapped back to user profiles.
*   **Integrations**: Pushes `CapturedLead` data to external CRMs.

## 8. Ownership Boundaries
*   **Owns**: The definition of the booth, the staff roster, and the proprietary list of leads captured by that specific exhibitor.
*   **Does NOT Own**: The global company record or the event-wide analytics.

## 9. Open Questions
*   If an exhibitor captures a lead, does the platform automatically create a `Connection` in the Networking domain?
*   How do we handle lead retrieval offline (e.g., bad internet on the trade show floor)?

## 10. Future Considerations
*   **Future Company Domain**: Abstracting the core "Company" data out of Exhibitors/Sponsors so a company has a unified profile across all events they exhibit at.
