/**
 * Log-safe web addresses. Builds a SEPARATE string for logs; never alter the real request url
 * (the ESS signature covers the real originalUrl).
 */

const REDACTED = '[REDACTED]';

/** Query names whose values are harmless to log. Names are matched case-sensitively. */
const SAFE_VALUE_NAMES = new Set([
  'page',
  'limit',
  'pageSize',
  'status',
  'kind',
  'type',
  'category',
  'sort',
  'order',
  'from',
  'to',
  'isActive',
  'isPublic',
]);

const SAFE_NAME = /^[A-Za-z_][A-Za-z0-9_.[\]-]{0,39}$/;
const SAFE_VALUE = /^[A-Za-z0-9_.:+-]{0,40}$/;
const LONG_DIGIT_RUN = /\d{7,}/;

/** Path and query names stay; values stay only for the safe list. Never throws. */
export function redactUrl(originalUrl: string): string {
  try {
    if (typeof originalUrl !== 'string') return '';
    const qIndex = originalUrl.indexOf('?');
    if (qIndex === -1) return originalUrl;

    const path = originalUrl.slice(0, qIndex);
    const query = originalUrl.slice(qIndex + 1);
    if (query === '') return originalUrl;

    const parts: string[] = [];
    for (const pair of query.split('&')) {
      if (pair === '') continue;
      const eq = pair.indexOf('=');
      if (eq === -1) {
        parts.push(REDACTED); // bare token: could itself be a phone or name
        continue;
      }
      const name = pair.slice(0, eq);
      const rawValue = pair.slice(eq + 1);
      const decodedName = decodeURIComponent(name); // throws on bad encoding -> whole query redacted
      const decodedValue = decodeURIComponent(rawValue);
      if (!SAFE_NAME.test(decodedName)) {
        parts.push(REDACTED);
        continue;
      }
      if (rawValue === '') {
        parts.push(`${decodedName}=`);
      } else if (
        SAFE_VALUE_NAMES.has(decodedName) &&
        SAFE_VALUE.test(decodedValue) &&
        !LONG_DIGIT_RUN.test(decodedValue)
      ) {
        parts.push(`${decodedName}=${decodedValue}`);
      } else {
        parts.push(`${decodedName}=${REDACTED}`);
      }
    }
    return `${path}?${parts.join('&')}`;
  } catch {
    const i = typeof originalUrl === 'string' ? originalUrl.indexOf('?') : -1;
    return i === -1 ? '' : `${originalUrl.slice(0, i)}?${REDACTED}`;
  }
}
