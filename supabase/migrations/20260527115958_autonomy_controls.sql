create table if not exists public.autonomy_controls (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'paused')),
  reason text null,
  max_scheduler_jobs_per_run integer not null default 10 check (
    max_scheduler_jobs_per_run between 1 and 20
  ),
  max_worker_jobs_per_drain integer not null default 10 check (
    max_worker_jobs_per_drain between 1 and 10
  ),
  paused_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.autonomy_controls enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'autonomy_controls'
      and policyname = 'autonomy_controls_own'
  ) then
    create policy autonomy_controls_own on public.autonomy_controls
      for all
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;

grant all on public.autonomy_controls to authenticated;
grant all on public.autonomy_controls to service_role;
