import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { styles } from './theme';
import { DocHeader, Field, Lines, ItemsTable, Totals, Footer } from './parts';
import { money, toDisplayDate as dstr } from '../format';

export function QuotePdf({ business, quote, lineItems, validUntil }) {
  const items = lineItems.map((li) => ({
    id: li.id,
    description: li.description,
    qty: li.qty,
    unitPrice: li.price,
    lineTotal: li.lineTotal
  }));

  return (
    <Document title={`Quote ${quote.quote_number}`} author={business.name}>
      <Page size="A4" style={styles.page}>
        <DocHeader
          business={business}
          title="QUOTE"
          meta={[
            { label: 'Quote', value: quote.quote_number },
            { label: 'Date', value: dstr(quote.date) },
            { label: 'Valid until', value: dstr(validUntil) }
          ]}
        />

        <Field label="Prepared For">
          <Lines
            values={[quote.client_name, quote.client_address, quote.client_phone, quote.client_email]}
          />
        </Field>

        {quote.job_description ? (
          <Field label="Job Description">
            <Text style={styles.text}>{quote.job_description}</Text>
          </Field>
        ) : null}

        <ItemsTable items={items} unitLabel="Unit Price" />

        <Totals
          lines={[
            { label: 'Subtotal', value: money(quote.subtotal) },
            Number(quote.discount) > 0 && { label: 'Discount', value: `-${money(quote.discount)}` },
            { label: `GST (${quote.tax_rate}%)`, value: money(quote.tax) },
            { label: 'Total', value: money(quote.total), grand: true }
          ]}
        />

        {quote.notes ? (
          <Field label="Notes" style={styles.notes}>
            <Text style={styles.text}>{quote.notes}</Text>
          </Field>
        ) : null}

        {/* The validity window is the one term a customer most often
            disputes later, so it's restated in the body rather than left
            to the small print in the header. */}
        <View style={styles.payBox}>
          <Text style={styles.muted}>
            This quote is valid until {dstr(validUntil)}. Prices are subject to change after this
            date. Acceptance of this quote constitutes agreement to the scope of works described
            above.
          </Text>
        </View>

        <Footer business={business} note={`Quote ${quote.quote_number}`} />
      </Page>
    </Document>
  );
}
