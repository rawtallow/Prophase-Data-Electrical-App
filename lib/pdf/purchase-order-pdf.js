import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { styles } from './theme';
import { DocHeader, Field, Lines, ItemsTable, Totals, Footer } from './parts';
import { money, toDisplayDate as dstr } from '../format';

// Goes out to a supplier, so the emphasis differs from the customer-facing
// documents: the PO number is the reference the supplier quotes back on
// their invoice, and delivery instructions matter more than payment terms.
export function PurchaseOrderPdf({ business, po, lineItems }) {
  const items = lineItems.map((li) => ({
    id: li.id,
    description: li.supplier_product_code
      ? `${li.description}  (${li.supplier_product_code})`
      : li.description,
    qty: li.qty,
    unitPrice: li.unit_cost,
    lineTotal: li.lineTotal
  }));

  return (
    <Document title={`Purchase Order ${po.po_number}`} author={business.name}>
      <Page size="A4" style={styles.page}>
        <DocHeader
          business={business}
          title="PURCHASE ORDER"
          meta={[
            { label: 'PO', value: po.po_number },
            { label: 'Date', value: dstr(po.date) },
            { label: 'Status', value: po.status }
          ]}
        />

        <Field label="To Supplier">
          <Text style={styles.text}>{po.supplier_name}</Text>
        </Field>

        {po.job_number ? (
          <Field label="For Job">
            <Lines values={[po.job_number, po.client_name]} />
          </Field>
        ) : null}

        {po.delivery_method || po.delivery_address || po.expected_delivery_date || po.delivery_notes ? (
          <Field label="Delivery">
            <Lines
              values={[
                po.delivery_method,
                po.delivery_address,
                po.expected_delivery_date && `Expected: ${dstr(po.expected_delivery_date)}`,
                po.delivery_notes
              ]}
            />
          </Field>
        ) : null}

        <ItemsTable items={items} unitLabel="Unit Cost" />

        <Totals
          lines={[
            { label: 'Subtotal', value: money(po.subtotal) },
            { label: `GST (${po.tax_rate}%)`, value: money(po.tax) },
            { label: 'Total', value: money(po.total), grand: true }
          ]}
        />

        {po.notes ? (
          <Field label="Notes" style={styles.notes}>
            <Text style={styles.text}>{po.notes}</Text>
          </Field>
        ) : null}

        <View style={styles.payBox}>
          <Text style={styles.muted}>
            Please quote purchase order {po.po_number} on your delivery docket and invoice. Goods
            received without a matching purchase order reference may be delayed in processing.
          </Text>
        </View>

        <Footer business={business} note={`Purchase Order ${po.po_number}`} />
      </Page>
    </Document>
  );
}
