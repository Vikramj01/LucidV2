/** Express v5 types params as string | string[]. Route params are always strings. */
export function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value
}
