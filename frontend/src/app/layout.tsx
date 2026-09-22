import type { Metadata, Viewport } from "next";
import { COMPANY, SITE_URL } from "@/lib/legal";
import { jsonLdString } from "@/lib/structuredData";
import { BRAND, BRAND_TITLE } from "@/lib/brand";
import { Caveat, Instrument_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ReactQueryProvider } from "@/lib/ReactQueryProvider";
import { OfflineBanner } from "@/components/OfflineBanner";
import { WhatsAppFab } from "@/components/WhatsAppFab";
import CartDrawer from "@/components/CartDrawer";
import { SessionRestore } from "@/components/SessionRestore";
import { ViewTransitionSettler } from "@/components/ViewTransitionSettler";

// Three faces, one job each. Instrument Serif is the voice: a contemporary,
// classical serif with masthead authority at 48-96px and none of the Didone
// "luxury" cliché; it pairs natively with Instrument Sans, which is the hand -
// prices, labels, buttons, body. Caveat is used for exactly one line, the
// founder's signature, so that it stays a signature.
const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-sans", weight: ["400", "500", "600", "700"] });
const display = Instrument_Serif({ subsets: ["latin"], variable: "--font-display", weight: "400", style: ["normal", "italic"] });
const hand = Caveat({ subsets: ["latin"], variable: "--font-hand" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: BRAND_TITLE,
  description:
    "Handwoven South Indian cotton, cut for the way you actually live. Kurtis and co-ords in breathable cotton, made for Bengaluru, Chennai and Kochi.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ZISUN",
  },
  // `appleWebApp.capable` emits only <meta name="apple-mobile-web-app-capable">,
  // which Chrome now warns is deprecated in favour of the standard name. Both
  // are needed: iOS reads the Apple one, everything else reads this.
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#1A1417",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${display.variable} ${hand.variable} font-sans bg-background text-foreground`}>
        {/* Who ZISUN is, for search engines and AI agents: the brand behind
            every product block on the site, and how to reach it. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdString({
            "@context": "https://schema.org",
            "@graph": [
              { "@type": "OnlineStore", "@id": `${SITE_URL}/#store`, name: BRAND.name, slogan: BRAND.tagline, url: SITE_URL,
                email: COMPANY.email, ...(COMPANY.phone ? { telephone: COMPANY.phone } : {}),
                address: { "@type": "PostalAddress", addressLocality: "Bengaluru", addressRegion: "Karnataka", addressCountry: "IN" } },
              { "@type": "WebSite", "@id": `${SITE_URL}/#site`, name: BRAND.name, url: SITE_URL, publisher: { "@id": `${SITE_URL}/#store` },
                potentialAction: { "@type": "SearchAction", target: `${SITE_URL}/search?q={query}`, "query-input": "required name=query" } },
            ],
          }) }}
        />
        <SessionRestore />
        <ViewTransitionSettler />
        <OfflineBanner />
        <WhatsAppFab />
        {/* Mounted once, here: the bag opens from every product page, not
            just the home page where it used to live. */}
        <CartDrawer />
        <ReactQueryProvider>
        <ToastProvider>
          <ErrorBoundary>
            {/* The desktop treatment used to be a phone-shaped card floating on a
                beige field — rounded corners, a drop shadow, a 3vh margin all
                round. It reads as a 2016 app mockup rather than a shop, and it
                spent most of a 1440px display on background. The shop now fills
                the window and the ground is one colour everywhere.

                The app-shell model stays: a fixed viewport with its own
                scrolling regions, because every page is built on `h-full`
                children and a pinned bottom nav below lg. Moving to ordinary
                document scroll is the right next step — it would give back the
                browser chrome that hides on scroll, and scroll restoration on
                back — but it touches every page, so it is a change of its own
                rather than a rider on this one. */}
            <main className="max-w-md lg:max-w-none mx-auto min-h-screen bg-background relative sm:border-x sm:border-gray-200 lg:border-x-0">
              {children}
            </main>
          </ErrorBoundary>
        </ToastProvider>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
