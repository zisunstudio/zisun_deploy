import type { Metadata, Viewport } from "next";
import { BRAND_TITLE } from "@/lib/brand";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ReactQueryProvider } from "@/lib/ReactQueryProvider";
import { OfflineBanner } from "@/components/OfflineBanner";
import { SessionRestore } from "@/components/SessionRestore";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" });

export const metadata: Metadata = {
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
  themeColor: "#6B3F2A",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${playfair.variable} font-sans bg-background text-foreground`}>
        <SessionRestore />
        <OfflineBanner />
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
