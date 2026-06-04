export async function sendTelegramCommandToApp(input: {
  baseUrl: string
  sharedSecret: string
  chatId: string
  text: string
}) {
  const res = await fetch(`${input.baseUrl}/api/operator/telegram/command`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${input.sharedSecret}`,
    },
    body: JSON.stringify({ chat_id: input.chatId, text: input.text }),
  })

  return res.json()
}
