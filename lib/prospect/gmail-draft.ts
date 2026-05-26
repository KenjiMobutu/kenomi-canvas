export function buildGmailDraftPayload(input: {
  prospectId: string
  companyName: string
  contactName?: string | null
  to?: string | null
  subject: string
  body: string
}) {
  return {
    channel: 'email' as const,
    provider: 'gmail' as const,
    status: 'draft' as const,
    content: input.body,
    metadata: {
      title: input.subject,
      to: input.to ?? '',
      contact_name: input.contactName ?? '',
      prospect_id: input.prospectId,
      company_name: input.companyName,
      asset_kind: 'outreach_email',
    },
  }
}
