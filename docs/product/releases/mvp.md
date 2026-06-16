# MVP Release Definition

This document defines the strict boundaries of the Minimum Viable Product, optimized for a 5-engineer team with 12 months of runway targeting the Indian market.

**Goal:** To test the core hypothesis (Event Intelligence, Lead Intelligence, Event Memory) as an "Over-The-Top" intelligence layer, avoiding the complexities of event operations and ticketing.

**Assumption:** English-only MVP. All AI parsing and NLP features assume English input.

## Included Capabilities (MVP Core)

### Intelligence & Memory (The Moat)
*   **Relationship History (Event Memory Database):** The backend foundation mapping "People I Met" and "Past Connections" across instances.
*   **AI Matchmaking Engine:** The core algorithm matching attendees to attendees/exhibitors.
*   **Basic AI Lead Prioritization (Hot/Warm/Cold):** Immediate pipeline clarity for Exhibitors derived from voice capture context (much lighter than predictive scoring).

### Identity & Communication (India-First)
*   **Dual Identity Resolution:** Phone number (WhatsApp OTP) primary, capturing Email for future identity merging.
*   **WhatsApp-First Notifications:** Matchmaking feeds delivered via WhatsApp. Email used for reports, exports, and sponsor comms.

### Data & Integrations (CSV-First)
*   **Organizer Data Portal:** CSV Import/Export.
*   **Lightweight API & Webhooks:** Basic Public API and Webhook ingestion.

### Attendee Experience (Lightweight PWA)
*   **My Matches:** AI-generated feed of who to meet.
*   **My Schedule:** Lightweight agenda view.

### Exhibitor Experience (Monetization Engine)
*   **AI Copilot Lead Capture (QR Scan → Voice Note → Structured Lead):** First-class workflow. Scan badge -> Record English voice note -> LLM extracts budget/intent -> CSV Export.

## MVP Optional (Valuable, but cut if behind schedule)
*   **My Meetings (In-App Scheduling):** Matchmaking intent can be validated without forcing in-app calendar scheduling (users can sync via WhatsApp).
*   **In-App Messaging:** Fallback to generating external WhatsApp links.

## Excluded Capabilities (Do Not Build for MVP)
*   **Predictive Lead Scoring (Behavioral):** Deferred to V1.
*   **Multilingual / Regional Language Processing:** Deferred to V1/V2.
*   **Ticketing & Payments:** Completely removed.
