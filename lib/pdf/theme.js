import { StyleSheet } from '@react-pdf/renderer';

// Shared look for every generated PDF, mirroring the app's navy/amber brand
// and the .print-header / .bill-to / .totals-box treatment in globals.css.
//
// @react-pdf implements a flexbox subset, not CSS — there's no grid, no
// float, and only a handful of properties per element. Sizes are in points
// (1pt = 1/72"), so an A4 page is 595 x 842 with the 40pt margins below
// leaving roughly 515pt of usable width. The column widths in the line-item
// tables are percentages of that.

export const INK = '#161616';
export const NAVY = '#141414';
export const AMBER = '#f5a623';
export const GREY = '#5b5b5b';
export const FAINT = '#8a8a8a';
export const BORDER = '#d9d9d9';
export const RED = '#b91c1c';
export const GREEN = '#15803d';

export const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 40,
    fontSize: 9.5,
    fontFamily: 'Helvetica',
    color: INK,
    lineHeight: 1.45
  },

  // --- header -------------------------------------------------------
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 2,
    borderBottomColor: NAVY,
    paddingBottom: 12,
    marginBottom: 16
  },
  headerLeft: { flexGrow: 1, paddingRight: 20 },
  company: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: NAVY },
  companyTag: { fontSize: 8.5, color: GREY, marginTop: 2 },
  companyLine: { fontSize: 8, color: GREY, marginTop: 1 },
  headerRight: { alignItems: 'flex-end', minWidth: 165 },
  docTitle: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 4 },
  metaRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 1 },
  metaLabel: { fontSize: 8.5, color: GREY },
  metaValue: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', marginLeft: 6 },

  // --- generic blocks -----------------------------------------------
  label: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: FAINT,
    letterSpacing: 0.6,
    marginBottom: 3
  },
  block: { marginBottom: 14 },
  text: { fontSize: 9.5 },
  muted: { fontSize: 8.5, color: GREY },

  // --- line items table ---------------------------------------------
  table: { marginTop: 4 },
  th: {
    flexDirection: 'row',
    borderBottomWidth: 1.5,
    borderBottomColor: NAVY,
    paddingBottom: 5,
    marginBottom: 2
  },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
    paddingVertical: 5
  },
  thText: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: GREY, letterSpacing: 0.4 },
  colDesc: { width: '52%', paddingRight: 8 },
  colQty: { width: '12%', textAlign: 'right' },
  colUnit: { width: '18%', textAlign: 'right' },
  colTotal: { width: '18%', textAlign: 'right' },

  // --- totals -------------------------------------------------------
  totalsWrap: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  totalsBox: { width: 210 },
  totalLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3
  },
  totalLabel: { fontSize: 9, color: GREY },
  totalValue: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  grandLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1.2,
    borderTopColor: NAVY,
    marginTop: 4,
    paddingTop: 7
  },
  grandLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY },
  grandValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY },

  // --- callouts -----------------------------------------------------
  payBox: {
    marginTop: 18,
    borderWidth: 0.75,
    borderColor: BORDER,
    borderLeftWidth: 3,
    borderLeftColor: AMBER,
    padding: 10
  },
  payRow: { flexDirection: 'row', marginTop: 2 },
  payLabel: { fontSize: 8.5, color: GREY, width: 90 },
  payValue: { fontSize: 8.5, fontFamily: 'Helvetica-Bold' },

  notes: { marginTop: 18 },

  footer: {
    position: 'absolute',
    bottom: 26,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: BORDER,
    paddingTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  footerText: { fontSize: 7.5, color: FAINT }
});
