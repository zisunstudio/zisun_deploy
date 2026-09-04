"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { BRAND } from "@/lib/brand";
import { ZisunMark } from "@/components/brand/ZisunMark";

type Tone = "light" | "dark";
type Size = "sm" | "md" | "lg";

interface Props {
  /** `light` sets white type for use over a photograph. */
  tone?: Tone;
  size?: Size;
  /** Hide the tagline where the lockup is decoration rather than a signature. */
  showTagline?: boolean;
  /** The maker's line. Off by default - it belongs where the brand is being
   * introduced (footer, founder note), not in a header on every screen. */
  showSignature?: boolean;
  /** Play the entrance. Reserved for first impressions, not every header. */
  animate?: boolean;
  className?: string;
}

const NAME_SIZE: Record<Size, string> = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-4xl",
};

const TAGLINE_SIZE: Record<Size, string> = {
  sm: "text-[8px]",
  md: "text-[9px]",
  lg: "text-[11px]",
};

const LOGO_HEIGHT: Record<Size, number> = { sm: 22, md: 30, lg: 48 };

// Sized by height only. The mark is twice as tall as it is wide, so pinning
// both dimensions would letterbox it inside a square and open a gap beside the
// name. It stands a little taller than the cap height of the name, the way a
// maker's mark sits above a signature.
const MARK_SIZE: Record<Size, string> = {
  sm: "h-6 w-auto",
  md: "h-8 w-auto",
  lg: "h-12 w-auto",
};

const SIGNATURE_SIZE: Record<Size, string> = {
  sm: "text-[10px]",
  md: "text-[11px]",
  lg: "text-[13px]",
};

/**
 * The brand lockup: mark, name, tagline.
 *
 * Renders BRAND.logoSrc when a real logo exists and falls back to the wordmark
 * set in the brand serif until then — so the day the logo arrives, one constant
 * changes and every lockup on the site follows: header, login, splash, motion.
 *
 * The motion is deliberately slow and settling rather than bouncy. "Tales,
 * Antiqued." is a line about age, and a wordmark that springs into place argues
 * with it. The tagline's letter-spacing tightens as it arrives, which reads like
 * type being set rather than a UI element sliding in — the one flourish here,
 * and it is spent on the words rather than scattered across the lockup.
 */
export function Wordmark({
  tone = "dark",
  size = "md",
  showTagline = true,
  showSignature = false,
  animate = false,
  className = "",
}: Props) {
  const reduce = useReducedMotion();
  const play = animate && !reduce;

  const nameColour =
    tone === "light"
      ? "text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.55)]"
      : "text-foreground";
  const taglineColour =
    tone === "light"
      ? "text-white/90 drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]"
      : "text-primary";
  const signatureColour = tone === "light" ? "text-white/80" : "text-muted";

  const signature = showSignature ? (
    <span
      className={`font-serif italic mt-1 ${SIGNATURE_SIZE[size]} ${signatureColour}`}
    >
      {BRAND.signature}
    </span>
  ) : null;

  // A supplied logo file wins; otherwise the generated mark, which takes its
  // colour from the surrounding text and so reverses over a photograph without
  // a second asset.
  const mark = BRAND.logoSrc ? (
    <Image
      src={BRAND.logoSrc}
      alt={BRAND.name}
      height={LOGO_HEIGHT[size]}
      width={Math.round(LOGO_HEIGHT[size] * BRAND.logoAspect)}
      priority
      className={tone === "light" ? "drop-shadow-[0_1px_6px_rgba(0,0,0,0.55)]" : ""}
    />
  ) : (
    <span className={`inline-flex items-baseline gap-2 ${nameColour}`}>
      <ZisunMark animate={play} className={MARK_SIZE[size]} />
      <span className={`font-serif font-bold leading-none tracking-wide ${NAME_SIZE[size]}`}>
        {BRAND.name}
      </span>
    </span>
  );

  if (!play) {
    return (
      <div className={`inline-flex flex-col ${className}`}>
        {mark}
        {showTagline && (
          <span
            className={`font-semibold uppercase tracking-[0.22em] mt-0.5 ${TAGLINE_SIZE[size]} ${taglineColour}`}
          >
            {BRAND.tagline}
          </span>
        )}
        {signature}
      </div>
    );
  }

  return (
    <div className={`inline-flex flex-col ${className}`}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        {mark}
      </motion.div>
      {showTagline && (
        <motion.span
          className={`font-semibold uppercase mt-0.5 ${TAGLINE_SIZE[size]} ${taglineColour}`}
          initial={{ opacity: 0, letterSpacing: "0.5em" }}
          animate={{ opacity: 1, letterSpacing: "0.22em" }}
          transition={{ duration: 1.1, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          {BRAND.tagline}
        </motion.span>
      )}
      {signature && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.9 }}
          className="inline-flex flex-col"
        >
          {signature}
        </motion.span>
      )}
    </div>
  );
}
