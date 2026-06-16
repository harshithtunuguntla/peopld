-- Migration 003 — Rotation Algorithm v2 (re-planning optimizer). Run AFTER 002.
-- Adds: organizer's intended round count, and a per-event PLAN CACHE so the
-- re-planning engine can "plan once, follow it, re-plan only on roster change."
-- Spec: docs/design/rotation-replanning.md

-- How many rounds the organizer intends to run. NULL = let the engine pick the
-- room's novelty ceiling. Used as the planning horizon.
ALTER TABLE events
  ADD COLUMN target_rounds INTEGER;

-- The cached multi-round plan for an event. Like round_drafts: deliberately NOT
-- client-readable (no RLS policies) and NOT in the realtime publication.
-- UNIQUE(event_id) = one active plan per event. `plan` is the remaining rounds
-- as [ {attendee_id: table_number}, ... ]; plan[0] corresponds to
-- horizon_start_round. A plan is followed while planned_for_hash still matches
-- the live arrived-set + table config; any change forces a re-plan.
CREATE TABLE round_plans (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id            UUID NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  planned_for_hash    TEXT NOT NULL,            -- arrived set + table config the plan was built for
  horizon_start_round INTEGER NOT NULL,         -- round number plan[0] seats
  plan                JSONB NOT NULL,           -- [ {attendee_id: table_number}, ... ] remaining rounds
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE round_plans ENABLE ROW LEVEL SECURITY;
-- no policies on purpose: service-role (backend) access only
