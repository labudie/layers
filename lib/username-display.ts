/** Strip leading @ for storage / comparisons. */
export function stripAtHandle(s: string) {
  return s.trim().replace(/^@+/, "");
}

/** Display handle with a single @ prefix. */
export function formatAtUsername(
  raw: string | null | undefined,
  fallback: string
): string {
  const b = stripAtHandle(raw ?? "");
  if (!b.length) {
    const f = stripAtHandle(fallback);
    return f.length ? `@${f}` : "@player";
  }
  return `@${b}`;
}

/** Creator / display strings: show with @ when non-empty. */
export function formatAtCreator(raw: string | null | undefined): string {
  const b = stripAtHandle(raw ?? "");
  return b.length ? `@${b}` : "—";
}
