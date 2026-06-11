# Domain: Analytics

## 1. Purpose
To aggregate, process, and report on historical and real-time facts, providing organizers and exhibitors with an accurate systemic view of event performance.

## 2. Responsibilities
*   Collecting raw domain events (page views, check-ins, clicks, messages sent).
*   Aggregating data into measurable metrics (e.g., Total Attendees, Session Popularity).
*   Generating standardized reports and dashboards.
*   Serving as the factual system of record for post-event audits.

## 3. Core Entities
*   **Report**: A structured collection of metrics.
*   **Dashboard**: A visual arrangement of reports.
*   **DataStream**: A configured pipeline of raw facts.

## 4. Value Objects
*   `Metric` (Key, Value, Timestamp)
*   `Dimension` (e.g., Device Type, Ticket Tier)

## 5. Domain Events
*   `ReportGenerated`
*   `DashboardExported`

## 6. Business Rules
*   Analytics must be strictly factual; it does not interpret or predict.
*   Data aggregation must respect the privacy and consent rules established by `Identity`.
*   Metrics cannot be altered retroactively (append-only ledger of facts).

## 7. Relationships with other domains
*   **AI (Intelligence)**: Analytics provides the clean, factual historical data that AI uses to train models or generate predictions.
*   **All Domains**: Analytics consumes `DomainEvents` from across the entire platform.

## 8. Ownership Boundaries
*   **Owns**: The aggregation logic, the storage of historical facts (data warehouse layer), and the rendering of reports.
*   **Does NOT Own**: Interpretation, predictions, or recommendations (This belongs to AI/Intelligence).

## 9. Open Questions
*   Do we provide raw data exports (CSV/API) to organizers, or only aggregated reports?
*   How real-time does "real-time analytics" need to be for the MVP?

## 10. Future Considerations
*   Custom report builder for enterprise organizers.
