/**
 * Date and time utility helpers for Task due dates.
 */

/**
 * Converts a Date object or ISO string into the HTML5 datetime-local format: "YYYY-MM-DDTHH:mm"
 * in the user's local timezone.
 *
 * @param {string|Date|null} dateInput
 * @returns {string}
 */
export const toDateTimeLocalValue = (dateInput) => {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';

  const pad = (n) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

/**
 * Formats a due date for display on cards, tables, and detail modals.
 * Shows time alongside date when a time was actually set (e.g. "Sep 20, 3:00 PM").
 * Falls back to date-only display (e.g. "Sep 20") if the time is midnight or unset,
 * preventing misleading "12:00 AM" displays on existing tasks.
 *
 * @param {string|Date|null} dateInput
 * @param {Object} [options]
 * @param {boolean} [options.includeYear=false] - Whether to explicitly include year
 * @returns {string|null}
 */
export const formatDueDate = (dateInput, options = {}) => {
  if (!dateInput) return null;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;

  // Check if time component is midnight / unset (local midnight or UTC midnight)
  const isLocalMidnight = d.getHours() === 0 && d.getMinutes() === 0;
  const isUtcMidnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
  const isMidnight = isLocalMidnight || isUtcMidnight;

  const currentYear = new Date().getFullYear();
  const shouldIncludeYear =
    options.includeYear || d.getFullYear() !== currentYear;

  const dateStr = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: shouldIncludeYear ? 'numeric' : undefined,
  });

  if (isMidnight) {
    return dateStr;
  }

  const timeStr = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return `${dateStr}, ${timeStr}`;
};
