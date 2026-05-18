import fs from 'node:fs'

const expectedTables = [
  'agent_configs',
  'agent_runs',
  'autonomy_actions',
  'autonomy_jobs',
  'budget_requests',
  'campaign_drafts',
  'campaigns',
  'decisions',
  'human_approvals',
  'landing_pages',
  'payments',
  'venture_events',
  'venture_pipeline',
  'ventures',
]

const expectedColumns = [
  ['autonomy_actions', 'action_type'],
  ['autonomy_actions', 'output'],
  ['autonomy_actions', 'status'],
  ['autonomy_jobs', 'kind'],
  ['autonomy_jobs', 'last_error'],
  ['autonomy_jobs', 'status'],
  ['decisions', 'metrics_snapshot'],
  ['human_approvals', 'action_id'],
  ['human_approvals', 'status'],
  ['payments', 'autonomy_action_id'],
  ['payments', 'checkout_url'],
  ['payments', 'customer_email'],
  ['venture_events', 'event_type'],
  ['venture_events', 'metadata'],
  ['venture_events', 'value'],
]

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return {}

  return Object.fromEntries(
    fs
      .readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.trim().startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=')
        return [line.slice(0, index), line.slice(index + 1)]
      })
  )
}

const fileEnv = loadEnvFile('.env.local')
const supabaseUrl =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  fileEnv.SUPABASE_URL ??
  fileEnv.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? fileEnv.SUPABASE_SERVICE_ROLE_KEY
const anonKey =
  process.env.SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  fileEnv.SUPABASE_ANON_KEY ??
  fileEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !serviceRoleKey || !anonKey) {
  throw new Error(
    'SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and anon key are required'
  )
}

async function request(path, options = {}) {
  const response = await fetch(new URL(path, supabaseUrl), options)
  const text = await response.text()

  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${text.slice(0, 400)}`)
  }

  return text ? JSON.parse(text) : null
}

async function pgQuery(query) {
  return request('/pg/query', {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
}

function list(values) {
  return values.map((value) => `'${value.replaceAll("'", "''")}'`).join(', ')
}

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
}

await request('/rest/v1/', {
  headers: {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
  },
})
process.stdout.write('ok rest api\n')

await request('/auth/v1/settings', {
  headers: {
    apikey: anonKey,
  },
})
process.stdout.write('ok auth api\n')

const tableRows = await pgQuery(`
  select tablename, rowsecurity
  from pg_tables
  where schemaname = 'public'
    and tablename in (${list(expectedTables)})
  order by tablename;
`)

const foundTables = new Map(tableRows.map((row) => [row.tablename, row]))
for (const table of expectedTables) {
  const row = foundTables.get(table)
  if (!row) fail(`missing table public.${table}`)
  if (row && !row.rowsecurity) fail(`rls disabled on public.${table}`)
}

const columnRows = await pgQuery(`
  select table_name, column_name
  from information_schema.columns
  where table_schema = 'public'
    and (table_name, column_name) in (${expectedColumns
      .map(([table, column]) => `('${table}', '${column}')`)
      .join(', ')})
  order by table_name, column_name;
`)

const foundColumns = new Set(columnRows.map((row) => `${row.table_name}.${row.column_name}`))
for (const [table, column] of expectedColumns) {
  if (!foundColumns.has(`${table}.${column}`)) fail(`missing column public.${table}.${column}`)
}

const policyRows = await pgQuery(`
  select tablename, count(*)::int as policies
  from pg_policies
  where schemaname = 'public'
    and tablename in (${list(expectedTables)})
  group by tablename
  order by tablename;
`)

const policyCounts = new Map(policyRows.map((row) => [row.tablename, row.policies]))
for (const table of expectedTables) {
  if ((policyCounts.get(table) ?? 0) < 1) fail(`missing RLS policy on public.${table}`)
}

if (process.exitCode) {
  process.exit()
}

process.stdout.write(`supabase remote ok ${new URL(supabaseUrl).origin}\n`)
