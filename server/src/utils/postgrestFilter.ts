/**
 * Sanitizes a user-supplied search or lookup value before interpolating into
 * PostgREST `.or(...)` filter strings.
 * Strips PostgREST logic/grouping delimiters (commas, parentheses, quotes,
 * backslashes, semicolons) and SQL LIKE wildcards (`%`, `_`, `*`).
 */
export function sanitizePostgrestFilterTerm(value: string): string {
  return value.replace(/[,()"'\\*%_;\r\n]/g, '').trim();
}

