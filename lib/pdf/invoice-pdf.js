import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { styles } from './theme';
import { DocHeader, Field, Lines, ItemsTable, Totals, Footer } from './parts';
import { money, toDisplayDate as dstr } from '../format';

// A compliant Australian tax invoice. The ATO requires the document to be
// headed "Tax Invoice", to identify the supplier and show their ABN, to
// carry a date and a description of what was supplied, and to state either
// the GST amount or that the total includes GST. All of that is assembled
// here; the GST split itself is decided in lib/document-data.js, because an
// itemized job has a real ex-GST subtotal while a job invoiced as a single
// typed figure has to be treated as GST-inclusive instead.
export function InvoicePdf({ business, job, client, displayItems, payments, totals, paid, balance, paidLabel }) {
  const items = displayItems.map((li) => ({
    id: li.id,
    description: li.description,
    qty: li.qty,
    unitPrice: li.price,
    lineTotal: li.lineTotal
  }));

  const settled = balance <= 0;

  return (
    <Document title={`Tax Invoice ${job.job_number}`} author={business.name}>
      <Page size="A4" style={styles.page}>
        <DocHeader
          business={business}
          title="TAX INVOICE"
          meta={[
            { label: 'Invoice', value: job.job_number },
            { label: 'Date', value: dstr(job.created_date) },
            { label: 'Status', value: paidLabel }
          ]}
        />

        <Field label="Bill To">
          <Lines values={[job.client_name, client?.address, client?.phone, client?.email]} />
        </Field>

        {job.job_title || job.job_description ? (
          <Field label="Description of Supply">
            <Lines values={[job.job_title, job.job_description]} />
          </Field>
        ) : null}

        {job.site_address ? (
          <Field label="Site Address">
            <Text style={styles.text}>{job.site_address}</Text>
          </Field>
        ) : null}

        <ItemsTable items={items} unitLabel="Price" />

        <Totals
          lines={[
            totals.subtotal !== null && { label: 'Subtotal (ex GST)', value: money(totals.subtotal) },
            { label: totals.gstInclusive ? 'Includes GST of' : 'GST (10%)', value: money(totals.gst) },
            { label: 'Total', value: money(totals.total), grand: true }
          ]}
        />

        {payments.length > 0 ? (
          <View style={{ marginTop: 18 }}>
            <Text style={styles.label}>PAYMENTS RECEIVED</Text>
            <View style={styles.table}>
              <View style={styles.th}>
                <Text style={[styles.thText, styles.colDesc]}>DATE</Text>
                <Text style={[styles.thText, { width: '30%' }]}>METHOD</Text>
                <Text style={[styles.thText, styles.colTotal]}>AMOUNT</Text>
              </View>
              {payments.map((p) => (
                <View key={p.id} style={styles.tr} wrap={false}>
                  <Text style={styles.colDesc}>{dstr(p.date)}</Text>
                  <Text style={{ width: '30%' }}>{p.method || '—'}</Text>
                  <Text style={styles.colTotal}>{money(p.amount)}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <Totals
          lines={[
            payments.length > 0 && { label: 'Total paid', value: money(paid) },
            {
              label: 'Balance Due',
              value: money(balance),
              grand: true,
              tone: settled ? 'clear' : 'due'
            }
          ]}
        />

        {/* Omitted entirely when no bank details are on file — an empty
            "how to pay" box is worse than none. Business Details on the
            Compliance page is where these get set. */}
        {!settled && business.hasBankDetails ? (
          <View style={styles.payBox}>
            <Text style={[styles.label, { marginBottom: 5 }]}>HOW TO PAY</Text>
            {business.bankName ? (
              <View style={styles.payRow}>
                <Text style={styles.payLabel}>Bank</Text>
                <Text style={styles.payValue}>{business.bankName}</Text>
              </View>
            ) : null}
            {business.bankBsb ? (
              <View style={styles.payRow}>
                <Text style={styles.payLabel}>BSB</Text>
                <Text style={styles.payValue}>{business.bankBsb}</Text>
              </View>
            ) : null}
            {business.bankAccount ? (
              <View style={styles.payRow}>
                <Text style={styles.payLabel}>Account</Text>
                <Text style={styles.payValue}>{business.bankAccount}</Text>
              </View>
            ) : null}
            <View style={styles.payRow}>
              <Text style={styles.payLabel}>Reference</Text>
              <Text style={styles.payValue}>{job.job_number}</Text>
            </View>
            {business.paymentTerms ? (
              <Text style={[styles.muted, { marginTop: 6 }]}>{business.paymentTerms}</Text>
            ) : null}
          </View>
        ) : null}

        {job.notes ? (
          <Field label="Notes" style={styles.notes}>
            <Text style={styles.text}>{job.notes}</Text>
          </Field>
        ) : null}

        <Footer business={business} note={`Tax Invoice ${job.job_number}`} />
      </Page>
    </Document>
  );
}
