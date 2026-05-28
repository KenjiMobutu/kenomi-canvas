export function percentage(part: number, total: number) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0
  return Number(Number(((part / total) * 100).toFixed(1)))
}

export function averageHoursFromMs(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value) && value >= 0)
  if (valid.length === 0) return 0
  const average = valid.reduce((sum, value) => sum + value, 0) / valid.length
  return Number((average / (1000 * 60 * 60)).toFixed(1))
}

export function averageDaysFromMs(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value) && value >= 0)
  if (valid.length === 0) return 0
  const average = valid.reduce((sum, value) => sum + value, 0) / valid.length
  return Number((average / (1000 * 60 * 60 * 24)).toFixed(1))
}
