-- 07-done-receipt-insert-gate.sql
-- Companion to 06-done-receipt-gate.sql (BB-2026-09-23-done-receipt).
-- 06 gates the UPDATE path (status changing to succeeded). This closes the INSERT
-- path: a plan can never be created already 'succeeded', so every succeeded plan
-- must pass through 06's receipt check. write_plan never sets status (rows default
-- to draft), so normal plan creation is unaffected.
-- Found in external DA review 2026-09-23 (probe INSERT with status='succeeded' was
-- accepted; rolled back). Applied via Supabase migration plans_done_receipt_insert_gate.

create or replace function public.plans_done_receipt_insert_gate()
returns trigger language plpgsql as $$
begin
  if new.status = 'succeeded' then
    raise exception 'done-receipt rule 0: a plan cannot be created already succeeded -- create it (draft/queued/running), then flip it to succeeded with a done_receipt';
  end if;
  return new;
end;
$$;

drop trigger if exists plans_done_receipt_insert_gate_trigger on public.plans;
create trigger plans_done_receipt_insert_gate_trigger
  before insert on public.plans
  for each row when (new.status = 'succeeded')
  execute function public.plans_done_receipt_insert_gate();
