"""Icebreaker engine (Step 6).

Public surface:
    engine.generate_for_round    — batch-generate a round's icebreakers (background task)
    engine.refresh_for_attendee  — one fresh question for the "Generate Another" button
    provider.get_llm_client      — the configured LLM client (Vertex / stub / disabled)

All prompt text lives in prompts.py — nowhere else in the codebase.
"""
