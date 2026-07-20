'use client';
export default function PrintButton() {
  return <button className="btn amber" onClick={() => window.print()}>Print / Save as PDF</button>;
}
