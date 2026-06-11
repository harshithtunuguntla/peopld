# Feature Dictionary

This ledger contains the 13-point definition for every core feature in the Event Intelligence Platform. Features are strictly traced back to persona needs and strategic hypotheses.

---

### Global Identity Resolution (Bootstrap)
*   **Problem Solved:** Users have fragmented profiles across different events.
*   **Persona Served:** Attendee
*   **Lifecycle Stage:** Before Event
*   **Domain Ownership:** `Identity`
*   **Business Value:** Frictionless onboarding using Phone Number (WhatsApp OTP) for the MVP, while preparing for long-term multi-graph identity merging.
*   **Revenue Impact:** Indirect (High user retention and adoption rate).
*   **AI Opportunity:** None directly.
*   **Event Memory Opportunity:** The foundational node that makes "Relationship History" possible.
*   **Competitive Importance:** Strategic Moat
*   **Complexity Estimate:** Medium
*   **Dependencies:** None
*   **Founder Hypothesis Supported:** "India-First Strategy (WhatsApp workflows)."
*   **Release Target:** MVP

---

### Relationship History (Event Memory Graph)
*   **Problem Solved:** Event apps shut down after 2 days, severing the connections the attendee just made.
*   **Persona Served:** Attendee / Organizer
*   **Lifecycle Stage:** After Event
*   **Domain Ownership:** `Networking`
*   **Business Value:** User-facing features like "People I Met", "Past Connections", and "Follow-up Recommendations" create a continuous CRM for the attendee.
*   **Revenue Impact:** High (SaaS subscription to access the ongoing community/CRM).
*   **AI Opportunity:** Mining the graph for "Follow-up Recommendations".
*   **Event Memory Opportunity:** This *is* the Event Memory.
*   **Competitive Importance:** Strategic Moat
*   **Complexity Estimate:** High
*   **Dependencies:** Global Identity Resolution
*   **Founder Hypothesis Supported:** "Transform events from isolated experiences into long-term relationship systems."
*   **Release Target:** MVP (Backend Logging) / V1 (Full User UI)

---

### AI Copilot Lead Capture (QR Scan → Voice Note → Structured Lead)
*   **Problem Solved:** Booth staff hate typing notes on their phones; 80% of lead context is lost before it reaches the CRM.
*   **Persona Served:** Exhibitor
*   **Lifecycle Stage:** During Event
*   **Domain Ownership:** `Exhibitors`, `AI`
*   **Business Value:** High-fidelity lead qualification with zero manual data entry. **(English-Only for MVP).**
*   **Revenue Impact:** High (Premium per-seat license for booth staff).
*   **AI Opportunity:** LLMs parse English voice memos into structured fields (Budget, Timeline, Pain Point).
*   **Event Memory Opportunity:** Ties the deep context of the conversation to the relationship edge.
*   **Competitive Importance:** Strategic Moat / First-Class Differentiator
*   **Complexity Estimate:** Medium
*   **Dependencies:** None
*   **Founder Hypothesis Supported:** "Exhibitors generate more qualified leads."
*   **Release Target:** MVP

---

### Basic AI Lead Prioritization (Hot/Warm/Cold)
*   **Problem Solved:** Sales reps get a raw CSV of 500 badge scans and don't know who to call first.
*   **Persona Served:** Exhibitor
*   **Lifecycle Stage:** After Event
*   **Domain Ownership:** `AI`, `Exhibitors`
*   **Business Value:** Immediate pipeline clarity derived directly from the captured voice note context.
*   **Revenue Impact:** Medium (Premium tier feature).
*   **AI Opportunity:** NLP classification of the voice note text to assign Hot, Warm, or Cold intent.
*   **Event Memory Opportunity:** Tracks conversion success back to the algorithm to improve future scoring.
*   **Competitive Importance:** Differentiator
*   **Complexity Estimate:** Low/Medium
*   **Dependencies:** AI Copilot Lead Capture
*   **Founder Hypothesis Supported:** "Lead Intelligence"
*   **Release Target:** MVP

---

### Dynamic AI Matchmaking Feed
*   **Problem Solved:** Scrolling alphabetical lists of attendees to find relevance is a waste of time.
*   **Persona Served:** Attendee / Sponsor
*   **Lifecycle Stage:** Before / During Event
*   **Domain Ownership:** `AI`, `Networking`
*   **Business Value:** Guarantees attendees meet the people most relevant to their goals.
*   **Revenue Impact:** Indirect (Higher attendee NPS -> repeat ticket sales).
*   **AI Opportunity:** Recommender systems matching intent, past connections, and overlapping interests.
*   **Event Memory Opportunity:** Leverages "Past Connections" to recommend 2nd-degree connections.
*   **Competitive Importance:** Competitive Parity (Trending towards Differentiator)
*   **Complexity Estimate:** High
*   **Dependencies:** Identity
*   **Founder Hypothesis Supported:** "AI Matchmaking must create measurable value."
*   **Release Target:** MVP

---

### In-App Meeting Scheduling ("My Meetings")
*   **Problem Solved:** Ping-ponging messages to find a mutual time and location is frustrating.
*   **Persona Served:** Attendee / Exhibitor
*   **Lifecycle Stage:** Before / During Event
*   **Domain Ownership:** `Meetings`
*   **Business Value:** Removes friction from the primary value-driver (meetings).
*   **Revenue Impact:** Indirect.
*   **AI Opportunity:** Auto-proposing the optimal time slot.
*   **Event Memory Opportunity:** None directly.
*   **Competitive Importance:** Competitive Parity
*   **Complexity Estimate:** Medium
*   **Dependencies:** Matchmaking
*   **Founder Hypothesis Supported:** "Attendees build more valuable relationships."
*   **Release Target:** MVP Optional (Deferred)
