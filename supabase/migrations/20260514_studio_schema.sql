-- =====================================================================
-- Kenomi Studio — Schema initial
-- Coller dans Supabase Studio > SQL Editor et exécuter
-- =====================================================================

-- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);

-- user_settings (Ollama config per user)
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ollama_base_url text default 'http://192.168.0.14:11434',
  ollama_model text default 'qwen3:8b',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
create policy "settings_all_own" on public.user_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- trigger auto-create profile + settings à l'inscription
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  insert into public.user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- conversations
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nouvelle conversation',
  agent_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.conversations enable row level security;
create policy "conv_all_own" on public.conversations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- messages
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;
create policy "msg_all_own" on public.messages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists messages_conv_created_idx on public.messages(conversation_id, created_at);

-- documents
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);
alter table public.documents enable row level security;
create policy "doc_all_own" on public.documents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- agents
create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  system_prompt text not null default 'You are a helpful assistant.',
  model text not null default 'qwen3:8b',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.agents enable row level security;
create policy "agent_all_own" on public.agents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- automations
create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  trigger_type text not null default 'manual',
  webhook_url text,
  is_enabled boolean not null default true,
  last_run_at timestamptz,
  run_count integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.automations enable row level security;
create policy "auto_all_own" on public.automations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- api_keys
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.api_keys enable row level security;
create policy "key_all_own" on public.api_keys for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- storage bucket documents (privé)
insert into storage.buckets (id, name, public) values ('documents','documents', false) on conflict do nothing;

create policy "docs_select_own" on storage.objects for select
  using (bucket_id='documents' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "docs_insert_own" on storage.objects for insert
  with check (bucket_id='documents' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "docs_update_own" on storage.objects for update
  using (bucket_id='documents' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "docs_delete_own" on storage.objects for delete
  using (bucket_id='documents' and auth.uid()::text = (storage.foldername(name))[1]);

revoke execute on function public.handle_new_user() from public, anon, authenticated;
