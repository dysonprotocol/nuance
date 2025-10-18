export function linkClass(isActive: boolean): string {
  const base =
    'w-full inline-flex items-center gap-2 rounded-md px-3 py-2 justify-start transition-colors text-muted-foreground hover:text-foreground hover:bg-muted'
  return isActive ? base + ' bg-muted text-foreground' : base
}
