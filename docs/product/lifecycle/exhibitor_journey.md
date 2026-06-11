# Exhibitor Journey

This document maps the complete lifecycle for the Exhibiting Company and its Staff.

## High-Level Workflow
```mermaid
graph LR
    A[Before: Booth Setup & Outreach] --> B[During: Lead Capture & Meetings]
    B --> C[After: Qualification & Pipeline]
```

## Phase 1: Before Event

### Step: Booth Setup & Target Identification
*   **Goal:** Create an attractive digital/physical presence and identify high-value targets.
*   **Action:** Uploads marketing collateral, registers booth staff, and uses matchmaking to send outbound meeting requests.
*   **Pain Point:** Finding the right buyers is like finding a needle in a haystack; outbound outreach is often ignored.
*   **Data Generated:** ExhibitorProfile, ExhibitorStaff, Outbound ConnectionRequests.
*   **Domain Ownership:** `Exhibitors`, `Networking`, `AI`
*   **AI Opportunity:** "Lookalike Audiences." The AI analyzes the exhibitor's past successful leads and surfaces attendees at the current event with similar profiles.
*   **Event Memory Opportunity:** Importing the exhibitor's existing CRM data to see which of their *existing* prospects are attending this event.
*   **Revenue Opportunity:** Selling "Lead Generation Boosts" where the platform pushes the exhibitor's profile to highly matched attendees.

## Phase 2: During Event

### Step: Lead Capture & Qualification
*   **Goal:** Maximize the volume and quality of captured leads.
*   **Action:** Scans attendee badges at the physical booth or accepts inbound meeting requests virtually.
*   **Pain Point:** Badge scanners are often clunky rented hardware. Qualification notes (e.g., "Ready to buy in Q3") are lost or written on paper.
*   **Data Generated:** CapturedLeads, MeetingStatus.
*   **Domain Ownership:** `Exhibitors`, `Meetings`
*   **AI Opportunity:** Copilot listens to the virtual/physical meeting (via mobile mic) and automatically generates CRM qualification notes and a summary.
*   **Event Memory Opportunity:** The platform instantly tells the booth staff if another member of their team met this attendee at a previous event.
*   **Revenue Opportunity:** Upcharging for advanced lead capture licenses (per-seat pricing for booth staff).

## Phase 3: After Event

### Step: Pipeline Integration
*   **Goal:** Move leads into the sales pipeline before they go cold.
*   **Action:** Exports lead lists to CSV or syncs directly to Salesforce/HubSpot.
*   **Pain Point:** Manual data entry. Lead quality is mixed, and sales reps waste time on cold leads.
*   **Data Generated:** SyncJobs, LeadScores.
*   **Domain Ownership:** `Exhibitors`, `Integrations`, `AI`
*   **AI Opportunity:** Predictive Lead Scoring. The AI scores every lead based on their engagement (sessions attended, booth dwell time) so sales reps know who to call first.
*   **Event Memory Opportunity:** The platform tracks if that lead *actually* converted 6 months later, feeding that data back to improve the AI matchmaking for the next event.
*   **Revenue Opportunity:** Charging for premium native integrations (e.g., direct Salesforce bidirectional sync).
