import {
  Document, Packer, Paragraph, TextRun, PageBreak, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, HeadingLevel,
  BorderStyle, WidthType, ShadingType, VerticalAlign, PageNumber
} from 'docx';
import { toDisplayDate, toDateInputValue } from './format';
import { advanceDate } from './maintenance-frequency';

// Shared brand styling for generated client-facing Word documents (Client
// Work Agreement, Workmanship Warranty). Kept in one place so both templates
// stay visually consistent and future documents can reuse the same helpers.

const INK = '161616';
const AMBER = 'F5A623';
const GREY = '5B5B5B';
const LIGHT = 'FBEFD9';
const BORDER_GREY = 'D9D9D9';

const PAGE = {
  size: { width: 12240, height: 15840 }, // US Letter
  margin: { top: 1080, right: 1260, bottom: 1080, left: 1260 }
};
const CONTENT_WIDTH = 12240 - 1260 - 1260;

const cellBorder = { style: BorderStyle.SINGLE, size: 2, color: BORDER_GREY };
const cellBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

function titleBlock(title, subtitle) {
  return [
    new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: 'PROPHASE DATA AND ELECTRICAL', bold: true, color: INK, size: 20, font: 'Arial' })]
    }),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: AMBER, space: 6 } },
      spacing: { after: 200 },
      children: [new TextRun({ text: title, bold: true, color: INK, size: 40, font: 'Arial' })]
    }),
    new Paragraph({
      spacing: { after: 300 },
      children: [new TextRun({ text: subtitle, italics: true, color: GREY, size: 22, font: 'Arial' })]
    })
  ];
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 140 },
    children: [new TextRun({ text, bold: true, color: INK, size: 26, font: 'Arial' })]
  });
}

function body(text) {
  return new Paragraph({
    spacing: { after: 140, line: 300 },
    children: [new TextRun({ text, size: 21, font: 'Arial', color: '262626' })]
  });
}

function bodyRuns(runs) {
  return new Paragraph({ spacing: { after: 140, line: 300 }, children: runs });
}

function bullet(text) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { after: 80, line: 280 },
    children: [new TextRun({ text, size: 21, font: 'Arial', color: '262626' })]
  });
}

function labelCell(text, w) {
  return new TableCell({
    borders: cellBorders,
    width: { size: w, type: WidthType.DXA },
    shading: { fill: LIGHT, type: ShadingType.CLEAR },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 80, bottom: 80, left: 140, right: 140 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 20, font: 'Arial', color: INK })] })]
  });
}
function valueCell(text, w) {
  return new TableCell({
    borders: cellBorders,
    width: { size: w, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 80, bottom: 80, left: 140, right: 140 },
    children: [new Paragraph({ children: [new TextRun({ text: text || ' ', size: 20, font: 'Arial', color: '262626' })] })]
  });
}

function footer() {
  return new Footer({
    children: [
      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: BORDER_GREY, space: 4 } },
        tabStops: [{ type: 'right', position: CONTENT_WIDTH }],
        children: [
          new TextRun({ text: 'Prophase Data and Electrical  ·  Sydney, NSW  ·  Justin 0405 309 880  ·  Byron 0426 682 623', size: 16, font: 'Arial', color: GREY }),
          new TextRun({ text: '\t' }),
          new TextRun({ text: 'Page ', size: 16, font: 'Arial', color: GREY }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, font: 'Arial', color: GREY })
        ]
      })
    ]
  });
}

const numbering = {
  config: [
    { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 520, hanging: 260 } } } }] }
  ]
};

const baseStyles = {
  default: { document: { run: { font: 'Arial', size: 21, color: '262626' } } },
  paragraphStyles: [
    { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { size: 26, bold: true, font: 'Arial', color: INK },
      paragraph: { spacing: { before: 320, after: 140 }, outlineLevel: 0 } }
  ]
};

const half = Math.floor(CONTENT_WIDTH / 2);
const blank = (n) => '_'.repeat(n);

// Strips characters that would break a Content-Disposition header (quotes,
// backslashes, control characters) out of user-supplied text like a client
// name before it's used as part of a download filename.
export function safeFilename(text) {
  return String(text || '').replace(/["\\\r\n]/g, '').trim();
}

// ---------------------------------------------------------------------
// Client Work Agreement
// ---------------------------------------------------------------------

// `quote` is optional — when provided (from a saved quote), the client and
// scope-of-works fields are pre-filled; otherwise the blank template ships
// with fill-in-the-blank lines for handing out before a quote exists.
export async function buildAgreementDocx(quote = null) {
  const partyTable = new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [half, CONTENT_WIDTH - half],
    rows: [
      new TableRow({ children: [labelCell('Service Provider', half), labelCell('Client', CONTENT_WIDTH - half)] }),
      new TableRow({ children: [
        valueCell('Prophase Data and Electrical', half),
        valueCell(quote ? `Name: ${quote.client_name}` : `Name: ${blank(36)}`, CONTENT_WIDTH - half)
      ]}),
      new TableRow({ children: [
        valueCell('ABN: [insert ABN]', half),
        valueCell(quote ? `Address: ${quote.client_address || blank(30)}` : `Address: ${blank(34)}`, CONTENT_WIDTH - half)
      ]}),
      new TableRow({ children: [
        valueCell('NSW Electrical Licence No.: [insert licence no.]', half),
        valueCell(quote ? `Phone: ${quote.client_phone || blank(30)}` : `Phone: ${blank(36)}`, CONTENT_WIDTH - half)
      ]}),
      new TableRow({ children: [
        valueCell('Address: [insert business address]', half),
        valueCell(quote ? `Email: ${quote.client_email || blank(30)}` : `Email: ${blank(36)}`, CONTENT_WIDTH - half)
      ]}),
      new TableRow({ children: [valueCell('Phone: Justin 0405 309 880 / Byron 0426 682 623', half), valueCell('', CONTENT_WIDTH - half)] }),
      new TableRow({ children: [valueCell('Email: [insert business email]', half), valueCell('', CONTENT_WIDTH - half)] })
    ]
  });

  const sigTable = new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [half, CONTENT_WIDTH - half],
    rows: [
      new TableRow({ children: [labelCell('Client', half), labelCell('Prophase Data and Electrical', CONTENT_WIDTH - half)] }),
      new TableRow({ children: [valueCell(`Name: ${quote ? quote.client_name : blank(28)}`, half), valueCell(`Name: ${blank(28)}`, CONTENT_WIDTH - half)] }),
      new TableRow({ children: [valueCell(`Signature: ${blank(24)}`, half), valueCell(`Signature: ${blank(24)}`, CONTENT_WIDTH - half)] }),
      new TableRow({ children: [valueCell(`Date: ${blank(26)}`, half), valueCell(`Date: ${blank(26)}`, CONTENT_WIDTH - half)] })
    ]
  });

  const scopeText = quote
    ? `The Works to be carried out are those described in Quotation / Job Reference No. ${quote.quote_number}, dated ${toDisplayDate(quote.date)}, for the price of $${Number(quote.total).toFixed(2)} (GST inclusive) as set out in that quotation, a copy of which forms part of this Agreement. Any work not specifically listed in that quotation is outside the scope of this Agreement and will be treated as a Variation under clause 5.`
    : `The Works to be carried out are those described in Quotation / Job Reference No. ${blank(18)}, dated ${blank(18)}, a copy of which forms part of this Agreement. Any work not specifically listed in that quotation is outside the scope of this Agreement and will be treated as a Variation under clause 5.`;

  const children = [
    ...titleBlock('Client Work Agreement', 'Terms of engagement for electrical and data cabling services'),

    body('This Work Agreement (“Agreement”) sets out the terms on which Prophase Data and Electrical (“Prophase”, “we”, “us”, “our”) will carry out the electrical and/or data cabling work described in the attached quotation or job reference (“the Works”) for the client named below (“you”, “the Client”). By signing this Agreement, paying a deposit, or instructing us to proceed with the Works, you agree to be bound by these terms.'),

    h1('1. The Parties'),
    partyTable,

    h1('2. Scope of Works'),
    body(scopeText),

    h1('3. Quotations & Pricing'),
    bullet('All quotations are valid for 30 days from the date of issue unless otherwise stated, after which prices may be revised.'),
    bullet('Unless stated otherwise, quoted prices are in Australian dollars and include GST.'),
    bullet('Quotations are based on a visual inspection and the information available at the time. If concealed conditions are discovered once work begins — for example, damaged, non-compliant, or unexpected existing wiring — we will notify you and obtain your agreement before proceeding with any additional cost.'),

    h1('4. Payment Terms'),
    bullet(`A deposit of ${blank(6)}% of the quoted price may be requested before work commences on larger jobs.`),
    bullet('The balance is due on completion of the Works, unless a progress payment schedule has been agreed in writing.'),
    bullet('Payment can be made by bank transfer, card, or cash, as agreed.'),
    bullet('Invoices are payable within 7 days of issue unless otherwise agreed. We reserve the right to charge interest on overdue accounts and to suspend further work until overdue amounts are paid.'),
    bullet('Title to any materials or equipment supplied remains with Prophase until paid for in full.'),

    h1('5. Variations'),
    bullet('Any change to the agreed scope of Works — requested by you, or required due to unforeseen site conditions, regulatory requirements, or safety issues — is a Variation.'),
    bullet('We will provide you with the cost and any impact on the timeframe before carrying out a Variation, and will proceed only once you approve it, verbally or in writing.'),
    bullet('In an emergency, or where continuing without a Variation would create a safety risk, we may carry out necessary work to make the site safe and will advise you as soon as practicable afterwards.'),

    h1('6. Your Responsibilities'),
    bullet('You will provide safe, clear, and continuous access to the work area for the duration of the Works.'),
    bullet('You will tell us about any known faults, non-compliant existing wiring, asbestos, or other hazards at the property before work begins.'),
    bullet('Where the Works require council, strata, or other third-party approval, obtaining that approval is your responsibility, unless we have specifically agreed in writing to arrange it on your behalf.'),
    bullet('You will ensure power and/or water can be safely isolated where required, and that pets and children are kept clear of the work area.'),

    h1('7. Program & Delays'),
    body('We will aim to complete the Works within the timeframe discussed with you, but timeframes are estimates only. We are not liable for delays caused by circumstances outside our reasonable control, including weather, supply shortages, other trades, access issues, or Variations.'),

    h1('8. Materials & Products'),
    bullet('We select materials and products that are fit for purpose and compliant with relevant Australian Standards.'),
    bullet('Where a specific brand or product is unavailable, we may substitute an equivalent product of comparable quality, and will let you know if this happens.'),
    bullet('Manufacturer warranties on supplied products and equipment are provided by the manufacturer, not by Prophase, and are separate from the workmanship warranty described in clause 10.'),

    h1('9. Work Health & Safety'),
    body('All work is carried out in accordance with the Work Health and Safety Act 2011 (NSW) and the applicable Australian/New Zealand Wiring Rules (AS/NZS 3000). You must not interfere with isolated circuits, safety barriers, or work in progress.'),

    h1('10. Warranty'),
    body('Our workmanship is covered by the Prophase Data and Electrical Workmanship Warranty, a copy of which is provided with this Agreement. That warranty operates in addition to, and does not limit, any consumer guarantees or statutory warranties that apply by law.'),

    h1('11. Cancellation & Rescheduling'),
    bullet('You may reschedule or cancel a booked job by giving us at least 24 hours’ notice.'),
    bullet('Cancellations with less than 24 hours’ notice, or a missed appointment where reasonable access was not provided, may incur a call-out fee to cover time already committed.'),
    bullet('Any deposit paid may be forfeited if the Works are cancelled by you after materials have been ordered specifically for the job, to the extent of costs already reasonably incurred.'),

    h1('12. Insurance & Licensing'),
    body('Prophase holds public liability insurance and all electrical work is carried out by, or under the direct supervision of, a licensed electrician (NSW Electrical Licence No. [insert]). A Certificate of Compliance for Electrical Work (CCEW) will be issued for prescribed electrical work as required by law.'),

    h1('13. Limitation of Liability'),
    bullet('Nothing in this Agreement excludes, restricts, or modifies any consumer guarantee, right, or remedy that cannot lawfully be excluded under the Australian Consumer Law or the Home Building Act 1989 (NSW).'),
    bullet('To the extent permitted by law, our liability for any loss arising from the Works is limited to the cost of having the Works re-supplied.'),
    bullet('We are not liable for pre-existing defects in the property’s electrical installation that were not part of the agreed scope of Works.'),

    h1('14. Photos for Portfolio Use'),
    body('We may take before/after photos of completed work for our own records, marketing, and portfolio. We will not include identifying details of your property, such as your address, without your consent.'),
    bodyRuns([
      new TextRun({ text: '☐  ', size: 24, font: 'Arial', color: INK }),
      new TextRun({ text: 'I do not consent to photos of my property being used for marketing.', size: 21, font: 'Arial', color: '262626' })
    ]),

    h1('15. Privacy'),
    body('Any personal information you provide is used only to carry out and invoice the Works, and is handled in accordance with the Australian Privacy Principles.'),

    h1('16. Disputes'),
    body('If a dispute arises, both parties agree to first attempt to resolve it directly and in good faith before pursuing any other remedy, including through NSW Fair Trading or the relevant tribunal.'),

    h1('17. Governing Law'),
    body('This Agreement is governed by the laws of New South Wales, Australia.'),

    h1('18. Acceptance'),
    body('By signing below, you confirm that you have read, understood, and agree to be bound by this Agreement and the attached quotation.'),
    new Paragraph({ spacing: { before: 160, after: 200 }, children: [] }),
    sigTable
  ];

  const doc = new Document({
    styles: baseStyles,
    numbering,
    sections: [{ properties: { page: PAGE }, footers: { default: footer() }, children }]
  });
  return Packer.toBuffer(doc);
}

// ---------------------------------------------------------------------
// Workmanship Warranty
// ---------------------------------------------------------------------

// `job` (with `client` attached) is optional — when provided, the warranty
// details table is pre-filled with the job's client, dates, and computed
// 12-month expiry; otherwise the blank template ships with fill-in lines.
export async function buildWarrantyDocx(job = null, client = null, complianceRef = '') {
  // job.completed_date comes back from the driver as a native Date object;
  // advanceDate() needs a yyyy-mm-dd string, so it must go through
  // toDateInputValue() first (see lib/format.js).
  const completedDateStr = job?.completed_date ? toDateInputValue(job.completed_date) : null;
  const completedDate = completedDateStr ? toDisplayDate(completedDateStr) : blank(28);
  const expiry = completedDateStr ? toDisplayDate(advanceDate(completedDateStr, 'Yearly')) : blank(28);
  const clientName = client?.name || job?.client_name || blank(28);
  const clientAddress = client?.address || blank(28);

  const detailsTable = new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [half, CONTENT_WIDTH - half],
    rows: [
      new TableRow({ children: [labelCell('Client Name', half), valueCell(clientName, CONTENT_WIDTH - half)] }),
      new TableRow({ children: [labelCell('Property Address', half), valueCell(clientAddress, CONTENT_WIDTH - half)] }),
      new TableRow({ children: [labelCell('Job / Invoice No.', half), valueCell(job?.job_number || blank(28), CONTENT_WIDTH - half)] }),
      new TableRow({ children: [labelCell('Date of Completion', half), valueCell(completedDate, CONTENT_WIDTH - half)] }),
      new TableRow({ children: [labelCell('Warranty Expiry', half), valueCell(expiry, CONTENT_WIDTH - half)] }),
      new TableRow({ children: [labelCell('Certificate of Compliance No. (if applicable)', half), valueCell(complianceRef || blank(28), CONTENT_WIDTH - half)] })
    ]
  });

  const children = [
    ...titleBlock('Workmanship Warranty', 'Covering electrical and data cabling installation work'),

    body('This warranty is provided by Prophase Data and Electrical (ABN [insert ABN], NSW Electrical Licence No. [insert licence no.]) in respect of the electrical and/or data cabling work carried out for you (“the Works”). Please retain this document together with your invoice and Certificate of Compliance (where applicable) as proof of warranty.'),

    h1('1. What This Warranty Covers'),
    body('We warrant that the Works will be free from defects in workmanship for the Warranty Period set out below, provided the Works were installed and completed by Prophase Data and Electrical.'),

    h1('2. Warranty Period'),
    bullet('General electrical and data cabling installation workmanship: 12 months from the date of completion.'),
    bullet('Major installations such as switchboard upgrades or rewires: [insert if a longer period applies] — otherwise the general 12-month period applies.'),
    body('This is an express warranty given by us in addition to, and does not limit or replace, any consumer guarantees under the Australian Consumer Law, or any statutory warranties implied under the Home Building Act 1989 (NSW) for residential building work — both of which may provide for a longer warranty period and cannot be excluded by this document.'),

    h1('3. What’s Excluded'),
    body('This warranty does not cover:'),
    bullet('Fair wear and tear;'),
    bullet('Damage caused by misuse, negligence, or unauthorised alteration of the Works by you or a third party;'),
    bullet('Damage from external causes such as power surges, lightning strikes, storms, flooding, or pest activity;'),
    bullet('Faults in materials or equipment supplied by you rather than by Prophase — these remain your responsibility;'),
    bullet('Pre-existing faults in the property’s electrical installation that were not part of the original scope of Works;'),
    bullet('Consumable items such as light globes, batteries, and fuses;'),
    bullet('Work carried out or modified by anyone other than Prophase Data and Electrical after completion.'),

    h1('4. Manufacturer Warranties'),
    body('Products and equipment we supply — for example, switchboards, smoke alarms, or data equipment — may carry a separate manufacturer’s warranty. A claim relating to a defect in the product itself, rather than in our installation of it, is directed to the manufacturer in the first instance. We’re happy to help you make that claim.'),

    h1('5. Your Consumer Guarantee Rights'),
    body('Our services come with guarantees that cannot be excluded under the Australian Consumer Law. For major failures with the service, you are entitled: to cancel your service contract with us; and to a refund for the unused portion, or to compensation for its reduced value. You are also entitled to choose a refund or replacement for major failures with goods. If a failure with the goods or service does not amount to a major failure, you are entitled to have problems with the service rectified in a reasonable time and, if this is not done, to cancel your contract and obtain a refund for the unused portion of the contract. You are also entitled to be compensated for any other reasonably foreseeable loss or damage from a failure in the goods or service.'),

    h1('6. How to Make a Warranty Claim'),
    body('To make a claim under this warranty, contact us with:'),
    bullet('Your name, address, and job/invoice reference number;'),
    bullet('A description of the issue; and'),
    bullet('Photos, if possible.'),
    bodyRuns([
      new TextRun({ text: 'Contact: ', bold: true, size: 21, font: 'Arial', color: INK }),
      new TextRun({ text: 'Justin 0405 309 880  ·  Byron 0426 682 623  ·  [insert business email]', size: 21, font: 'Arial', color: '262626' })
    ]),

    h1('7. Our Response'),
    body('We will assess your claim and, where the issue is a defect in our workmanship covered by this warranty, will rectify it at no additional cost within a reasonable time. We may need to inspect the issue on-site before confirming whether it is covered.'),

    h1('8. Warranty Details'),
    detailsTable,

    new Paragraph({ spacing: { before: 260 }, children: [
      new TextRun({ text: 'Issued by Prophase Data and Electrical  ·  Sydney, NSW', italics: true, size: 19, font: 'Arial', color: GREY })
    ]})
  ];

  const doc = new Document({
    styles: baseStyles,
    numbering,
    sections: [{ properties: { page: PAGE }, footers: { default: footer() }, children }]
  });
  return Packer.toBuffer(doc);
}

// ---------------------------------------------------------------------
// Employment contracts (internal HR documents, not client-facing) —
// blank templates only, no per-employee auto-fill.
// ---------------------------------------------------------------------

function partyTable(employeeLabel) {
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [half, CONTENT_WIDTH - half],
    rows: [
      new TableRow({ children: [labelCell('Employer', half), labelCell(employeeLabel, CONTENT_WIDTH - half)] }),
      new TableRow({ children: [valueCell('Prophase Data and Electrical', half), valueCell(`Name: ${blank(30)}`, CONTENT_WIDTH - half)] }),
      new TableRow({ children: [valueCell('ABN: [insert ABN]', half), valueCell(`Address: ${blank(26)}`, CONTENT_WIDTH - half)] }),
      new TableRow({ children: [valueCell('Address: [insert business address]', half), valueCell(`Date of Birth: ${blank(18)}`, CONTENT_WIDTH - half)] }),
      new TableRow({ children: [valueCell('', half), valueCell(`Phone: ${blank(28)}`, CONTENT_WIDTH - half)] }),
      new TableRow({ children: [valueCell('', half), valueCell(`Email: ${blank(28)}`, CONTENT_WIDTH - half)] }),
      new TableRow({ children: [valueCell('', half), valueCell(`Emergency Contact: ${blank(20)}`, CONTENT_WIDTH - half)] })
    ]
  });
}

function signatureTable() {
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [half, CONTENT_WIDTH - half],
    rows: [
      new TableRow({ children: [labelCell('Employer', half), labelCell('Employee', CONTENT_WIDTH - half)] }),
      new TableRow({ children: [valueCell(`Name: ${blank(28)}`, half), valueCell(`Name: ${blank(28)}`, CONTENT_WIDTH - half)] }),
      new TableRow({ children: [valueCell(`Signature: ${blank(24)}`, half), valueCell(`Signature: ${blank(24)}`, CONTENT_WIDTH - half)] }),
      new TableRow({ children: [valueCell(`Date: ${blank(26)}`, half), valueCell(`Date: ${blank(26)}`, CONTENT_WIDTH - half)] })
    ]
  });
}

// Clauses common to both the Technician and Apprentice contracts, so the
// two documents don't drift out of sync on things like termination notice
// or WHS wording.
function terminationClause(clauseNumber) {
  return [
    h1(`${clauseNumber}. Termination`),
    bullet('Either party may terminate this Contract by giving the notice required under section 117 of the Fair Work Act 2009 (Cth), based on the Employee’s period of continuous service: less than 1 year — 1 week; 1 to 3 years — 2 weeks; 3 to 5 years — 3 weeks; 5 years or more — 4 weeks (plus an additional 1 week if the Employee is over 45 years of age with at least 2 years’ continuous service).'),
    bullet('The Employer may terminate employment without notice in the case of serious misconduct.'),
    bullet('On termination, the Employee must return all Employer property, including tools, vehicle, keys, uniforms, and documents.')
  ];
}
function whsClause(clauseNumber) {
  return [
    h1(`${clauseNumber}. Work Health & Safety`),
    body('The Employee must comply with the Work Health and Safety Act 2011 (NSW), all reasonable safety directions, and the Employer’s safety procedures, and must report all incidents, near-misses, and hazards promptly.')
  ];
}
function confidentialityClause(clauseNumber) {
  return [
    h1(`${clauseNumber}. Confidentiality`),
    body('The Employee must not, during or after employment, disclose or use any confidential information of the Employer — including client lists, pricing, quotes, business systems, or trade secrets — other than as required to perform their duties or as required by law.')
  ];
}
function superClause(clauseNumber) {
  return [
    h1(`${clauseNumber}. Superannuation`),
    body('The Employer will pay superannuation guarantee contributions to the Employee’s nominated complying fund at the rate required under the Superannuation Guarantee (Administration) Act 1992 (Cth) — confirm the current legislated rate before finalising this contract, as it is periodically increased.')
  ];
}
function leaveClause(clauseNumber) {
  return [
    h1(`${clauseNumber}. Leave Entitlements`),
    body('Annual leave, personal/carer’s leave, compassionate and bereavement leave, parental leave, and public holidays are provided in accordance with the National Employment Standards under the Fair Work Act 2009 (Cth) and the Award. Full-time employees accrue 4 weeks’ paid annual leave per year (pro rata for part-time) and 10 days’ paid personal/carer’s leave per year (pro rata for part-time).')
  ];
}
function disputeGoverningClauses(disputeNum, governingNum) {
  return [
    h1(`${disputeNum}. Dispute Resolution`),
    body('The parties will attempt to resolve any dispute arising from this Contract in good faith before pursuing any other remedy, including through the Fair Work Commission.'),
    h1(`${governingNum}. Governing Law`),
    body('This Contract is governed by the laws of New South Wales, Australia.')
  ];
}

export async function buildTechnicianContractDocx() {
  const children = [
    ...titleBlock('Employment Contract — Electrical Technician', 'Full-time / part-time employment agreement'),

    body('This Employment Contract (“Contract”) is made between Prophase Data and Electrical (“Employer”) and the employee named below (“Employee”), and sets out the terms and conditions of the Employee’s employment.'),

    h1('1. The Parties'),
    partyTable('Employee'),

    h1('2. Position and Duties'),
    body('Position: Electrical Technician.'),
    bullet('The Employee is engaged to perform electrical installation, maintenance, fault-finding, testing, and compliance certification work, and any other duties reasonably within the Employee’s skills and qualifications, as directed by the Employer from time to time.'),
    bullet('The Employee must hold and maintain a current NSW electrical licence for the duration of employment, and must notify the Employer immediately in writing if that licence is suspended, cancelled, or restricted in any way.'),

    h1('3. Commencement and Type of Employment'),
    body(`Commencement Date: ${blank(20)}`),
    bodyRuns([
      new TextRun({ text: '☐ Full-time   ☐ Part-time (', size: 21, font: 'Arial', color: '262626' }),
      new TextRun({ text: blank(6), size: 21, font: 'Arial', color: '262626' }),
      new TextRun({ text: ' hours/week)   ☐ Casual', size: 21, font: 'Arial', color: '262626' })
    ]),
    body('This position is subject to a probationary period of 6 months from the Commencement Date, during which either party may terminate employment on 1 week’s notice.'),

    h1('4. Hours of Work'),
    body('Ordinary hours of work are those set out in the Electrical, Electronic and Communications Contracting Award 2020, or its successor (“the Award”), currently 38 ordinary hours per week, worked Monday to Friday within the spread of hours permitted by the Award, unless otherwise agreed. Overtime, penalty rates, and allowances (including travel, tool, and industry allowances) are payable in accordance with the Award.'),

    h1('5. Remuneration'),
    bullet(`Base rate of pay: $${blank(10)} per hour / annum (delete one), reviewed annually — this must not be less than the minimum rate prescribed by the Award for the Employee’s classification, as varied from time to time by the Fair Work Commission.`),
    bullet('Paid weekly / fortnightly (delete one) by direct bank transfer.'),
    bullet('The Employer will comply with all applicable Award, National Employment Standards, and Fair Work Act 2009 (Cth) obligations regarding pay, allowances, and record-keeping.'),

    ...superClause(6),
    ...leaveClause(7),

    h1('8. Vehicle, Tools & Equipment'),
    bullet('Where applicable, the Employer will provide a company vehicle, tools, and PPE for use in carrying out the Employee’s duties. This property remains the Employer’s at all times and must be returned in good condition on request or on termination of employment.'),
    bullet('The Employee must take reasonable care of all tools, equipment, and vehicles provided, and report any damage, loss, or defect promptly.'),

    ...whsClause(9),
    ...confidentialityClause(10),

    h1('11. Intellectual Property'),
    body('Any designs, systems, documents, or improvements created by the Employee in the course of employment belong to the Employer.'),

    ...terminationClause(12),

    h1('13. Post-Employment Restraint'),
    body(`For a period of 3 months after the end of employment, the Employee must not solicit or accept work from any client of the Employer that the Employee worked with or was introduced to during the last 12 months of employment. This restraint applies only to the extent it is reasonable and necessary to protect the Employer’s legitimate business interests.`),

    ...disputeGoverningClauses(14, 15),

    h1('16. Entire Agreement'),
    body('This Contract, together with the Award and the National Employment Standards, contains the entire agreement between the parties regarding the Employee’s employment and supersedes all prior discussions or agreements. Any variation must be in writing and signed by both parties.'),

    h1('17. Acknowledgement and Signature'),
    body('By signing below, both parties confirm that they have read, understood, and agree to be bound by this Contract.'),
    new Paragraph({ spacing: { before: 160, after: 200 }, children: [] }),
    signatureTable()
  ];

  const doc = new Document({
    styles: baseStyles,
    numbering,
    sections: [{ properties: { page: PAGE }, footers: { default: footer() }, children }]
  });
  return Packer.toBuffer(doc);
}

export async function buildApprenticeContractDocx() {
  const children = [
    ...titleBlock('Employment Contract — Apprentice Electrician', 'Apprenticeship employment agreement'),

    body('This Employment Contract (“Contract”) is made between Prophase Data and Electrical (“Employer”) and the apprentice named below (“Apprentice”), and sets out the terms and conditions of the Apprentice’s employment.'),

    bodyRuns([
      new TextRun({ text: 'Note on the Training Contract: ', bold: true, size: 21, font: 'Arial', color: INK }),
      new TextRun({ text: 'this Employment Contract governs the Apprentice’s terms of employment only. It does not replace, and must be read together with, the formal Training Contract that must be registered with Training Services NSW (or the relevant State Training Authority) for this apprenticeship, and the Apprentice’s enrolment with a Registered Training Organisation for the relevant qualification (e.g. Certificate III in Electrotechnology Electrician, UEE30820). If a registered Training Contract is not yet in place, contact Training Services NSW or an Australian Apprenticeship Support Network provider before the Apprentice commences work.', size: 21, font: 'Arial', color: '262626' })
    ]),

    h1('1. The Parties'),
    partyTable('Apprentice'),

    h1('2. Position and Term of Apprenticeship'),
    bullet(`Position: Apprentice Electrician — Year ${blank(4)} of a nominal 4-year apprenticeship, subject to competency-based completion under the registered Training Contract.`),
    bullet('The Apprentice will work under the direct supervision of a licensed electrician at all times when carrying out electrical work, in accordance with NSW electrical licensing and work health and safety requirements.'),

    h1('3. Commencement'),
    body(`Commencement Date: ${blank(20)}`),
    body('Apprenticeships are not ordinarily subject to a separate probationary period beyond what is provided for under the registered Training Contract; note any additional probation here if separately agreed.'),

    h1('4. Hours of Work'),
    body('Hours of work are as set out in the Award, including any special provisions for apprentices, and are inclusive of time reasonably required to attend training with the Registered Training Organisation.'),

    h1('5. Remuneration'),
    bullet(`The Apprentice will be paid no less than the applicable percentage of the qualified tradesperson rate for the Apprentice’s year of apprenticeship, as set out in the Electrical, Electronic and Communications Contracting Award 2020, as varied from time to time by the Fair Work Commission. Current applicable rate: $${blank(10)} per hour — confirm against the current Award before finalising.`),
    bullet('Paid weekly / fortnightly (delete one) by direct bank transfer.'),

    h1('6. Training Obligations'),
    bullet('The Employer will release the Apprentice, without loss of pay as required by the Award and National Employment Standards, to attend all required training, assessment, and TAFE/RTO block or day-release sessions under the registered Training Contract.'),
    bullet('The Apprentice must attend all required training and complete all competency requirements under the Training Contract.'),

    h1('7. Supervision'),
    body('The Apprentice must not carry out electrical work unsupervised. All work must be performed under the direct supervision of a licensed electrician, consistent with NSW electrical licensing regulations.'),

    ...superClause(8),
    ...leaveClause(9),

    h1('10. Tools, PPE & Allowances'),
    body('The Employer will provide the Apprentice with a tool allowance or starter tool kit in accordance with the Award. The Apprentice must take reasonable care of all tools and equipment provided.'),

    ...whsClause(11),
    ...confidentialityClause(12),

    h1('13. Termination and Training Contract Cancellation'),
    bullet('Either party may terminate this Contract by giving the notice required under section 117 of the Fair Work Act 2009 (Cth) (see the technician contract’s notice scale, applied equally here) or as otherwise provided for under the registered Training Contract.'),
    bullet('Ending the employment relationship will generally also require the Training Contract to be formally cancelled or transferred through Training Services NSW (or the relevant State Training Authority) — this is a separate legal step from ending this Employment Contract.'),

    ...disputeGoverningClauses(14, 15),

    h1('16. Entire Agreement'),
    body('This Contract, together with the registered Training Contract, the Award, and the National Employment Standards, contains the entire agreement between the parties regarding the Apprentice’s employment and supersedes all prior discussions or agreements. Any variation must be in writing and signed by both parties.'),

    h1('17. Acknowledgement and Signature'),
    body('By signing below, both parties confirm that they have read, understood, and agree to be bound by this Contract.'),
    new Paragraph({ spacing: { before: 160, after: 200 }, children: [] }),
    signatureTable()
  ];

  const doc = new Document({
    styles: baseStyles,
    numbering,
    sections: [{ properties: { page: PAGE }, footers: { default: footer() }, children }]
  });
  return Packer.toBuffer(doc);
}
