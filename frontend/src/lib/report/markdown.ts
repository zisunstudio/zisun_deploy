/**
 * The report as a file to hand to an AI assistant: ChatGPT, Claude, Gemini.
 *
 * Markdown, not JSON. All three read Markdown tables accurately, the founder
 * can read and check the same file herself, and it carries its own
 * instructions - so "upload this" is the whole of what she has to do. JSON
 * would be no clearer to the model, unreadable to her, and longer.
 *
 * The instructions are the part that matters. Left alone with a table of
 * small numbers, an assistant will invent benchmarks, treat 3 of 12 as a
 * trend and answer in consultant's English. So the file tells it who it is
 * talking to, to use only these numbers, to say when a number is too small
 * to trust, and what order to answer in. Her own question goes last, where
 * it is the freshest thing the model has read.
 */
import type { Report, Table } from "./build";

const cell = (v: string | number) => String(v).replace(/\|/g, "/").replace(/\n/g, " ");

export function tableToMarkdown(t: Table): string {
  const head = `| ${t.columns.map((c) => cell(c) || " ").join(" | ")} |`;
  // First column is a name (left); the rest are figures (right).
  const rule = `| ${t.columns.map((_, i) => (i === 0 ? "---" : "---:")).join(" | ")} |`;
  return [head, rule, ...t.rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n");
}

export function reportToMarkdown(r: Report): string {
  const out: string[] = [];
  out.push(`# ${r.title}: ${r.period}`, "");
  out.push(`Made ${r.generated}, from the shop's own console.`, "");
  out.push("> How to use this file: attach or paste all of it into ChatGPT, Claude or Gemini. Write your question at the very bottom, or send it as it is to get a plain summary.", "");

  out.push("## What I need from you", "");
  out.push(
    "I run ZISUN, a small Indian clothing label, on my own. ZISUN sells women's kurtas and co-ord sets on its own website, zisun.in, to customers in India. Prices are in Indian rupees. I run the shop from my phone and I am not technical.",
    "",
    "Please follow these rules:",
    "",
    "1. Use only the numbers in this file. If something is not here, say it is not here. Do not estimate it, and do not quote industry averages as if they were my numbers.",
    "2. Write for someone who is not technical: short sentences, everyday words, no marketing or analytics jargon. If you must use a term, explain it in a few words.",
    "3. This is a small shop. When a number is based on fewer than about 30 visits or orders, say it is too small to be sure about.",
    "4. If I have written a question at the bottom, answer that first.",
    "5. Otherwise answer in this order:",
    "   - What the numbers say, in three to five sentences.",
    "   - The one step where I lose the most people, with the numbers that show it.",
    "   - Up to three things to try this week, cheapest first, each tied to a number in this file.",
    "   - What to look at in next week's report to know whether it worked.",
    "6. Be direct. If the numbers do not support a conclusion, say so instead of guessing.",
    "7. Reply in the language I write in.",
    "",
  );

  out.push("## What the words mean", "");
  for (const [term, meaning] of r.definitions) out.push(`- **${term}:** ${meaning}`);
  out.push("");

  out.push("## The numbers", "");
  for (const s of r.sections) {
    out.push(`### ${s.title}`, "");
    if (s.note) out.push(s.note, "");
    if (s.table) out.push(tableToMarkdown(s.table), "");
    if (s.lines) { for (const l of s.lines) out.push(`- ${l}`); out.push(""); }
  }

  out.push("## Things to keep in mind about this data", "");
  for (const c of r.caveats) out.push(`- ${c}`);
  out.push("");

  out.push("## My question", "", "(Write your question here. If you leave this empty, give me the summary described above.)", "");
  return out.join("\n");
}
