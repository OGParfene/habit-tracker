-- Apply to a dedicated Supabase project. Frontend uses publishable key only.
create table if not exists public.habit_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (length(key) <= 150 and key ~ '^(habit/[a-zA-Z0-9-]+|entry/[0-9]{4}-[0-9]{2}-[0-9]{2}/[a-zA-Z0-9-]+|note/[0-9]{4}-[0-9]{2}-[0-9]{2})$'),
  value jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key),
  constraint value_size check (octet_length(value::text) <= 100000)
);
alter table public.habit_records enable row level security;
revoke all on public.habit_records from anon;
grant select, insert, update, delete on public.habit_records to authenticated;
create policy "Read own habit records" on public.habit_records for select to authenticated using ((select auth.uid()) = user_id);
create policy "Insert own habit records" on public.habit_records for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own habit records" on public.habit_records for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own habit records" on public.habit_records for delete to authenticated using ((select auth.uid()) = user_id);
-- Tombstones (value=null) are retained so offline devices cannot resurrect deletions.
-- Newest record wins; updates to different habits/days merge independently.
create or replace function public.sync_habit_records(incoming jsonb)
returns setof public.habit_records
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(incoming) <> 'array' or jsonb_array_length(incoming) > 100000 then raise exception 'Invalid records'; end if;
  insert into public.habit_records as existing (user_id,key,value,updated_at)
  select auth.uid(), r.key, r.value, least(r.updated_at, now() + interval '5 minutes')
  from jsonb_to_recordset(incoming) as r(key text, value jsonb, updated_at timestamptz)
  on conflict (user_id,key) do update set value=excluded.value, updated_at=excluded.updated_at
  where excluded.updated_at > existing.updated_at;
  return query select * from public.habit_records where user_id=auth.uid();
end;
$$;
revoke all on function public.sync_habit_records(jsonb) from public, anon;
grant execute on function public.sync_habit_records(jsonb) to authenticated;
