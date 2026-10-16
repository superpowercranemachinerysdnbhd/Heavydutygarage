"use client";
export default function PrintButton({ label = "Print / save as PDF" }: { label?: string }) {
  return <button type="button" className="btn small primary" onClick={() => window.print()}>{label}</button>;
}
