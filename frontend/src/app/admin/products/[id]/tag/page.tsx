"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { adminApi } from "@/lib/adminApi";
import { Weave } from "@/components/Weave";
import type { WeaveSpec } from "@/lib/weave";
import { BRAND } from "@/lib/brand";
import { Page, Card, Button, Field, Select } from "@/components/admin/ui";

/**
 * Hang tags for one piece.
 *
 * The number on a piece's product page ("Weave No. D20A") is the same number
 * printed here, from the same seed, so the parcel carries the cloth she saw
 * on the site and on the "It's yours" screen after paying. That continuity -
 * screen, then paper in her hands - is the thing a marketplace listing can
 * never give, and it costs a sheet of card.
 *
 * One tag per colour the piece comes in (the weave is re-dyed for each), as
 * many copies as she needs. Each is a fold-over: front on the left, back on
 * the right, fold down the middle, punch at the dot. Six to an A4 sheet at
 * 100 x 85 mm. Printing hides the console around the sheet.
 */
export default function TagSheet({ params }: { params: { id: string } }) {
  const { data: product, isLoading } = useQuery({
    queryKey: ["admin", "product", params.id],
    queryFn: async () => (await adminApi.get(`/products/${params.id}`)).data,
  });
  const [copies, setCopies] = useState(2);

  if (isLoading || !product) {
    return <Page title="Hang tags"><div className="h-40 rounded-xl bg-gray-100 animate-pulse" /></Page>;
  }

  const colours: string[] = Array.from(new Set(
    (product.variants ?? [])
      .filter((v: any) => v.is_active && v.color)
      .map((v: any) => String(v.color).trim()),
  ));
  const list = colours.length ? colours : [null];
  const tags = list.flatMap((c) => Array.from({ length: copies }, () => c));

  return (
    <Page
      title="Hang tags"
      description={`${product.name} — ${list.length} colour${list.length === 1 ? "" : "s"}, ${tags.length} tag${tags.length === 1 ? "" : "s"}. Fold each down the middle and punch at the dot.`}
      actions={<Button variant="primary" onClick={() => window.print()}><Printer className="w-4 h-4" /> Print</Button>}
    >
      <Card className="mb-4 print:hidden">
        <Field label="Copies of each colour" hint="Six tags fit on one A4 sheet. Print on card, at 100% scale.">
          <Select value={copies} onChange={(e) => setCopies(Number(e.target.value))}>
            {[1, 2, 3, 4, 6, 12].map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </Field>
      </Card>

      {/* Print only the sheet. The console's own chrome is hidden by
          visibility rather than by editing the layout, so this page needs
          no special route outside /admin. */}
      <style>{`
        @page { size: A4; margin: 8mm 5mm; }
        @media print {
          body * { visibility: hidden !important; }
          .tag-sheet, .tag-sheet * { visibility: visible !important; }
          .tag-sheet { position: absolute; left: 0; top: 0; width: 200mm; }
        }
      `}</style>

      <div className="tag-sheet overflow-x-auto">
        <div className="grid grid-cols-[100mm_100mm] gap-0 w-[200mm] bg-white">
          {tags.map((colour, i) => (
            <Tag key={i} productId={product.id} name={product.name} namedFor={product.named_for} washCare={product.wash_care} fabric={product.fabric_composition} colour={colour} />
          ))}
        </div>
      </div>
    </Page>
  );
}

function Tag({ productId, name, namedFor, washCare, fabric, colour }: {
  productId: string;
  name: string;
  namedFor?: string | null;
  /** The piece's own recorded care; nothing generic is printed in its place. */
  washCare?: string | null;
  /** The recorded fabric - never a brand-level guess (one live piece is silk). */
  fabric?: string | null;
  colour: string | null;
}) {
  const [spec, setSpec] = useState<WeaveSpec | null>(null);
  return (
    <div className="grid grid-cols-2 h-[85mm] border border-dashed border-gray-300 break-inside-avoid text-ink">
      {/* Front */}
      <div className="relative flex flex-col items-center px-[5mm] pt-[6mm] pb-[4mm] border-r border-dotted border-gray-300">
        <span aria-hidden className="absolute top-[3mm] left-1/2 -translate-x-1/2 h-[3mm] w-[3mm] rounded-full border border-gray-400" />
        <p className="font-display text-[15pt] tracking-[0.18em] leading-none mt-[2mm]">{BRAND.name}</p>
        <p className="mt-[1mm] text-[5.5pt] uppercase tracking-[0.2em] text-muted">{BRAND.tagline}</p>
        <div className="mt-[4mm] h-[30mm] w-[38mm] overflow-hidden rounded-[1mm] bg-rose">
          <Weave seed={productId} colours={colour ? [colour] : []} still label={`Weave of ${name}`} onSpec={setSpec} />
        </div>
        {spec && (
          <p className="mt-[2.5mm] text-[6.5pt] uppercase tracking-[0.16em] tabular-nums">
            ZISUN mark No. {spec.code}
          </p>
        )}
        <p className="mt-auto font-display text-[10.5pt] leading-tight text-center line-clamp-2">{name}</p>
      </div>
      {/* Back */}
      <div className="flex flex-col px-[5mm] pt-[7mm] pb-[4mm] text-[7pt] leading-[1.45]">
        {namedFor?.trim() && <p className="font-display italic text-[9pt] leading-snug">{namedFor.trim()}</p>}
        <p className="mt-[3mm] text-ink/80">
          {fabric?.trim() ? `${fabric.trim()}. ` : ""}Its ZISUN mark on the front is drawn from its colours — the same one as on its page.
        </p>
        {colour && <p className="mt-[2mm] text-muted">{colour}</p>}
        <div className="mt-auto space-y-[2.5mm]">
          <p className="flex items-end gap-[2mm]">Size <span className="flex-1 border-b border-gray-400 h-[3.5mm]" /></p>
          {washCare?.trim() && <p className="text-[6.5pt] text-muted line-clamp-2">{washCare.trim()}</p>}
          <p className="text-[7pt] tracking-[0.08em]">zisun.in</p>
        </div>
      </div>
    </div>
  );
}
