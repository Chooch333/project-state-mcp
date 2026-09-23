-- 06-done-receipt-gate.sql
-- BB-2026-09-23-done-receipt
-- Applied live via Supabase MCP apply_migration on 2026-09-23, project ujditldbqdiqigazkcak.
-- Adds a database-enforced gate on plans.status: a row may not flip to 'succeeded'
-- unless a valid "done receipt" is attached. A tool-only check would be bypassable
-- (any caller with DB access could set status='succeeded' directly), so the gate
-- lives here as a BEFORE UPDATE trigger, not in application code.
--
-- Adds done_receipt (jsonb) and started_at (timestamptz) to plans.
-- Trigger fires only when NEW.status IS DISTINCT FROM OLD.status:
--   - status -> 'running': stamps started_at (once) regardless of caller.
--   - status -> 'succeeded': enforces five rules against executor_report /
--     done_receipt, raising an exception naming the failing rule; on success
--     stamps completed_at (once).
-- Kept here as a historical record alongside 02-migration.sql and
-- 05-canonical-lifecycle-migration.sql — do not re-run.

-- 1. Add done_receipt and started_at columns to plans
ALTER TABLE public.plans
  ADD COLUMN done_receipt jsonb,
  ADD COLUMN started_at timestamptz;

-- 2. Trigger function enforcing the done-receipt gate
CREATE OR REPLACE FUNCTION public.plans_done_receipt_gate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_acceptance    jsonb;
  v_item          jsonb;
  v_result        text;
  v_evidence      text;
  v_follow_up     text;
  v_follow_up_id  uuid;
  v_session_log   text;
  v_cutoff        timestamptz;
  v_disclosures   jsonb;
  v_disclosure    text;
BEGIN
  -- Stamp started_at the first time a plan moves to 'running',
  -- regardless of caller (MCP tool or raw SQL) since this is a trigger.
  IF NEW.status = 'running' AND NEW.started_at IS NULL THEN
    NEW.started_at := now();
  END IF;

  IF NEW.status = 'succeeded' THEN

    -- Rule 1: executor_report must be present and non-empty (after trim)
    IF NEW.executor_report IS NULL OR btrim(NEW.executor_report) = '' THEN
      RAISE EXCEPTION 'done-receipt rule 1: executor_report is missing or empty';
    END IF;

    -- Rule 2: done_receipt must be present with a non-empty acceptance array
    IF NEW.done_receipt IS NULL
       OR NEW.done_receipt->'acceptance' IS NULL
       OR jsonb_typeof(NEW.done_receipt->'acceptance') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'done-receipt rule 2: done_receipt is missing or has no acceptance array';
    END IF;

    v_acceptance := NEW.done_receipt->'acceptance';

    IF jsonb_array_length(v_acceptance) = 0 THEN
      RAISE EXCEPTION 'done-receipt rule 2: done_receipt is missing or has no acceptance array';
    END IF;

    -- Rule 3: every acceptance element must be a resolved pass or a valid hand-off
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_acceptance)
    LOOP
      v_result := v_item->>'result';

      IF v_result = 'pass' THEN
        v_evidence := v_item->>'evidence';
        IF v_evidence IS NULL OR btrim(v_evidence) = '' THEN
          RAISE EXCEPTION 'done-receipt rule 3: an acceptance item marked pass has no evidence';
        END IF;

      ELSIF v_result = 'handed-off' THEN
        v_follow_up := v_item->>'follow_up_plan';
        IF v_follow_up IS NULL OR btrim(v_follow_up) = '' THEN
          RAISE EXCEPTION 'done-receipt rule 3: an acceptance item marked handed-off has no follow_up_plan';
        END IF;

        BEGIN
          v_follow_up_id := v_follow_up::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
          RAISE EXCEPTION 'done-receipt rule 3: an acceptance item''s follow_up_plan is not a valid uuid';
        END;

        IF NOT EXISTS (
          SELECT 1 FROM public.plans p
          WHERE p.id = v_follow_up_id
            AND p.id != NEW.id
            AND p.status IN ('draft','queued','running','blocked')
        ) THEN
          RAISE EXCEPTION 'done-receipt rule 3: an acceptance item''s follow_up_plan does not resolve to an open plan';
        END IF;

      ELSE
        RAISE EXCEPTION 'done-receipt rule 3: an acceptance item has a result other than pass or handed-off';
      END IF;
    END LOOP;

    -- Rule 4: session_log must resolve to a status_snapshots or notes display_id
    -- in the same project, created at or after the plan started (or was queued)
    v_session_log := NEW.done_receipt->>'session_log';

    IF v_session_log IS NULL OR btrim(v_session_log) = '' THEN
      RAISE EXCEPTION 'done-receipt rule 4: done_receipt is missing session_log';
    END IF;

    v_cutoff := COALESCE(NEW.started_at, NEW.queued_at);

    IF NOT (
      EXISTS (
        SELECT 1 FROM public.status_snapshots s
        WHERE s.display_id = v_session_log
          AND s.project_id = NEW.project_id
          AND s.created_at >= v_cutoff
      )
      OR EXISTS (
        SELECT 1 FROM public.notes n
        WHERE n.display_id = v_session_log
          AND n.project_id = NEW.project_id
          AND n.created_at >= v_cutoff
      )
    ) THEN
      RAISE EXCEPTION 'done-receipt rule 4: session_log does not match a status_snapshots or notes entry for this project created after the plan started';
    END IF;

    -- Rule 5 (optional): every disclosure must match a build_questions display_id for this plan
    v_disclosures := NEW.done_receipt->'disclosures';

    IF v_disclosures IS NOT NULL AND jsonb_typeof(v_disclosures) = 'array' THEN
      IF jsonb_array_length(v_disclosures) > 0 THEN
        FOR v_disclosure IN SELECT * FROM jsonb_array_elements_text(v_disclosures) LOOP
          IF NOT EXISTS (
            SELECT 1 FROM public.build_questions bq
            WHERE bq.display_id = v_disclosure
              AND bq.plan_id = NEW.id
          ) THEN
            RAISE EXCEPTION 'done-receipt rule 5: disclosure % does not match a build_questions display_id for this plan', v_disclosure;
          END IF;
        END LOOP;
      END IF;
    END IF;

    -- All rules satisfied: stamp completed_at if not already set
    IF NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

-- 3. Trigger: fires only when status actually changes
DROP TRIGGER IF EXISTS plans_done_receipt_gate_trigger ON public.plans;

CREATE TRIGGER plans_done_receipt_gate_trigger
  BEFORE UPDATE ON public.plans
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.plans_done_receipt_gate();
