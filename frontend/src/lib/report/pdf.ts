/**
 * The report as a PDF: something to send to a person.
 *
 * jsPDF and its table plugin are loaded only when she taps the button, so
 * the console pays nothing for them otherwise. The built-in fonts cover
 * Western European characters only - there is no rupee sign and no arrow -
 * so text is passed through `forPdf` first: "₹1,349" is written "Rs 1,349".
 * Shipping a font for one glyph would add more weight than the library.
 */
import type { Report } from "./build";

/** Characters the PDF's built-in fonts cannot draw, in words they can. */
export function forPdf(v: string | number): string {
  return String(v)
    .replace(/₹\s?/g, "Rs ")
    .replace(/→/g, "to")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    // anything else outside Latin-1 would print as a blank box
    .replace(/[^\x09\x0a\x20-\x7e\xa0-\xff]/g, "");
}

/** The PDF as bytes (what the test checks; a browser wraps it in a Blob below). */
export async function reportToPdfBytes(r: Report): Promise<ArrayBuffer> {
  // The two packages export differently under a bundler and under Node
  // (default, named, or default-of-default), so take whichever is there.
  const [pdfMod, tableMod] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const pick = (m: any, name: string) => m?.[name] ?? m?.default?.[name] ?? m?.default?.default ?? m?.default;
  const jsPDF = pick(pdfMod, "jsPDF") as typeof import("jspdf").jsPDF;
  const autoTable = pick(tableMod, "autoTable") as typeof import("jspdf-autotable").default;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const M = 42;
  let y = M + 6;
  const INK: [number, number, number] = [26, 20, 23], MUTED: [number, number, number] = [110, 104, 106], LINE: [number, number, number] = [225, 220, 216];

  const room = (need: number) => { if (y + need > H - M - 16) { doc.addPage(); y = M; } };
  const para = (text: string, size: number, colour: [number, number, number], gap = 4, style: "normal" | "bold" = "normal") => {
    doc.setFont("helvetica", style); doc.setFontSize(size); doc.setTextColor(...colour);
    const lines = doc.splitTextToSize(forPdf(text), W - M * 2) as string[];
    const lh = size * 1.35;
    for (const line of lines) { room(lh); doc.text(line, M, y); y += lh; }
    y += gap;
  };

  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(...INK);
  doc.text(forPdf(r.title), M, y); y += 22;
  para(r.period, 12, INK, 2);
  para(`Made ${r.generated}, from the shop's own console.`, 9, MUTED, 12);

  for (const s of r.sections) {
    // keep a heading with at least the start of what follows it
    room(110);
    para(s.title, 12.5, INK, 2, "bold");
    if (s.note) para(s.note, 9, MUTED, 4);
    if (s.table) {
      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M, top: M, bottom: M + 10 },
        head: [s.table.columns.map(forPdf)],
        body: s.table.rows.map((row) => row.map(forPdf)),
        theme: "plain",
        styles: { font: "helvetica", fontSize: 9, cellPadding: { top: 4, bottom: 4, left: 4, right: 4 }, textColor: INK, lineColor: LINE, lineWidth: { bottom: 0.5 } as never, overflow: "linebreak" },
        headStyles: { fontStyle: "bold", textColor: MUTED, fontSize: 8, lineWidth: { bottom: 0.8 } as never },
        // names on the left, figures on the right
        columnStyles: Object.fromEntries(s.table.columns.map((_, i) => [i, { halign: i === 0 ? "left" : "right" }])),
        didParseCell: (d: any) => { if (d.section === "head" && d.column.index > 0) d.cell.styles.halign = "right"; },
      });
      y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 16;
    }
    if (s.lines) { for (const l of s.lines) para(`-  ${l}`, 9.5, INK, 2); y += 8; }
  }

  room(60);
  para("What the words mean", 12.5, INK, 2, "bold");
  for (const [term, meaning] of r.definitions) para(`${term}: ${meaning}`, 9, INK, 1);
  y += 10;
  room(40);
  para("Things to keep in mind", 12.5, INK, 2, "bold");
  for (const c of r.caveats) para(`-  ${c}`, 9, INK, 1);

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(forPdf(`${r.title}  -  ${r.period}`), M, H - 22);
    doc.text(`${p} / ${pages}`, W - M, H - 22, { align: "right" });
  }
  return doc.output("arraybuffer");
}

export async function reportToPdf(r: Report): Promise<Blob> {
  return new Blob([await reportToPdfBytes(r)], { type: "application/pdf" });
}
