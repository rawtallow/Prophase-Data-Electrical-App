export const CONTRACT_FREQUENCIES = ['Weekly', 'Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'];
export const CONTRACT_STATUSES = ['Active', 'Paused', 'Cancelled'];

// Advances a yyyy-mm-dd date string by one cycle of the given frequency.
// Works in local date components (not UTC) so it round-trips correctly
// with toDateInputValue()/toDisplayDate() the same way dates elsewhere
// in the app do.
export function advanceDate(dateStr, frequency) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  switch (frequency) {
    case 'Weekly':
      dt.setDate(dt.getDate() + 7);
      break;
    case 'Monthly':
      dt.setMonth(dt.getMonth() + 1);
      break;
    case 'Half-Yearly':
      dt.setMonth(dt.getMonth() + 6);
      break;
    case 'Yearly':
      dt.setFullYear(dt.getFullYear() + 1);
      break;
    case 'Quarterly':
    default:
      dt.setMonth(dt.getMonth() + 3);
      break;
  }
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
