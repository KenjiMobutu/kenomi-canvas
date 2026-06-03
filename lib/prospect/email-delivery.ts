import type { Transporter } from 'nodemailer'

export type ProspectEmailProvider = 'resend' | 'smtp' | 'sendgrid' | 'postmark' | 'mailgun'

export interface ProspectEmailDeliveryStatus {
  configured: boolean
  provider: ProspectEmailProvider | null
  fromAddress: string | null
}

export interface ProspectEmailMessage {
  from: string
  to: string
  subject: string
  text: string
}

export interface ProspectEmailSendResult {
  provider: ProspectEmailProvider
  messageId: string | null
}

export interface ProspectEmailDeliveryDependencies {
  env?: NodeJS.ProcessEnv
  fetchImpl?: typeof fetch
  smtpSendMail?: (input: {
    host: string
    port: number
    secure: boolean
    user: string
    pass: string
    message: ProspectEmailMessage
  }) => Promise<{ messageId?: string | null }>
}

function pickFromAddress(env: NodeJS.ProcessEnv): string | null {
  return env.EMAIL_FROM ?? env.SMTP_FROM ?? null
}

export function resolveEmailDeliveryStatus(
  env: NodeJS.ProcessEnv = process.env
): ProspectEmailDeliveryStatus {
  if (env.RESEND_API_KEY) {
    return {
      configured: true,
      provider: 'resend',
      fromAddress: pickFromAddress(env),
    }
  }

  if (env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS) {
    return {
      configured: true,
      provider: 'smtp',
      fromAddress: pickFromAddress(env),
    }
  }

  if (env.SENDGRID_API_KEY) {
    return {
      configured: true,
      provider: 'sendgrid',
      fromAddress: pickFromAddress(env),
    }
  }

  if (env.POSTMARK_SERVER_TOKEN) {
    return {
      configured: true,
      provider: 'postmark',
      fromAddress: pickFromAddress(env),
    }
  }

  if (env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN) {
    return {
      configured: true,
      provider: 'mailgun',
      fromAddress: pickFromAddress(env),
    }
  }

  return {
    configured: false,
    provider: null,
    fromAddress: null,
  }
}

async function defaultSmtpSendMail(input: {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  message: ProspectEmailMessage
}): Promise<{ messageId?: string | null }> {
  const mod = await import('nodemailer')
  const transporter: Transporter = mod.createTransport({
    host: input.host,
    port: input.port,
    secure: input.secure,
    auth: {
      user: input.user,
      pass: input.pass,
    },
  })
  return transporter.sendMail({
    from: input.message.from,
    to: input.message.to,
    subject: input.message.subject,
    text: input.message.text,
  })
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300)
  } catch {
    return response.statusText
  }
}

export async function sendProspectEmail(
  message: ProspectEmailMessage,
  deps: ProspectEmailDeliveryDependencies = {}
): Promise<ProspectEmailSendResult> {
  const env = deps.env ?? process.env
  const fetchImpl = deps.fetchImpl ?? fetch
  const status = resolveEmailDeliveryStatus(env)

  if (!status.configured || !status.provider) {
    throw new Error('No server-side email provider configured')
  }

  if (!message.from.trim()) {
    throw new Error('Missing from address for prospect email delivery')
  }

  if (status.provider === 'resend') {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: message.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    })
    if (!response.ok) {
      throw new Error(`Resend ${response.status}: ${await readErrorBody(response)}`)
    }
    const body = (await response.json()) as { id?: string | null }
    return { provider: 'resend', messageId: body.id ?? null }
  }

  if (status.provider === 'smtp') {
    const port = Number(env.SMTP_PORT)
    const result = await (deps.smtpSendMail ?? defaultSmtpSendMail)({
      host: env.SMTP_HOST!,
      port: Number.isFinite(port) ? port : 587,
      secure: port === 465,
      user: env.SMTP_USER!,
      pass: env.SMTP_PASS!,
      message,
    })
    return { provider: 'smtp', messageId: result.messageId ?? null }
  }

  if (status.provider === 'sendgrid') {
    const response = await fetchImpl('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: { email: message.from },
        personalizations: [{ to: [{ email: message.to }] }],
        subject: message.subject,
        content: [{ type: 'text/plain', value: message.text }],
      }),
    })
    if (!response.ok) {
      throw new Error(`SendGrid ${response.status}: ${await readErrorBody(response)}`)
    }
    return {
      provider: 'sendgrid',
      messageId: response.headers.get('x-message-id') ?? null,
    }
  }

  if (status.provider === 'postmark') {
    const response = await fetchImpl('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'X-Postmark-Server-Token': env.POSTMARK_SERVER_TOKEN!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        From: message.from,
        To: message.to,
        Subject: message.subject,
        TextBody: message.text,
      }),
    })
    if (!response.ok) {
      throw new Error(`Postmark ${response.status}: ${await readErrorBody(response)}`)
    }
    const body = (await response.json()) as { MessageID?: string | null }
    return { provider: 'postmark', messageId: body.MessageID ?? null }
  }

  const formData = new FormData()
  formData.set('from', message.from)
  formData.set('to', message.to)
  formData.set('subject', message.subject)
  formData.set('text', message.text)

  const response = await fetchImpl(
    `https://api.mailgun.net/v3/${env.MAILGUN_DOMAIN}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${env.MAILGUN_API_KEY}`).toString('base64')}`,
      },
      body: formData,
    }
  )
  if (!response.ok) {
    throw new Error(`Mailgun ${response.status}: ${await readErrorBody(response)}`)
  }
  const body = (await response.json()) as { id?: string | null }
  return { provider: 'mailgun', messageId: body.id ?? null }
}
