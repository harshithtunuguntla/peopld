from fastapi import Header, HTTPException


async def get_current_organizer_id(
    x_organizer_id: str | None = Header(default=None, alias="X-Organizer-Id"),
) -> str:
    """Temporary dev auth: organizer UUID passed via X-Organizer-Id header.

    Step 3 replaces this body with Supabase JWT verification —
    endpoints depending on it will not need to change.
    """
    if not x_organizer_id:
        raise HTTPException(
            status_code=401,
            detail="Missing X-Organizer-Id header (temporary dev auth, replaced in Step 3)",
        )
    return x_organizer_id
