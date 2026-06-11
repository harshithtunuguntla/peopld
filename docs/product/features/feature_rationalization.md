# Feature Rationalization

This document records the justification for including, deferring, or rejecting features based on the strategic hypotheses outlined in `AGENTS.md`. We prioritize quality and strategic differentiation over feature bloat.

## 1. Included Features (Core Moat & High Value)

*   **The Copilot Lead Capture Workflow (QR Scan → Voice Note → Structured Lead):** This is our **first-class, India-first differentiator**. Booth staff hate typing. English voice notes quickly parsed by an LLM into structured fields completely removes friction, directly driving Exhibitor ROI.
*   **Basic AI Lead Prioritization (Hot/Warm/Cold):** Derived directly from the context of the captured voice note. This is a lightweight, high-value alternative to full predictive scoring, providing immediate pipeline clarity for exhibitors at MVP.
*   **Relationship History (Event Memory):** The persistent database of "People I Met" and "Past Connections". Keeping this graph alive post-event is our primary defense against incumbent platforms (Cvent, Brella).
*   **Dynamic AI Matchmaking Feed:** Our primary "Adoption Engine." We must deliver value to attendees to ensure they use the platform, thereby feeding the Lead Capture engine.
*   **CSV Import/Export & Webhooks:** Essential data ingestion methods that balance modern integration needs without the massive overhead of custom API development for MVP.

## 2. Deferred Features (Post-MVP)

*   **Multilingual / Regional Language AI Support:**
    *   *Reason:* Adds massive complexity to prompt engineering and LLM selection.
    *   *Assumption:* For MVP, English-only voice transcription and AI processing is sufficient to validate the Lead Capture hypothesis.
*   **In-App Meeting Scheduling ("My Meetings"):**
    *   *Reason:* Matchmaking can be validated without forcing users to schedule through our UI. Attendees can connect via WhatsApp to arrange a time.
    *   *Assumption:* The friction of finding a mutual time slot natively is high to build and low to validate the core matchmaking intent.
*   **Predictive Lead Scoring (Behavioral):**
    *   *Reason:* Requires complex historical analytics pipelines (tracking session dwell time, etc.). Basic text-derived Hot/Warm/Cold prioritization handles the MVP need.
*   **Native Video Streaming / VOD:**
    *   *Reason:* Extremely high infrastructure cost. Integrate with Zoom instead.

## 3. Rejected Features (Out of Scope)

*   **Virtual 3D Expo Halls / Metaverse Venues:**
    *   *Reason:* Gimmicky. Exhibitors want qualified leads in their CRM, not 3D avatars.
*   **Hotel & Travel Booking Engine:**
    *   *Reason:* Completely outside our core domains. Breaks the domain boundary rule.
