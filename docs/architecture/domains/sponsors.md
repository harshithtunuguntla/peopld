# Domain: Sponsors

## 1. Purpose
To manage the branding, visibility, and return on investment (ROI) for companies financially backing the event.

## 2. Responsibilities
*   Managing sponsor tiers (e.g., Platinum, Gold).
*   Managing ad placements, logos, and digital banners across the platform.
*   Tracking sponsor impressions, clicks, and engagement (Attribution).

## 3. Core Entities
*   **SponsorProfile**: The event-scoped representation of the sponsoring company.
*   **SponsorTier**: The package dictating visibility rules.
*   **Campaign**: A specific marketing push by the sponsor.

## 4. Value Objects
*   `PlacementLocation` (e.g., Homepage Banner, Session Pre-roll)
*   `AttributionMetric` (Impressions, Clicks)

## 5. Domain Events
*   `SponsorOnboarded`
*   `AdDisplayed`
*   `AdClicked`

## 6. Business Rules
*   A `SponsorProfile`'s visibility is strictly constrained by the rules defined in their assigned `SponsorTier`.
*   Ads cannot be displayed outside of the defined `Campaign` dates.

## 7. Relationships with other domains
*   **Exhibitors**: A company is often both a Sponsor and an Exhibitor.
*   **Billing**: Sponsorships are tied to large invoicing contracts.
*   **Analytics**: Analytics aggregates the raw `AttributionMetric` data for reporting.

## 8. Ownership Boundaries
*   **Owns**: Branding assets, tier logic, and attribution tracking for ads.
*   **Does NOT Own**: The core company record (Organizations/Company) or the general event reporting (Analytics).

## 9. Open Questions
*   How do we differentiate between a "Lead" (Exhibitor) and an "Impression/Click" (Sponsor) if a company is both?
*   Do we sell ad inventory dynamically, or is it purely static packages?

## 10. Future Considerations
*   **Future Company Domain**: Abstracting the core company profile.
*   Self-serve sponsorship portal (allowing companies to bid on ad placements).
