export function formatRelativeTime(input: string | number | Date): string {
  const date = input instanceof Date ? input : new Date(input);
  const ms = date.getTime();
  if (Number.isNaN(ms)) return "";

  let diffSeconds = Math.floor(Math.abs(Date.now() - ms) / 1000);

  const units: Array<{ label: string; seconds: number }> = [
    { label: "y", seconds: 31536000 },
    { label: "mo", seconds: 2592000 },
    { label: "w", seconds: 604800 },
    { label: "d", seconds: 86400 },
    { label: "h", seconds: 3600 },
    { label: "m", seconds: 60 },
    { label: "s", seconds: 1 },
  ];

  for (const unit of units) {
    const value = Math.floor(diffSeconds / unit.seconds);
    if (value >= 1) return `${value}${unit.label}`;
  }

  return "0s";
}
