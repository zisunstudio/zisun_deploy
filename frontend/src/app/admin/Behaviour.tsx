"use client";

import { Card, TableScroll, td, th } from "@/components/admin/ui";
import { BarList, fmtInt } from "@/components/admin/charts";
import { CLICK, PAGE, SECTION, label } from "@/lib/report/labels";

/**
 * What visitors did, in the founder's words.
 *
 * The payload is `behaviour` on the dashboard (backend services/behaviour.py).
 * Everything here is counted in visits, never raw events, and every name a
 * developer chose (page kinds, section keys, button names) is translated
 * before it reaches the screen - "fit_find_size" is not a thing she tapped;
 * "Find your size" is.
 */
export type BehaviourData = {
  recording_since: string | null;
  visits: number;
  page_views: number;
  one_page_visits: number;
  glanced_and_left: number;
  landing: { page: string; visits: number; share: number | null }[];
  pages: { page: string; views: number; visits: number; median_seconds: number | null; read_half: number | null; read_to_end: number | null; measured: number }[];
  home_sections: { section: string; visits: number; share: number | null }[];
  home_visits: number;
  clicks: { name: string; taps: number; visits: number }[];
};

const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const secs = (s: number | null) => (s == null ? "—" : s < 60 ? `${Math.round(s)} sec` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} sec`);

export function Behaviour({ b, part, Section, Stat }: {
  b: BehaviourData | undefined;
  /** "arrivals": how many came and where they landed. "onsite": what they did once here. */
  part: "arrivals" | "onsite";
  Section: React.ComponentType<{ title: string; hint?: string; children: React.ReactNode }>;
  Stat: React.ComponentType<{ label: string; value: React.ReactNode; note?: string; empty?: boolean }>;
}) {
  if (!b || b.visits === 0) {
    if (part === "arrivals") return null;
    return (
      <Section title="What visitors did on the site">
        <Card>
          <p className="text-sm text-gray-700">Nothing recorded yet in these days.</p>
          <p className="mt-1 text-xs text-gray-500 max-w-prose">
            From 4 Oct 2026 the site records every arrival, how long each page was read, how far down it was scrolled, and what was tapped. It fills in as visitors arrive; earlier visits were only recorded once someone looked at a piece.
          </p>
        </Card>
      </Section>
    );
  }
  const since = b.recording_since ? new Date(b.recording_since).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : null;
  const stayed = b.visits - b.one_page_visits;
  if (part === "arrivals") return (
    <>
      <Section title="Arrivals" hint={`Every visit, counted when the first page opens${since ? ` (recorded since ${since})` : ""}. A visit is one sitting by one visitor.`}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Visits" value={fmtInt(b.visits)} note={`${fmtInt(b.page_views)} pages opened`} />
          <Stat label="Went further" value={fmtInt(stayed)} note={`${pct(b.visits ? stayed / b.visits : null)} opened a second page`} empty={stayed === 0} />
          <Stat label="One page only" value={fmtInt(b.one_page_visits)} note="saw one page, then left" empty={b.one_page_visits === 0} />
          <Stat label="Glanced and left" value={fmtInt(b.glanced_and_left)} note="under 10 seconds, nothing tapped" empty={b.glanced_and_left === 0} />
        </div>
      </Section>

      <Section title="The first page they saw" hint="Where each visit began. A link from a reel should begin on that piece's page, not the home page.">
        <Card>
          <BarList caption="Visits by the first page seen" valueName="Visits"
            rows={b.landing.map((l) => ({ key: l.page, label: label(PAGE, l.page), value: l.visits, detail: `${pct(l.share)} of visits began here` }))} />
        </Card>
      </Section>

    </>
  );
  return (
    <>
      <Section title="How far down the home page they got" hint={`Of ${fmtInt(b.home_visits)} ${b.home_visits === 1 ? "visit" : "visits"} to the home page: how many held each part on screen for about a second. Read top to bottom; the drop-off between two rows is where they stop.`}>
        <Card>
          <BarList caption="Home page parts seen, top to bottom" valueName="Visits" empty="No home page visits in these days."
            rows={b.home_sections.map((s) => ({ key: s.section, label: label(SECTION, s.section), value: s.visits, detail: `${pct(s.share)} of home page visits reached this` }))} />
        </Card>
      </Section>

      <Section title="Are they reading?" hint="For each kind of page: the typical time it was actually on screen, and how far down it was scrolled. Measured once per page, when she leaves it.">
        <Card padded={false}>
          <TableScroll minWidth={560}>
            <table className="w-full">
              <thead className="border-b border-gray-100">
                <tr><th className={th}>Page</th><th className={th}>Opened</th><th className={th}>Typical time</th><th className={th}>Read past half</th><th className={th}>Read to the end</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {b.pages.map((p) => (
                  <tr key={p.page}>
                    <td className={td}>{label(PAGE, p.page)}</td>
                    <td className={`${td} tabular-nums`}>{fmtInt(p.views)}</td>
                    <td className={`${td} tabular-nums`}>{secs(p.median_seconds)}</td>
                    <td className={`${td} tabular-nums`}>{pct(p.read_half)}</td>
                    <td className={`${td} tabular-nums`}>{pct(p.read_to_end)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </Card>
      </Section>

      <Section title="What they tapped" hint="Buttons and links, by how many visits used each. A piece opened from a card is counted under the pieces below, not here.">
        <Card>
          <BarList caption="Taps by button" valueName="Visits" empty="No taps recorded in these days."
            rows={b.clicks.map((c) => ({ key: c.name, label: label(CLICK, c.name), value: c.visits, detail: `${fmtInt(c.taps)} ${c.taps === 1 ? "tap" : "taps"} in all` }))} />
        </Card>
      </Section>
    </>
  );
}
