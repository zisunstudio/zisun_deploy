/**
 * Two small hand-drawn marks used across the storefront.
 *
 * `Underline` is a single loose stroke under a heading — the kind a person
 * draws under a word they mean. `Bloom` is a line flower borrowed from the
 * embroidery on the first kurti, used faintly behind the founder's note.
 * Both are one path each and take `currentColor`, so they sit in any ink.
 */
export function Underline({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 12" className={`h-2.5 w-24 ${className}`} fill="none" aria-hidden="true">
      <path d="M2 8.5c18-4 36-6 54-5.5 20 .5 40 3 62 1" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function Bloom({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 200" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="60" cy="46" r="10" />
      <path d="M60 22c8-10 22-8 22 4s-14 14-22 8c-8 6-22 4-22-8s14-14 22-4z" />
      <path d="M36 46c-10 8-8 22 4 22s14-14 8-22c6-8 4-22-8-22s-14 14-4 22z" opacity=".9" />
      <path d="M84 46c10 8 8 22-4 22s-14-14-8-22c-6-8-4-22 8-22s14 14 4 22z" opacity=".9" />
      <path d="M60 74v110" />
      <path d="M60 110c-16-2-26-10-30-24 14 0 24 8 30 24zM60 140c16-2 26-10 30-24-14 0-24 8-30 24zM60 168c-16-2-26-10-30-24 14 0 24 8 30 24z" />
    </svg>
  );
}
