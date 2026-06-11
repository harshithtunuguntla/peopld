# ALGORITHM.md — Rotation & Icebreaker Logic

> This document explains the two core algorithms powering the platform: the table rotation system and the AI icebreaker engine. Read PRODUCT.md first for full context.

---

## Part 1: The Rotation Algorithm

### 1.1 Goal

Given N attendees and T tables (with S seats per table), assign every attendee to a table each round such that:

1. Every person meets as many unique people as possible across rounds
2. No two people are seated at the same table more than once (for as long as possible)
3. Late joiners get included fairly from the round they arrive
4. Early exiters are removed cleanly without breaking other assignments
5. The organizer does zero manual coordination

### 1.2 The Core Problem

This is a variant of the **Social Golfer Problem** — a well-studied combinatorics problem. For our MVP case of 40 people, 10 tables, 4 seats per table, here's what's mathematically possible:

- Each round: every person meets 3 new people (their 3 tablemates)
- After round 1: each person has met 3 people
- After round 2: ideally met 6 unique people (3 more)
- After round N: ideally met 3N unique people
- With 40 people, you can theoretically have up to 13 rounds before all unique pairings are exhausted

In practice, perfect round-robin scheduling for groups of 4 is hard to compute in real time. We use a **weighted scoring approach** that gets very close to optimal without needing to solve NP-hard combinatorics exactly.

### 1.3 Algorithm: Weighted Pairing Score

#### Setup

```
attendees = list of active attendees (status = 'arrived')
meeting_history = dict of {(attendee_a_id, attendee_b_id): times_met}
                  — initialized to 0 for all pairs, updated after each round
```

#### Step-by-step for each new round

**Step 1: Filter active attendees**
```
active = [a for a in attendees if a.status == 'arrived']
```

**Step 2: Handle uneven numbers**
```
If len(active) % seats_per_table != 0:
    Pad with "ghost" placeholder seats until divisible
    Ghost seats don't get icebreaker questions
    Attendees at a table with a ghost seat get a bonus: they'll meet more real people sooner
```

**Step 3: Shuffle with bias**

Do NOT randomly shuffle. Use a biased shuffle:

```
For each attendee, calculate their "meeting score":
    score = number of unique people they have met so far

Sort attendees by score ascending (people who've met fewer people go first)
Add small random jitter to avoid deterministic patterns
```

This ensures people who joined late or missed rounds aren't perpetually behind.

**Step 4: Greedy table assignment**

```
tables = [[] for _ in range(num_tables)]
unassigned = sorted_attendees (from step 3)

For each attendee in unassigned:
    Find the table where:
        - Table is not full (len < seats_per_table)
        - The sum of meeting_history[(attendee, existing_tablemate)] is LOWEST
          i.e., this person has met the fewest of the people already at that table
    Assign attendee to that table
```

This greedy approach won't always find the globally optimal assignment, but it performs well in practice for 40 people and runs in milliseconds.

**Step 5: Update meeting history**

```
After each round completes:
For each table in that round:
    For each pair (a, b) at that table:
        meeting_history[(min(a,b), max(a,b))] += 1
```

Always store pairs in canonical order (smaller ID first) to avoid duplicate keys.

### 1.4 Handling Edge Cases

#### Late joiner

```
When a new attendee arrives mid-event:
1. Add them to the active list
2. Their meeting_history starts empty (score = 0)
3. On the NEXT round start, they get assigned a table normally
4. The algorithm's bias toward low-meeting-score people ensures they get high-value placements
```

If a round is already in progress when they join, they see: "You've been added! Your first table assignment starts next round."

#### Early exit

```
When an attendee marks themselves as 'left' (or organizer marks them):
1. Remove from active list immediately
2. Their past meetings are preserved in meeting_history (don't erase history)
3. On next round: their seat is treated as a ghost seat
4. If mid-round: their tablemates see a notification "One person has left this table"
```

#### Odd numbers

```
If active count doesn't divide evenly by seats_per_table:
    Option A (preferred): Allow one table to have (seats_per_table - 1) people
    Option B: Add a ghost/empty seat
    
Never force 5 people at a 4-seat table — it breaks the pairing math
```

### 1.5 Pseudocode (Full Round Generation)

```python
def generate_round(event_id, round_number):
    active_attendees = get_active_attendees(event_id)
    meeting_history = get_meeting_history(event_id)
    num_tables = event.num_tables
    seats = event.seats_per_table

    # Score each attendee
    for attendee in active_attendees:
        attendee.meet_score = count_unique_meetings(attendee, meeting_history)

    # Sort by meet_score ascending + jitter
    sorted_attendees = sorted(
        active_attendees,
        key=lambda a: a.meet_score + random.uniform(0, 0.5)
    )

    # Initialize empty tables
    tables = {i: [] for i in range(1, num_tables + 1)}

    # Greedy assignment
    for attendee in sorted_attendees:
        best_table = None
        best_score = float('inf')

        for table_num, seated in tables.items():
            if len(seated) >= seats:
                continue
            overlap = sum(
                meeting_history.get(
                    make_pair_key(attendee.id, s.id), 0
                )
                for s in seated
            )
            if overlap < best_score:
                best_score = overlap
                best_table = table_num

        tables[best_table].append(attendee)

    # Save assignments
    save_table_assignments(event_id, round_number, tables)

    # Update meeting history
    update_meeting_history(event_id, tables)

    return tables


def make_pair_key(id_a, id_b):
    return (min(id_a, id_b), max(id_a, id_b))
```

### 1.6 Performance for MVP Scale

For 40 attendees:
- Number of unique pairs: 40 × 39 / 2 = 780 pairs
- Meeting history dict size: 780 entries
- Round generation time: < 50ms on any server

This algorithm scales comfortably to 300 attendees without optimization. Beyond 300, consider pre-computing rounds rather than generating on demand.

---

## Part 2: The AI Icebreaker Engine

### 2.1 Goal

At the start of each round, every attendee at a table receives a **personalized icebreaker question** on their phone. The question is:

- Directed at a specific tablemate (not generic)
- Based on what both people do and what they're looking for
- Different for each of the 4 people at the table
- Conversational and warm, not formal or corporate

### 2.2 What Data We Have Per Attendee

At sign-up, each attendee provides:
- `name` — their full name
- `role` — what they do ("Founder at XYZ startup", "Product Manager at ABC")
- `looking_for` — who they want to meet ("investors", "co-founders", "designers", "engineers")

This is enough context for the LLM to generate relevant questions.

### 2.3 Icebreaker Generation Flow

**Trigger:** Organizer clicks "Start Round" → round assignments are saved → icebreaker generation is called per table.

**For each table:**

```
Input:
- List of 4 attendees with their name, role, looking_for

Process:
- Call Claude API once per table (4 questions in one API call)
- Prompt asks for one targeted question per person, directed at one of their tablemates

Output:
- 4 question objects: {recipient_id, target_id, question_text}
```

### 2.4 LLM Prompt Template

```
System:
You are helping facilitate networking at a professional event. 
Your job is to generate one personalized icebreaker question for each 
person at a table, directed at a specific tablemate.

Rules:
- Each question must be directed AT one specific person (the target)
- The question should help the recipient start a real conversation with the target
- Keep questions short: one sentence, conversational, warm
- Questions should be based on what people do and what they're looking for
- Do not be generic (avoid "what brings you here?" or "what do you do?")
- Each person at the table should have a different target
- Return only valid JSON, no extra text

User:
Here are the 4 people at this table:

Person A: {name: "Harshith", role: "Data engineer + content creator", looking_for: "founders building in AI"}
Person B: {name: "Priya", role: "Founder at a fintech startup", looking_for: "technical co-founders"}
Person C: {name: "Rohan", role: "Angel investor", looking_for: "early-stage startups in SaaS"}
Person D: {name: "Sneha", role: "UX designer at a product studio", looking_for: "startup teams to collaborate with"}

Generate one icebreaker question for each person (A, B, C, D).
Each question must be directed at a different tablemate.
Assign targets so that everyone is both a recipient and a target exactly once (a round-robin pair).

Return JSON in this exact format:
[
  {"recipient": "A", "target": "B", "question": "..."},
  {"recipient": "B", "target": "C", "question": "..."},
  {"recipient": "C", "target": "D", "question": "..."},
  {"recipient": "D", "target": "A", "question": "..."}
]
```

### 2.5 Example Output

Given the people above, expected output:

```json
[
  {
    "recipient": "A",
    "target": "B",
    "question": "Priya is building in fintech — ask her what the one regulatory headache she didn't expect when she started."
  },
  {
    "recipient": "B",
    "target": "C",
    "question": "Rohan has backed early-stage SaaS companies — ask him what a founder does in the first pitch that immediately loses his interest."
  },
  {
    "recipient": "C",
    "target": "D",
    "question": "Sneha works with startup teams on UX — ask her what the most common design mistake she sees founders make before they have a designer."
  },
  {
    "recipient": "D",
    "target": "A",
    "question": "Harshith runs both a technical career and a content creator side — ask him how he decides what's worth building vs what's worth talking about."
  }
]
```

### 2.6 How the Question Appears on the Attendee Screen

The attendee's screen shows:

```
Round 3 — Table 7

Your tablemates:
• Priya — Founder at a fintech startup
• Rohan — Angel investor
• Sneha — UX designer

Your icebreaker:
💬 "Priya is building in fintech — ask her what the one regulatory 
headache she didn't expect when she started."
```

The question is phrased to give the attendee a natural opener, not put them on the spot. It's actionable: they can literally read it out or use it as a starting point.

### 2.7 Fallback Handling

If the Claude API call fails or takes too long (> 3 seconds):

```
Fallback questions (generic but still directional):
- "Ask [target_name] what they're working on right now that most people don't know about yet."
- "Ask [target_name] what they wish they'd known before starting their current role."
- "Ask [target_name] what kind of connection would make tonight worth coming out for."
```

These are stored as static fallbacks and used if LLM generation fails. Never show a blank icebreaker.

### 2.8 API Call Timing

- Icebreaker generation is triggered immediately when organizer starts a round
- API call is async — attendee screens show table assignment first, icebreaker loads in 1–2 seconds
- If the event has 10 tables: 10 parallel API calls, each taking ~1–2 seconds
- Use `asyncio.gather()` in FastAPI to run all 10 calls concurrently

---

## Part 3: Integration Between the Two Systems

```
Organizer clicks "Start Round"
        │
        ▼
Backend: generate_round()
        │
        ├── Save TableAssignment rows to Supabase
        │
        ├── Trigger icebreaker generation (async, per table)
        │       │
        │       └── Save Icebreaker rows to Supabase as they complete
        │
        └── Supabase real-time fires to all connected attendee clients
                │
                ├── Attendee screen updates: shows new table number + tablemates
                │
                └── Icebreaker loads: appears 1–2 seconds after table assignment
```

---

## Part 4: Scaling Notes (Post-MVP Reference)

| Attendees | Tables | Pairs | Round gen time | API calls per round |
|---|---|---|---|---|
| 40 | 10 | 780 | < 50ms | 10 |
| 100 | 25 | 4,950 | < 200ms | 25 |
| 300 | 75 | 44,850 | ~500ms | 75 |

Beyond 100 attendees, consider:
- Pre-computing all rounds at event start rather than on demand
- Batching multiple tables into one LLM call (4 tables per call = 16 people, reduces API calls by 4x)
- Caching icebreakers per (attendee_pair) rather than regenerating if same pair meets again
