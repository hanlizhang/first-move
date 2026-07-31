-- Preserve historical task/habit rewards whose local parent or completion was later removed.
-- The wrapper keeps the existing trusted import atomic and applies tombstones before commit.

create or replace view public.active_days with (security_invoker = true) as
select user_id, local_date from public.task_completions where deleted_at is null
union
select user_id, local_date from public.habit_completions where deleted_at is null
union
select user_id, local_date from public.activity_sessions where deleted_at is null and status in ('completed', 'stopped') and actual_elapsed_ms >= 60000
union
select user_id, local_date from public.journal_entries where deleted_at is null
union
select user_id, local_date from public.morning_checks
union
select user_id, local_date from public.reward_ledger where source_type in ('task', 'habit', 'morning', 'reflection');

create function public.initialize_cloud_workspace_v2(
  p_choice public.import_choice,
  p_device_id uuid,
  p_snapshot_sha256 text,
  p_source_schema_version integer,
  p_timezone text,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

  perform public.initialize_cloud_workspace(
    p_choice, p_device_id, p_snapshot_sha256, p_source_schema_version, p_timezone, p_payload
  );

  update public.task_completions target set deleted_at = source.deleted_at
  from jsonb_to_recordset(coalesce(p_payload->'task_completions', '[]'::jsonb))
    as source(id uuid, deleted_at timestamptz)
  where target.user_id = v_user and target.id = source.id and source.deleted_at is not null;

  update public.habit_completions target set deleted_at = source.deleted_at
  from jsonb_to_recordset(coalesce(p_payload->'habit_completions', '[]'::jsonb))
    as source(id uuid, deleted_at timestamptz)
  where target.user_id = v_user and target.id = source.id and source.deleted_at is not null;

  update public.tasks target set deleted_at = source.deleted_at
  from jsonb_to_recordset(coalesce(p_payload->'tasks', '[]'::jsonb))
    as source(id uuid, deleted_at timestamptz)
  where target.user_id = v_user and target.id = source.id and source.deleted_at is not null;

  update public.habits target set deleted_at = source.deleted_at
  from jsonb_to_recordset(coalesce(p_payload->'habits', '[]'::jsonb))
    as source(id uuid, deleted_at timestamptz)
  where target.user_id = v_user and target.id = source.id and source.deleted_at is not null;

  update public.activity_sessions target set deleted_at = source.deleted_at
  from jsonb_to_recordset(coalesce(p_payload->'activity_sessions', '[]'::jsonb))
    as source(id uuid, deleted_at timestamptz)
  where target.user_id = v_user and target.id = source.id and source.deleted_at is not null;

  update public.activity_intents target set status = 'consumed', deleted_at = source.deleted_at
  from jsonb_to_recordset(coalesce(p_payload->'activity_intents', '[]'::jsonb))
    as source(id uuid, deleted_at timestamptz)
  where target.user_id = v_user and target.id = source.id and source.deleted_at is not null;

  update public.journal_entries target set deleted_at = source.deleted_at
  from jsonb_to_recordset(coalesce(p_payload->'journal_entries', '[]'::jsonb))
    as source(id uuid, deleted_at timestamptz)
  where target.user_id = v_user and target.id = source.id and source.deleted_at is not null;

  return public.get_cloud_workspace();
end;
$$;

revoke all on function public.initialize_cloud_workspace_v2(public.import_choice, uuid, text, integer, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.initialize_cloud_workspace_v2(public.import_choice, uuid, text, integer, text, jsonb)
  to authenticated;

comment on function public.initialize_cloud_workspace_v2(public.import_choice, uuid, text, integer, text, jsonb)
  is 'Atomic Phase B2 import wrapper that preserves reward-only task/habit completions as owner-scoped tombstones.';
