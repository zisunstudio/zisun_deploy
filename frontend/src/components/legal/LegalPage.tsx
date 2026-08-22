import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { POLICY_LAST_UPDATED, HAS_PLACEHOLDERS } from "@/lib/legal";

/** Shared shell for every policy page — consistent header, back link, typography. */
export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-gray-200 px-4 py-3 flex items-center gap-3 lg:px-8">
        <Link href="/" aria-label="Back to home" className="p-1 -ml-1">
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </Link>
        <h1 className="font-serif text-lg font-bold text-[#5C3317]">{title}</h1>
      </header>

      {/* ~75 characters is the readable maximum; the full column is far past it. */}
      <div className="px-5 py-6 pb-24 lg:max-w-3xl lg:mx-auto">
        <p className="text-xs text-muted mb-6">Last updated: {POLICY_LAST_UPDATED}</p>

        {HAS_PLACEHOLDERS && process.env.NODE_ENV !== "production" && (
          <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <strong>Dev notice:</strong> company details in{" "}
            <code className="bg-amber-100 px-1 rounded">src/lib/legal.ts</code> still
            contain TODO placeholders. Fill them in before launch — Razorpay checks
            these against your KYC documents.
          </div>
        )}

        <article className="legal-prose space-y-5 text-sm leading-relaxed text-gray-700">
          {children}
        </article>
      </div>
    </div>
  );
}

export function Section({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold text-gray-900 text-base">{heading}</h2>
      {children}
    </section>
  );
}
