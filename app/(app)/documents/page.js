export default async function DocumentsPage() {
  return (
    <>
      <h2 className="section-title">Documents</h2>
      <div className="panel">
        <p className="small-note" style={{ marginBottom: 16 }}>
          Blank templates for handing to a customer before a quote or job exists. For a specific customer, use the
          <strong> Agreement</strong> button on an approved quote, or the <strong>Warranty</strong> button on a completed job,
          to get a version pre-filled with their details.
        </p>
        <div className="row-actions" style={{ gap: 12 }}>
          <a className="btn amber sm" href="/api/documents/agreement-template">Download Client Work Agreement</a>
          <a className="btn amber sm" href="/api/documents/warranty-template">Download Workmanship Warranty</a>
        </div>
      </div>
    </>
  );
}
