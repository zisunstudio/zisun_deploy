import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // See the note in globals.css. The ground stopped being cream so the
        // garments could carry the colour instead of the interface.
        background: "#F6F5F2",
        foreground: "#17150F",
        primary: {
          DEFAULT: "#6B3F2A",
          foreground: "#ffffff",
        },
        // Was #9E8070, a brown-grey. Secondary text does not need to be tinted
        // by the brand; it needs to be readable next to a photograph.
        muted: "#7E7873",
        // Kept for the few surfaces that want a warm panel against the ground.
        cream: "#F4EFE8",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        serif: ["var(--font-playfair)", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
export default config;
