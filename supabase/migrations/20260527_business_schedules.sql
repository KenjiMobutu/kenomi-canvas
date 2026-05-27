create table if not exists public.business_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  schedule_key text not null,
  label text not null,
  status text not null check (status in ('active', 'paused')),
  interval_minutes integer not null check (interval_minutes > 0),
  last_enqueued_at timestamptz null,
  last_completed_at timestamptz null,
  next_run_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists business_schedules_user_key_idx
  on public.business_schedules(user_id, schedule_key);

alter table public.business_schedules enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'business_schedules'
      and policyname = 'business_schedules_own'
  ) then
    create policy business_schedules_own on public.business_schedules
      for all
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;

grant all on public.business_schedules to authenticated;
grant all on public.business_schedules to service_role;
