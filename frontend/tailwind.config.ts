import type { Config } from "tailwindcss";

/*
 * The palette, named for what it is rather than what it does.
 *
 * ink      the text and the buy button. Not black: a black with a plum cast,
 *          so it sits with the pinks and reds people said they wear rather
 *          than against them.
 * porcelain the ground. Near-neutral with a trace of warmth, for the same
 *          reason the old cream went: the garment is the only saturated
 *          thing on the screen.
 * burgundy the brand colour — the founder's covers and cards are burgundy,
 *          so the site is too. Spent where a thumb should stop: offers,
 *          timers, the heart, the underline under a heading, the footer.
 *          Never as a wash over a whole screen; a splash of it is the point.
 *          `rani` is the same colour under the name the code grew up with.
 * haldi    turmeric. Tickets, stickers and the ribbon — the joyful things.
 * rose     the soft panel. Chips, the founder's band, the cart rows.
 * moss     the founder's ink, sampled from her drawing. Trust, signatures.
 *
 * `primary` stays as a token because a hundred call sites use it; it now
 * points at ink. Prices and links in ink read as a label that is sure of
 * itself; in brown they read as a template.
 */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#FAF8F6",
        foreground: "#1A1417",
        ink: "#1A1417",
        porcelain: "#FAF8F6",
        burgundy: { DEFAULT: "#7A1F3A", deep: "#5E1630", soft: "#F5E6EA" },
        rani: { DEFAULT: "#7A1F3A", soft: "#F5E6EA" },
        haldi: { DEFAULT: "#F2C14E", deep: "#D9A62E" },
        rose: "#F6ECEA",
        blush: "#FBF1F0",
        moss: "#465C41",
        primary: {
          DEFAULT: "#1A1417",
          foreground: "#ffffff",
        },
        muted: "#6F6A6C",
        cream: "#F6ECEA",
        line: "rgba(26,20,23,0.10)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        // `serif` and `display` are the same face on purpose: every existing
        // font-serif heading upgrades without a hundred edits, and there is
        // one voice for headlines rather than two.
        serif: ["var(--font-display)", "Georgia", "serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
        hand: ["var(--font-hand)", "cursive"],
      },
      borderRadius: {
        card: "20px",
      },
      boxShadow: {
        lift: "0 12px 40px -12px rgba(26,20,23,0.25)",
        soft: "0 1px 2px rgba(26,20,23,0.06), 0 8px 24px -16px rgba(26,20,23,0.18)",
      },
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        marquee: "marquee 28s linear infinite",
        "fade-up": "fade-up 0.6s cubic-bezier(0.22,1,0.36,1) both",
      },
    },
  },
  plugins: [],
};
export default config;
