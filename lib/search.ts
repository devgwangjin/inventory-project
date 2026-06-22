export function matchesSearch(query: string, fields: (string | null | undefined)[]) {
  if (!query) return true
  const q = query.toLowerCase().trim()
  if (!q) return true

  // 1. AND Search: Check if all keywords are present in any of the fields
  const keywords = q.split(/\s+/).filter(Boolean)
  const matchesAllKeywords = keywords.every(kw =>
    fields.some(field => field && field.toLowerCase().includes(kw))
  )
  if (matchesAllKeywords) return true

  // 2. Space-stripped search: Remove all spaces and check
  const strippedQuery = q.replace(/\s+/g, '')
  const matchesStripped = fields.some(field => {
    if (!field) return false
    const strippedField = field.replace(/\s+/g, '').toLowerCase()
    return strippedField.includes(strippedQuery)
  })

  return matchesStripped
}
