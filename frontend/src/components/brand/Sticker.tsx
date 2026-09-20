"use client";

/**
 * A round sticker with text running around its edge, turning slowly.
 *
 * The one deliberately playful object on the page. It sits on the hero like
 * something pressed onto a parcel, and it says the two words that matter
 * this season. Turns at 24s a revolution — noticeable when you look, not
 * when you don't — and holds still under reduced-motion.
 */
export function Sticker({ text = "new drop · handloom · small batch · ", className = "" }: { text?: string; className?: string }) {
  const id = "sticker-path";
  return (
    <div className={`relative h-[92px] w-[92px] lg:h-[120px] lg:w-[120px] ${className}`} aria-hidden="true">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full motion-safe:animate-[spin_24s_linear_infinite]">
        <defs>
          <path id={id} d="M50,50 m-36,0 a36,36 0 1,1 72,0 a36,36 0 1,1 -72,0" />
        </defs>
        <circle cx="50" cy="50" r="48" className="fill-haldi" />
        <text className="fill-ink font-sans font-bold uppercase" style={{ fontSize: "10.5px", letterSpacing: "0.2em" }}>
          <textPath href={`#${id}`}>{text}{text}</textPath>
        </text>
      </svg>
      <svg viewBox="0 0 24 24" className="absolute inset-0 m-auto h-7 w-7 lg:h-9 lg:w-9 text-ink" fill="currentColor">
        <path d="M12 21s-7-4.6-9.3-8.6C.6 8.7 2.3 5 5.9 5c2 0 3.3 1.2 4.1 2.4C10.8 6.2 12.1 5 14.1 5c3.6 0 5.3 3.7 3.2 7.4C19 16.4 12 21 12 21z" />
      </svg>
    </div>
  );
}
