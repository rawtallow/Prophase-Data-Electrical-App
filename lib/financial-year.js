// Australian financial year (1 July – 30 June), used consistently across
// Receipts and Statistics so "this year" always means the same period.
// A financial year is identified by its start year: FY 2025 runs
// 2025-07-01 through 2026-06-30.

export function currentFYStartYear() {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

export function fyLabel(fyStartYear) {
  return `FY ${fyStartYear}–${String(Number(fyStartYear) + 1).slice(2)}`;
}

export function fyBounds(fyStartYear) {
  const y = Number(fyStartYear);
  return { start: `${y}-07-01`, end: `${y + 1}-06-30` };
}

// 12 {year, month, label} buckets from July of fyStartYear through June of
// fyStartYear+1, month is 0-indexed (JS Date convention) for easy bucketing.
export function fyMonths(fyStartYear) {
  const y = Number(fyStartYear);
  const months = [];
  for (let i = 0; i < 12; i++) {
    const month = (6 + i) % 12;
    const year = month >= 6 ? y : y + 1;
    months.push({
      year,
      month,
      label: new Date(year, month, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    });
  }
  return months;
}

// Given a list of years that have at least one record (start years, e.g.
// from an `extract(year from ...)`-style query on dates), builds the set of
// FY start years to offer in the switcher — always includes the current FY
// even if it has no data yet, so a brand-new business isn't stuck.
export function availableFYs(candidateDates) {
  const years = new Set([currentFYStartYear()]);
  for (const d of candidateDates) {
    if (!d) continue;
    const dt = new Date(d);
    years.add(dt.getMonth() >= 6 ? dt.getFullYear() : dt.getFullYear() - 1);
  }
  return Array.from(years).sort((a, b) => b - a);
}

// Every FY from the earliest record through the current one — used so the
// switcher shows a continuous run of years back to when the business'
// records start, newest first, even for years with no activity.
export function fyRangeFromEarliest(earliestDate) {
  const current = currentFYStartYear();
  if (!earliestDate) return [current];
  const dt = new Date(earliestDate);
  const startFY = dt.getMonth() >= 6 ? dt.getFullYear() : dt.getFullYear() - 1;
  const years = [];
  for (let y = current; y >= startFY; y--) years.push(y);
  return years;
}
