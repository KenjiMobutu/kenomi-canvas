export async function sendTelegramMessage(input: {
  botToken: string
  chatId: string
  text: string
}) {
  return fetch(`https://api.telegram.org/bot${input.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: input.chatId, text: input.text }),
  })
}
