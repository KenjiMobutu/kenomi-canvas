export function normalizeTelegramUpdate(update: any) {
  return {
    chatId: String(update?.message?.chat?.id ?? ''),
    text: String(update?.message?.text ?? ''),
  }
}
