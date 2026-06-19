# Event Metrics — what every number means

This is the single source of truth for **how each number in the product is
computed and what it counts**. It exists because the same word ("matches",
"connections") means different things on the **organizer** screens vs the
**attendee** screens — and those two numbers are *supposed* to differ. Read this
before adding a new stat anywhere so the surfaces stay consistent.

> TL;DR — there are **two perspectives**:
> - **Organizer / event-wide** (control room, post-event recap): counts the
>   *whole room*. Each thing is counted **once for the event**.
> - **Attendee / personal** (rolodex, cross-event connections): counts *your*
>   experience. The same event-wide event (e.g. a match) shows up for **both**
>   people involved.
>
> So "the organizer says 4 matches but I only see 2 in my rolodex" is **correct,
> not a bug** — see [Why the numbers differ](#why-organizer-and-attendee-numbers-differ).

---

## Glossary — the four signals

| Signal | Stored in | What it is | Direction | When |
|---|---|---|---|---|
| **Like** | `connection_likes` | You hearted a tablemate. Private — they aren't told. | One-way (you → them) | During / after a round |
| **Match** *(mutual like)* | derived from `connection_likes` | **Both** of you liked each other. Revealed in the rolodex as a "match". | Two-way | When the second like lands |
| **Wanted to meet** *(intent)* | `meeting_intents` | A **pre-event** pick that biases the seating algorithm to seat you together. If mutual, it's surfaced live ("you wanted to meet"). | One-way pick; can be mutual | Before the event |
| **Bookmark / Save** | `connection_bookmarks` | Your **private shortlist**. Powers the "Saved" filter. Independent of likes — you can save someone you didn't like, and vice-versa. | One-way (private to you) | Any time post-meeting |

A **match is just a mutual like.** There is no separate "double like" record — if
people say "double like" they mean a match (#2). Intent (#3) is a *different*
table and a *different* moment (pre-event seating influence), not a like.

---

## Organizer / event-wide metrics

Computed in `backend/app/routers/events.py`.

### `_likes_and_matches(event_id) -> (likes, matches)`
The shared helper behind both the live control room and the post-event recap.

- **`likes`** = number of distinct directed likes in the event
  = `len({(liker, liked) for each like})`.
  *(One person liking another counts 1; if they both like each other that's 2
  directed likes.)*
- **`matches`** = number of **mutual pairs**, counted **once per pair**
  = `count of (a,b) where a<b and both (a→b) and (b→a) exist`.

### Live control room — `GET /events/{id}/live-stats`
| Field | Formula |
|---|---|
| `registered` | count of attendee rows |
| `arrived` | attendees with `status == "arrived"` |
| `seated_now` | `table_assignments` rows for the **active** round |
| `not_seated` | `max(arrived − seated_now, 0)` |
| `likes_count` | `_likes_and_matches` likes (event-wide) |
| `matches_count` | `_likes_and_matches` matches (event-wide, once per pair) |
| `active_round_number` | the active round's number, else null |

### Post-event recap — `GET /events/{id}/analytics`
| Field | Formula |
|---|---|
| `total_attendees` | count of attendee rows |
| `rounds_completed` | rounds with `status == "completed"` |
| `avg_unique_people_met` | average over attendees of *distinct* tablemates met across all rounds. Built by grouping `table_assignments` by `(round, table)` and unioning each person's co-seated set. |
| `total_likes` | `_likes_and_matches` likes |
| `total_matches` | `_likes_and_matches` matches (once per pair) |
| `% of room met` *(derived in UI)* | `round(avg_unique_people_met / (total_attendees − 1) × 100)` |

---

## Attendee / personal metrics

Computed in `backend/app/routers/connections.py :: build_connection_entries`
(reused for the cross-event view in `routers/me.py`).

The `connections` list has **one entry per encounter** — i.e. per `(round,
table)` you shared with someone. If you sit with the same person in two rounds,
they appear **twice** in the list. **This is intentional**: the frontend collapses
the list by person and shows "met in rounds 1 & 3". But the **summary counts must
dedupe by person**, which is the bug fixed below.

### `GET /events/{id}/attendees/{me}/connections`
| Field | Formula |
|---|---|
| `total_people_met` | **distinct** people you were seated with = `len({attendee_id})` |
| `rounds_count` | distinct rounds you were seated in |
| `matches_count` | **distinct mutual people** = `len({attendee_id where mutual})` — *not* per-entry |
| `connections[]` | one entry per encounter; each carries `liked`, `mutual`, `saved`, `round_number`, `table_number` |

Per-entry flags:
- `liked` — *I* liked them.
- `mutual` — I liked them **and** they liked me (a match).
- `saved` — I bookmarked them.

### `GET /me/connections` (cross-event)
Aggregates `build_connection_entries` over every event you attended.
- `total_people_met` = distinct `attendee_id` across all entries. *(The same
  human at two different events has two attendee rows, so they count once per
  event — that's expected.)*
- `matches_count` = distinct **(event, person)** mutual pairs, so the same match
  seen across two rounds counts once, while a match at two different events counts
  for each.

---

## Why organizer and attendee numbers differ

They measure different things **on purpose**:

- **Matches.** The organizer counts each mutual pair **once for the event**. Each
  of the two people in that pair sees the match in **their own** rolodex. So if
  the event has 4 matches, the *sum* of everyone's personal `matches_count` is
  ~**8** (each match counted by both sides). Neither is wrong — they're different
  questions ("how many matches happened?" vs "how many matches do *I* have?").
- **Likes.** The organizer's `likes_count` is every directed like in the room. An
  attendee never sees an event-wide like total — only their own `liked`/`mutual`
  flags per person.
- **People met.** Organizer reports an **average** across the room
  (`avg_unique_people_met`); an attendee sees **their own** `total_people_met`.

If you ever need them to reconcile exactly, reconcile **like-for-like**: an
attendee's `matches_count` should equal the number of that person's mutual pairs,
and `sum(personal matches) == 2 × event matches`.

---

## The dedupe bug (fixed 2026-06-19)

**Symptom:** after an event with any **repeat pairing** (two people seated
together in more than one round), an attendee's `matches_count` was inflated
(e.g. showed 2 for a single match met twice), and the cross-event total likewise.

**Cause:** `matches_count` summed `entries` (one per encounter) instead of
counting unique people. `total_people_met` was already set-based and correct, so
only the match count drifted.

**Fix:** count **distinct** mutual people:
`len({attendee_id for entries if mutual})` (and `{(event, person)}` for the
cross-event view). The encounter-level list is unchanged; only the summary counts
were corrected.
