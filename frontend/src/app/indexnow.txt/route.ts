import { INDEXNOW_KEY } from "@/lib/indexnow";

/** The IndexNow ownership file. Submissions name this as their keyLocation. */
export function GET() {
  return new Response(INDEXNOW_KEY, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
