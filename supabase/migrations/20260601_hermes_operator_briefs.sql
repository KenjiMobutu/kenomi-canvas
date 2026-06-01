create table if not exists public.hermes_operator_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null references public.hermes_operator_runs(id) on delete cascade,
  summary text not null default '',
  cash_delta_7d numeric(12,2) not null default 0,
  top_blocker text not null default '',
  top_opportunity text not null default '',
  best_offer text not null default '',
  best_segment text not null default '',
  best_source text not null default '',
  main_leak text not null default '',
  next_best_action text not null default '',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists hermes_operator_briefs_user_created_idx
  on public.hermes_operator_briefs (user_id, created_at desc);

alter table public.hermes_operator_briefs enable row level security;

drop policy if exists "hermes_operator_briefs_select_own" on public.hermes_operator_briefs;
create policy "hermes_operator_briefs_select_own"
  on public.hermes_operator_briefs
  for select
  using (auth.uid() = user_id);

drop policy if exists "hermes_operator_briefs_insert_own" on public.hermes_operator_briefs;
create policy "hermes_operator_briefs_insert_own"
  on public.hermes_operator_briefs
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "hermes_operator_briefs_update_own" on public.hermes_operator_briefs;
create policy "hermes_operator_briefs_update_own"
  on public.hermes_operator_briefs
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.hermes_operator_briefs to authenticated;
grant select, insert, update on public.hermes_operator_briefs to service_role;
