create table if not exists public.fulfillment_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  venture_id uuid references public.ventures(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete set null,
  provider text not null default 'n8n',
  status text not null default 'pending',
  customer_email text,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint fulfillment_deliveries_status_check
    check (status in ('pending', 'running', 'completed', 'failed', 'cancelled'))
);

create index if not exists fulfillment_deliveries_user_created_idx
  on public.fulfillment_deliveries(user_id, created_at desc);

create index if not exists fulfillment_deliveries_venture_created_idx
  on public.fulfillment_deliveries(venture_id, created_at desc);

alter table public.fulfillment_deliveries enable row level security;

drop policy if exists "fulfillment_deliveries_select_own" on public.fulfillment_deliveries;
create policy "fulfillment_deliveries_select_own"
  on public.fulfillment_deliveries
  for select
  using (auth.uid() = user_id);

drop policy if exists "fulfillment_deliveries_service_all" on public.fulfillment_deliveries;
create policy "fulfillment_deliveries_service_all"
  on public.fulfillment_deliveries
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
