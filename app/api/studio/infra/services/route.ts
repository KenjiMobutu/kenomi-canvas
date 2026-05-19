import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAllowedUser } from '@/lib/auth-server'
import {
  applyUserInfraSettings,
  getSanitizedInfraServices,
  DEFAULT_INFRA_SERVICES,
  type UserInfraSettings,
} from '@/lib/infra-config'
import { unwrapOptionalInfraSettings } from '@/lib/user-settings-normalization'

export async function GET() {
  const cookieStore = await cookies()
  const { user, supabase, response } = await requireAllowedUser(cookieStore)
  if (response) return response

  const { data, error } = await supabase
    .from('user_settings')
    .select(
      [
        'proxmox_base_url',
        'coolify_url',
        'nginx_pm_url',
        'uptime_kuma_url',
        'vaultwarden_url',
        'supabase_url',
        'n8n_base_url',
        'ollama_base_url',
      ].join(',')
    )
    .eq('user_id', user!.id)
    .maybeSingle()

  const settings = unwrapOptionalInfraSettings(data as UserInfraSettings | null, error)
  const services = applyUserInfraSettings(DEFAULT_INFRA_SERVICES, settings)
  const checkedAt = new Date().toISOString()

  return NextResponse.json({
    services: getSanitizedInfraServices(services).map((service) => ({
      ...service,
      checkedAt,
      repairHref: service.id === 'proxmox' ? '/studio/infrastructure' : '/studio/settings',
    })),
  })
}
