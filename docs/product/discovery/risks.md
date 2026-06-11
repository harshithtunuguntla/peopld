# Product Risks

This document tracks the top risks that could derail the Event Intelligence Platform. Every major architecture or feature decision should be evaluated against these risks.

## Top Risks

### 1. Feature Bloat
*   **Description:** Attempting to build standard event management features (registration, streaming) *plus* advanced AI intelligence simultaneously, exhausting resources before reaching product-market fit.
*   **Mitigation Strategy:** Strictly define MVP boundaries in `/docs/product/releases/mvp.md`. Rely heavily on external integrations for table-stakes features initially.

### 2. Adoption Friction
*   **Description:** If the intelligence features require too much manual configuration by the organizer, they won't be used.
*   **Mitigation Strategy:** "Zero-config" defaults. The Event Copilot should auto-infer settings where possible.

### 3. The Data Cold Start Problem
*   **Description:** "AI Matchmaking" and "Event Memory" require a critical mass of data to be valuable. Early events might lack the data for these features to shine.
*   **Mitigation Strategy:** [Placeholder for cold-start strategy, e.g., LinkedIn integrations, pre-event surveys]

### 4. Incumbent Fast-Follow
*   **Description:** Existing platforms (Cvent, Brella) have massive distribution and could fast-follow intelligence features.
*   **Mitigation Strategy:** Focus intensely on the underserved post-event lifecycle which incumbents typically ignore.
