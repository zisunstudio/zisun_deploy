import React from "react";

/**
 * The Journal's Markdown, rendered as elements - never as HTML.
 *
 * Article bodies are drafted by a model and edited by the founder, so the
 * renderer takes no raw HTML at all: there is no `dangerouslySetInnerHTML`
 * anywhere in this file, and anything that is not one of the few marks below
 * is printed as the text it is. The supported subset is what an article
 * actually needs: ## and ### headings, paragraphs, - and 1. lists, > quotes,
 * **bold**, *italic*, and [links](…) restricted to this site and https.
 */
const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;

function href(raw: string): string | null {
  const u = raw.trim();
  if (u.startsWith("/")) return u;                       // our own pages
  if (/^https:\/\//i.test(u)) return u;                  // never http:, never javascript:
  return null;
}

function inline(text: string, key: string): React.ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((part, i) => {
    const k = `${key}-${i}`;
    let m = /^\*\*([^*]+)\*\*$/.exec(part);
    if (m) return <strong key={k} className="font-semibold">{m[1]}</strong>;
    m = /^\*([^*]+)\*$/.exec(part);
    if (m) return <em key={k}>{m[1]}</em>;
    m = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (m) {
      const to = href(m[2]);
      if (!to) return <span key={k}>{m[1]}</span>;
      const external = to.startsWith("http");
      return (
        <a key={k} href={to} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
           className="text-burgundy underline underline-offset-4 decoration-burgundy/30 hover:decoration-burgundy">
          {m[1]}
        </a>
      );
    }
    return <React.Fragment key={k}>{part}</React.Fragment>;
  });
}

export function Markdown({ source }: { source: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = source.replace(/\r/g, "").split("\n");
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = () => {
    if (!list) return;
    const items = list.items.map((t, i) => <li key={i} className="leading-relaxed">{inline(t, `li${blocks.length}-${i}`)}</li>);
    blocks.push(list.ordered
      ? <ol key={blocks.length} className="list-decimal pl-5 space-y-1.5 text-[16px] text-ink/85 my-5">{items}</ol>
      : <ul key={blocks.length} className="list-disc pl-5 space-y-1.5 text-[16px] text-ink/85 my-5">{items}</ul>);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const li = /^\s*[-*]\s+(.*)$/.exec(line);
    const oli = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (li || oli) {
      const ordered = !!oli;
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push((li ?? oli)![1]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const text = inline(h[2], `h${blocks.length}`);
      blocks.push(level <= 2
        ? <h2 key={blocks.length} className="font-display text-[28px] lg:text-[32px] leading-tight text-ink mt-12 mb-3">{text}</h2>
        : <h3 key={blocks.length} className="font-display text-[22px] leading-tight text-ink mt-8 mb-2">{text}</h3>);
      continue;
    }
    const q = /^>\s?(.*)$/.exec(line);
    if (q) {
      blocks.push(<blockquote key={blocks.length} className="border-l-2 border-burgundy/40 pl-4 my-6 font-display text-[20px] leading-snug text-ink/80">{inline(q[1], `q${blocks.length}`)}</blockquote>);
      continue;
    }
    blocks.push(<p key={blocks.length} className="text-[16px] leading-[1.75] text-ink/85 my-4">{inline(line, `p${blocks.length}`)}</p>);
  }
  flush();
  return <>{blocks}</>;
}

/** Plain text of an article body, for a meta description or a summary. */
export function plainText(source: string, max = 200): string {
  const s = source.replace(/[#>*_`]/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1).replace(/\s+\S*$/, "") + "…" : s;
}
