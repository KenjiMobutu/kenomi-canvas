export function filterRowsByVentureIds<T extends { venture_id?: string | null }>(
  rows: T[],
  ventureIds: string[]
): T[] {
  if (ventureIds.length === 0) return []
  const allowed = new Set(ventureIds)
  return rows.filter((row) => (row.venture_id ? allowed.has(row.venture_id) : false))
}
