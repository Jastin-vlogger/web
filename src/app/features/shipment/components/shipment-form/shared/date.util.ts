/**
 * Serializes a date-only value using its LOCAL calendar date, not `toISOString()`.
 * `toISOString()` converts to UTC first — for any timezone ahead of UTC (e.g. IST,
 * UTC+5:30), a date picked at local midnight rolls back to the previous day once
 * converted (16th 00:00 IST → 15th 18:30 UTC), so slicing the date off the ISO string
 * silently saves the wrong day.
 */
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
