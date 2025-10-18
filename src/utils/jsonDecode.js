export function decodeJsonStringsDeep(input, depth = 0) {
  if (depth > 10) return input;

  if (typeof input === "string") {
    let current = input;
    for (let i = 0; i < 5; i++) {
      try {
        const parsed = JSON.parse(current);
        if (typeof parsed === "string") {
          if (parsed === current) break;
          current = parsed;
          continue;
        }
        return decodeJsonStringsDeep(parsed, depth + 1);
      } catch {
        break;
      }
    }
    return current;
  }

  if (Array.isArray(input)) {
    return input.map((v) => decodeJsonStringsDeep(v, depth + 1));
  }

  if (input && typeof input === "object") {
    const out = {};
    for (const [k, v] of Object.entries(input))
      out[k] = decodeJsonStringsDeep(v, depth + 1);
    return out;
  }

  return input;
}


