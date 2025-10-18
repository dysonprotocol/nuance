export function decodeJsonRecursively(value, depth = 0, maxDepth = 6) {
  if (depth > maxDepth) return value
  if (Array.isArray(value)) return value.map((v) => decodeJsonRecursively(v, depth + 1, maxDepth))
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value))
      out[k] = decodeJsonRecursively(v, depth + 1, maxDepth)
    return out
  }
  if (typeof value !== 'string') return value
  const s = value.trim()
  try {
    const parsed = JSON.parse(s)
    return decodeJsonRecursively(parsed, depth + 1, maxDepth)
  } catch {
    return value
  }
}
