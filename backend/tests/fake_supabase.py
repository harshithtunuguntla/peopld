"""In-memory fake of the Supabase client query builder.

Supports the subset of the API the app uses:
    table(name).select(...).eq(...).order(...).limit(...).execute()
    table(name).insert(row_or_rows).execute()
    table(name).update(changes).eq(...).execute()
    table(name).delete().eq(...).execute()
    auth.get_user(token)  (tokens registered via register_token())

Lets the whole test suite run with no Supabase project, no network, no env.
"""

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace


class FakeResult:
    def __init__(self, data, count=None):
        self.data = data
        self.count = count


class FakeQuery:
    def __init__(self, rows: list):
        self._rows = rows  # live reference to the table's row list
        self._filters: list[tuple] = []
        self._neq_filters: list[tuple] = []
        self._in_filters: list[tuple] = []
        self._order = None
        self._limit = None
        self._op = "select"
        self._payload = None
        self._count = False
        self._conflict = None

    # --- builder methods (chainable) ---

    def select(self, *_cols, count=None):
        self._op = "select"
        self._count = count == "exact"
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload
        return self

    def upsert(self, payload, on_conflict=None):
        self._op = "upsert"
        self._payload = payload
        self._conflict = on_conflict
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = payload
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, column, value):
        self._filters.append((column, value))
        return self

    def neq(self, column, value):
        self._neq_filters.append((column, value))
        return self

    def in_(self, column, values):
        self._in_filters.append((column, [str(v) for v in values]))
        return self

    def order(self, column, desc: bool = False):
        self._order = (column, desc)
        return self

    def limit(self, n: int):
        self._limit = n
        return self

    # --- terminal ---

    def execute(self) -> FakeResult:
        if self._op == "insert":
            payloads = self._payload if isinstance(self._payload, list) else [self._payload]
            inserted = []
            for p in payloads:
                row = dict(p)
                row.setdefault("id", str(uuid.uuid4()))
                row.setdefault("created_at", datetime.now(timezone.utc).isoformat())
                self._rows.append(row)
                inserted.append(dict(row))
            return FakeResult(inserted)

        if self._op == "upsert":
            payloads = self._payload if isinstance(self._payload, list) else [self._payload]
            result = []
            for p in payloads:
                existing = None
                if self._conflict:
                    existing = next(
                        (r for r in self._rows if str(r.get(self._conflict)) == str(p.get(self._conflict))),
                        None,
                    )
                if existing is not None:
                    existing.update(p)
                    result.append(dict(existing))
                else:
                    row = dict(p)
                    row.setdefault("id", str(uuid.uuid4()))
                    row.setdefault("created_at", datetime.now(timezone.utc).isoformat())
                    self._rows.append(row)
                    result.append(dict(row))
            return FakeResult(result)

        matched = [
            r for r in self._rows
            if all(str(r.get(col)) == str(val) for col, val in self._filters)
            and all(str(r.get(col)) != str(val) for col, val in self._neq_filters)
            and all(str(r.get(col)) in vals for col, vals in self._in_filters)
        ]

        if self._op == "update":
            for r in matched:
                r.update(self._payload)
            return FakeResult([dict(r) for r in matched])

        if self._op == "delete":
            for r in matched:
                self._rows.remove(r)
            return FakeResult([dict(r) for r in matched])

        total = len(matched)  # count="exact" reports total matches, ignoring limit
        if self._order:
            col, desc = self._order
            matched = sorted(matched, key=lambda r: str(r.get(col) or ""), reverse=desc)
        if self._limit is not None:
            matched = matched[: self._limit]
        return FakeResult([dict(r) for r in matched], count=total if self._count else None)


class FakeAuth:
    """Mimics supabase client.auth for JWT verification in tests."""

    def __init__(self):
        self._tokens: dict[str, SimpleNamespace] = {}

    def get_user(self, token: str):
        user = self._tokens.get(token)
        if user is None:
            raise Exception("Invalid token")
        return SimpleNamespace(user=user)


class FakeSupabase:
    def __init__(self):
        self.store: dict[str, list] = {}
        self.auth = FakeAuth()

    def table(self, name: str) -> FakeQuery:
        return FakeQuery(self.store.setdefault(name, []))

    # --- test helpers ---

    def register_token(self, token: str, user_id: str, email: str = "user@test.local", role: str | None = None) -> None:
        """Make auth.get_user(token) resolve to this user."""
        self.auth._tokens[token] = SimpleNamespace(
            id=user_id, email=email, app_metadata={"role": role} if role else {}
        )

    def seed(self, table: str, *rows: dict) -> list[dict]:
        """Insert rows directly, filling in id/created_at. Returns the stored rows."""
        stored = []
        for row in rows:
            r = dict(row)
            r.setdefault("id", str(uuid.uuid4()))
            r.setdefault("created_at", datetime.now(timezone.utc).isoformat())
            self.store.setdefault(table, []).append(r)
            stored.append(r)
        return stored
