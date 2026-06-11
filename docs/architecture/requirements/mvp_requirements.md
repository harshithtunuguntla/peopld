# MVP Architecture Requirements

This document defines the strict system capabilities required to validate the India-First Event Intelligence MVP. It enforces a strict separation of concerns: it defines *what* the system must do, but dictates zero technology, framework, or database choices.

*Constraint Context:* MVP is optimized for a maximum of 10,000 attendees per event, managed by a 5-engineer team over 12 months.

---

## 1. Core Platform (Tenancy & Memory)

### REQ-CORE-01: Multi-Tenant Event Isolation
*   **Type:** Security & Privacy Requirement
*   **Description:** The system must strictly isolate all operational data (registrations, meeting schedules, exhibitor leads) to the specific Event Tenant. An exhibitor from Event A cannot query leads from Event B.
*   **Why it exists:** Absolute requirement for Organizer trust and B2B data compliance.
*   **Dependent MVP Feature:** CSV Import, Data Portals
*   **Priority:** Critical
*   **Acceptance Criteria:** A query for attendee data without a valid Tenant context must actively reject the request.
*   **Risk if Unmet:** Cross-tenant data leakage.

### REQ-CORE-02: Persistent Cross-Tenant Event Memory (Data Ownership)
*   **Type:** Privacy & Functional Requirement
*   **Description:** The system must maintain a global relationship graph. Crucially, the system must recognize that *Connections* are owned by the `GlobalUser`, while *Event Attendance Records* are owned by the `Tenant`.
*   **Why it exists:** Resolves the contradiction between strict tenant isolation and global event memory. If a Tenant deletes their event, the relationship graph between two users survives because the users own the edge.
*   **Dependent MVP Feature:** Relationship History, Past Connections
*   **Priority:** Critical
*   **Acceptance Criteria:** If Organizer X deletes Event Y, User A still retains their connection to User B, but the system no longer references Event Y as the origin if explicitly scrubbed.
*   **Risk if Unmet:** Privacy violations or failure to validate the core Event Memory hypothesis.

### REQ-CORE-03: Event Burst Scaling Constraints
*   **Type:** Scalability Requirement
*   **Description:** The system must handle highly concentrated burst traffic specific to live events.
*   **Priority:** Important
*   **Acceptance Criteria:** The system handles 10,000 concurrent read requests within a 5-minute window with sub-second p95 latency.

---

## 2. Identity & Communication

### REQ-ID-01: Primary Phone Identity with OTP
*   **Type:** Functional Requirement
*   **Description:** Authenticate users via Phone Number using WhatsApp OTP.
*   **Priority:** Critical

### REQ-ID-02: Identity Lifecycle Safeguards (Recycled SIMs)
*   **Type:** Security Requirement
*   **Description:** The system must implement safeguards to verify identity beyond just OTP possession to prevent hijacked Event Memory graphs when phone numbers are recycled.
*   **Why it exists:** Extremely high turnover of prepaid phone numbers in India.
*   **Dependent MVP Feature:** Global Identity
*   **Priority:** Critical
*   **Acceptance Criteria:** The system flags new device logins on existing numbers and requires a secondary verification (e.g., email fallback or PIN) to grant access to historical Event Memory data.
*   **Risk if Unmet:** Massive PII and professional network data breach.

### REQ-COM-01: WhatsApp Communication Segregation & Rate Limiting
*   **Type:** Reliability & Integration Requirement
*   **Description:** The system must physically segregate Transactional WhatsApp queues (OTP) from Marketing/Notification queues (Matchmaking), and enforce strict rate limiting on outbound blasts.
*   **Why it exists:** Blasting 10,000 attendees simultaneously will trigger Meta's spam filters, risking a ban on the number used for OTPs.
*   **Dependent MVP Feature:** WhatsApp-First Notifications
*   **Priority:** Critical
*   **Acceptance Criteria:** Matchmaking messages are trickled out at a rate that stays 20% below the provider's spam threshold; OTPs utilize a separate, prioritized number/channel.
*   **Risk if Unmet:** The entire platform loses the ability to authenticate users.

### REQ-COM-02: Secure Data Egress
*   **Type:** Security Requirement
*   **Description:** The system must deliver data exports via secure, authenticated, expiring download links rather than attaching raw PII to emails.
*   **Priority:** Critical

---

## 3. Data Ingestion & Integration

### REQ-DATA-01: CSV Data Normalization & Validation UI
*   **Type:** Functional Requirement
*   **Description:** The system must accept CSV uploads, map columns, and critically, provide explicit row-by-row error reporting (e.g., "Row 42: Invalid Phone Format").
*   **Why it exists:** Organizers never upload clean data. Silent failures destroy trust.
*   **Dependent MVP Feature:** CSV Import
*   **Priority:** Critical
*   **Acceptance Criteria:** An Organizer uploading a file with 10 bad rows receives a summary report rejecting only those 10 rows, importing the rest.

### REQ-DATA-02: Generic Webhook Ingestion Pipeline
*   **Type:** Integration Requirement
*   **Description:** The system must expose a single, generic JSON webhook endpoint for real-time registration ingestion. It will *not* contain platform-specific mapping logic (e.g., Cvent-specific parsers).
*   **Why it exists:** Supports modern ticketing tools without requiring 5 engineers to build and maintain 10 custom integrations.
*   **Dependent MVP Feature:** Webhook Ingestion
*   **Priority:** Important
*   **Acceptance Criteria:** An external system can hit the `/webhook/register` endpoint with a standardized payload, and the attendee is created within 5 seconds.

---

## 4. AI & Lead Capture (Exhibitor Monetization)

### REQ-AI-01: QR Badge Scanning (PWA Offline-First)
*   **Type:** Offline Requirement
*   **Description:** The Exhibitor PWA must cache scanned badges and voice notes locally if the device loses network connectivity.
*   **Priority:** Critical
*   **Acceptance Criteria:** PWA uploads the payload automatically upon network reconnection.

### REQ-AI-02: Asynchronous Voice Processing (English-Only)
*   **Type:** AI Processing Requirement
*   **Description:** The system must accept an audio blob and queue it for English transcription and LLM structuring. It must *not* block the client UI.
*   **Priority:** Critical

### REQ-AI-03: Basic AI Lead Prioritization
*   **Type:** AI Processing Requirement
*   **Description:** The system must instruct the LLM to assign a discrete priority tag (Hot/Warm/Cold) based strictly on the semantic context of the voice note.
*   **Priority:** Important

---

## 5. Matchmaking & Attendee Experience

### REQ-ATT-01: Batch AI Matchmaking Inference
*   **Type:** AI Processing & Scalability Requirement
*   **Description:** The system must pre-calculate affinity scores between attendees via asynchronous batch processing (e.g., nightly), rather than calculating them dynamically on read.
*   **Why it exists:** Reduces database load and engineering complexity by magnitudes.
*   **Dependent MVP Feature:** Dynamic AI Matchmaking Feed
*   **Priority:** Important
*   **Acceptance Criteria:** The "My Matches" API endpoint performs a simple lookup against a pre-computed table, returning results in < 100ms.
*   **Risk if Unmet:** Database locks and massive latency during event hours.
