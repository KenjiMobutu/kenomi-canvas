export interface ProspectDeliverySecretStatus {
  email_delivery: {
    configured: boolean
    provider: string | null
    fromAddress: string | null
  }
}

export function getProspectDeliveryStatusLabel(
  status: ProspectDeliverySecretStatus | null
): { tone: 'muted' | 'ready' | 'warning'; text: string } {
  if (!status) {
    return {
      tone: 'muted',
      text: 'checking delivery…',
    }
  }

  if (status.email_delivery.configured) {
    return {
      tone: 'ready',
      text: `delivery ready · ${status.email_delivery.provider}`,
    }
  }

  return {
    tone: 'warning',
    text: 'identity only · no server-side delivery provider',
  }
}
