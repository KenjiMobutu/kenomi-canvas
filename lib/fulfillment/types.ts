export interface FulfillmentInput {
  deliveryId: string
  ventureId: string
  paymentId: string
  customerEmail: string | null
  offerName: string
  amountEur: number
}

export interface FulfillmentResult {
  externalId: string
  accessUrl?: string | null
  metadata?: Record<string, unknown>
}

export interface FulfillmentProvider {
  deliver(input: FulfillmentInput): Promise<FulfillmentResult>
}
