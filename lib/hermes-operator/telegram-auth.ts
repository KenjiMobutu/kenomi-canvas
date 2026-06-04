export function isTelegramOperatorAuthorized(headers: Headers) {
  const secret = process.env.TELEGRAM_OPERATOR_SHARED_SECRET
  if (!secret) return false
  return headers.get('authorization') === `Bearer ${secret}`
}
