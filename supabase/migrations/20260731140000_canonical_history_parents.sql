-- Canonical hydration includes tombstoned parents required by active historical sessions.

create function public.get_cloud_workspace_v2()
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_workspace jsonb;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  v_workspace := public.get_cloud_workspace();
  v_workspace := jsonb_set(v_workspace, '{tasks}', coalesce((
    select jsonb_agg(to_jsonb(t) - 'user_id' order by t.rank, t.id)
    from public.tasks t where t.user_id = v_user and (
      t.deleted_at is null or exists (
        select 1 from public.activity_sessions s
        where s.user_id = v_user and s.deleted_at is null and s.linked_task_id = t.id
      )
    )
  ), '[]'::jsonb));
  v_workspace := jsonb_set(v_workspace, '{habits}', coalesce((
    select jsonb_agg(to_jsonb(h) - 'user_id' order by h.created_at, h.id)
    from public.habits h where h.user_id = v_user and (
      h.deleted_at is null or exists (
        select 1 from public.activity_sessions s
        where s.user_id = v_user and s.deleted_at is null and s.linked_habit_id = h.id
      )
    )
  ), '[]'::jsonb));
  v_workspace := jsonb_set(v_workspace, '{activity_intents}', coalesce((
    select jsonb_agg(to_jsonb(i) - 'user_id' order by i.created_at, i.id)
    from public.activity_intents i where i.user_id = v_user and (
      i.deleted_at is null or exists (
        select 1 from public.activity_sessions s
        where s.user_id = v_user and s.deleted_at is null and s.linked_intent_id = i.id
      )
    )
  ), '[]'::jsonb));
  return v_workspace;
end;
$$;

revoke all on function public.get_cloud_workspace_v2() from public, anon, authenticated;
grant execute on function public.get_cloud_workspace_v2() to authenticated;

comment on function public.get_cloud_workspace_v2()
  is 'Owner-scoped canonical Phase B2 payload including tombstoned parents referenced by historical sessions.';
