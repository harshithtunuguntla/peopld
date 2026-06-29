// Generic, field-agnostic people search. The engine knows nothing about which
// fields exist — each caller passes a list of field accessors + weights, so the
// same code powers the rolodex, the event directory, and the cross-event list,
// and picks up new searchable fields with a one-line config change (no per-keyword
// or per-field logic baked in).

/** One searchable field: how to read it off an item, and how much a hit counts. */
export interface FieldSpec<T> {
  get: (item: T) => string | string[] | null | undefined;
  weight: number;
}

/** Split a raw query into lowercased terms (used by the engine and by highlighting). */
export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function toText(v: string | string[] | null | undefined): string {
  if (!v) return "";
  return (Array.isArray(v) ? v.join(" ") : v).toLowerCase();
}

/**
 * Filter + rank `items` against `query` over the given `fields`.
 *
 * Matching: every query term must appear in at least one field (AND across terms,
 * OR across fields) — so "founder design" finds people who are founders AND have
 * design somewhere. A term matches as a substring, so "dev" finds "developer".
 *
 * Ranking: each term scores the weight of the strongest field it hit; items are
 * ordered by total score (so a name hit outranks an interest hit). Ties keep the
 * caller's original order, preserving page defaults like "matches first".
 *
 * An empty query returns the list unchanged (same reference order).
 */
export function searchItems<T>(items: T[], query: string, fields: FieldSpec<T>[]): T[] {
  const terms = tokenize(query);
  if (terms.length === 0) return items;

  const scored: { item: T; score: number; order: number }[] = [];
  items.forEach((item, order) => {
    const fieldTexts = fields.map((f) => ({ text: toText(f.get(item)), weight: f.weight }));
    let total = 0;
    let allMatched = true;
    for (const term of terms) {
      let best = 0;
      for (const ft of fieldTexts) {
        if (ft.text && ft.text.includes(term)) best = Math.max(best, ft.weight);
      }
      if (best === 0) {
        allMatched = false;
        break;
      }
      total += best;
    }
    if (allMatched) scored.push({ item, score: total, order });
  });

  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.map((s) => s.item);
}
