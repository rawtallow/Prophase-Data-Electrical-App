import React from 'react';
import { Text, View } from '@react-pdf/renderer';
import { styles, RED, GREEN } from './theme';
import { money } from '../format';

// Pieces shared by all three documents. Kept separate from the documents
// themselves so a change to, say, the letterhead lands on the quote, the
// invoice and the purchase order at once.

// Letterhead. The right-hand side is document-specific (number, dates,
// status) and passed in as `meta` — an array of { label, value }, with
// falsy entries skipped so an un-filled field doesn't print a bare label.
export function DocHeader({ business, title, meta = [] }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <Text style={styles.company}>{business.name}</Text>
        <Text style={styles.companyTag}>{business.tag}</Text>
        {business.abn ? <Text style={styles.companyLine}>ABN {business.abn}</Text> : null}
        {business.licenseNumber ? <Text style={styles.companyLine}>Lic. {business.licenseNumber}</Text> : null}
        {business.address ? <Text style={styles.companyLine}>{business.address}</Text> : null}
        {business.phone || business.email ? (
          <Text style={styles.companyLine}>
            {[business.phone, business.email].filter(Boolean).join('  ·  ')}
          </Text>
        ) : null}
      </View>
      <View style={styles.headerRight}>
        <Text style={styles.docTitle}>{title}</Text>
        {meta.filter((m) => m && m.value).map((m) => (
          <View key={m.label} style={styles.metaRow}>
            <Text style={styles.metaLabel}>{m.label}</Text>
            <Text style={styles.metaValue}>{m.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// A labelled block of free text — "Bill To", "Job Description", "Notes".
export function Field({ label, children, style }) {
  return (
    <View style={[styles.block, style]}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

export function Lines({ values = [] }) {
  return (
    <>
      {values.filter(Boolean).map((v, i) => (
        <Text key={i} style={styles.text}>{v}</Text>
      ))}
    </>
  );
}

// Line-item table. `unitLabel` differs per document ("Unit Price" on a
// quote a customer reads, "Unit Cost" on a PO going to a supplier).
export function ItemsTable({ items, unitLabel = 'Unit Price' }) {
  return (
    <View style={styles.table}>
      <View style={styles.th} fixed>
        <Text style={[styles.thText, styles.colDesc]}>DESCRIPTION</Text>
        <Text style={[styles.thText, styles.colQty]}>QTY</Text>
        <Text style={[styles.thText, styles.colUnit]}>{unitLabel.toUpperCase()}</Text>
        <Text style={[styles.thText, styles.colTotal]}>LINE TOTAL</Text>
      </View>
      {items.map((li, i) => (
        // wrap={false} keeps a single line item from being split across a
        // page break mid-row, which reads as a rendering fault on an
        // invoice a customer is being asked to pay.
        <View key={li.id || i} style={styles.tr} wrap={false}>
          <Text style={styles.colDesc}>{li.description || '—'}</Text>
          <Text style={styles.colQty}>{Number(li.qty)}</Text>
          <Text style={styles.colUnit}>{money(li.unitPrice)}</Text>
          <Text style={styles.colTotal}>{money(li.lineTotal)}</Text>
        </View>
      ))}
    </View>
  );
}

// `lines` is an array of { label, value, grand?, tone? }. Falsy entries are
// skipped so a document without a discount doesn't print "Discount -$0.00".
export function Totals({ lines = [] }) {
  return (
    <View style={styles.totalsWrap}>
      <View style={styles.totalsBox}>
        {lines.filter(Boolean).map((l) =>
          l.grand ? (
            <View key={l.label} style={styles.grandLine}>
              <Text style={styles.grandLabel}>{l.label}</Text>
              <Text
                style={[
                  styles.grandValue,
                  l.tone === 'due' ? { color: RED } : l.tone === 'clear' ? { color: GREEN } : null
                ]}
              >
                {l.value}
              </Text>
            </View>
          ) : (
            <View key={l.label} style={styles.totalLine}>
              <Text style={styles.totalLabel}>{l.label}</Text>
              <Text style={styles.totalValue}>{l.value}</Text>
            </View>
          )
        )}
      </View>
    </View>
  );
}

export function Footer({ business, note }) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>
        {[business.name, business.abn && `ABN ${business.abn}`, business.website]
          .filter(Boolean)
          .join('  ·  ')}
      </Text>
      <Text
        style={styles.footerText}
        render={({ pageNumber, totalPages }) =>
          totalPages > 1 ? `${note ? note + '  ·  ' : ''}Page ${pageNumber} of ${totalPages}` : note || ''
        }
      />
    </View>
  );
}
