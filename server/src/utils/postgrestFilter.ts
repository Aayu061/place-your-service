/**
 * Sanitizes a user-supplied search or lookup value before interpolating into
 * PostgREST `.or(...)` filter strings.
 * Strips PostgREST logic/grouping delimiters (commas, parentheses, quotes,
 * backslashes, semicolons) and SQL LIKE wildcards (`%`, `_`, `*`).
 */
export function sanitizePostgrestFilterTerm(value: string): string {
  return value.replace(/[,()"'\\*%_;\r\n]/g, '').trim();
}


/**
 * A value as a literal `.ilike(column, value)` pattern (an exact, case-insensitive match): `%`, `_` and the
 * backslash are escaped. PostgREST also reads `*` as a wildcard and has no escape for it, so callers must refuse
 * values containing `*` (see {@link hasUnescapableWildcard}) and should re-check the returned rows in code.
 */
export function likeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** True when the value holds a `*`, which PostgREST treats as a wildcard in like/ilike and cannot be escaped. */
export function hasUnescapableWildcard(value: string): boolean {
  return value.includes('*');
}
