import type { Metadata, Viewport } from "next";
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
  title: "ZISUN | Cotton made for your climate",
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
      <body className={`${inter.variable} ${playfair.variable} font-sans bg-background text-foreground lg:bg-[#EFE6DA]`}>
        <SessionRestore />
        <OfflineBanner />
        <ReactQueryProvider>
        <ToastProvider>
          <ErrorBoundary>
            {/* Phone-width column by design. On desktop it sits on a warm canvas with
                rounded corners so it reads as an intentional mobile-first layout
                rather than a page that failed to fill the screen. */}
            {/* Phone-first, but not phone-only. The app-shell model is kept on
                every size — a fixed viewport with its own scrolling regions —
                because every page is built on `h-full` children and a fixed
                bottom nav. What changes on a laptop is the width: the column
                opens out to a real application canvas instead of a 448px strip
                marooned in the middle of a 1440px display. */}
            <main className="max-w-md lg:max-w-6xl mx-auto h-screen bg-background relative overflow-hidden shadow-2xl sm:border-x sm:border-gray-200 lg:h-[94vh] lg:my-[3vh] lg:rounded-2xl lg:border lg:border-[#DCCDBA]">
              {children}
            </main>
          </ErrorBoundary>
        </ToastProvider>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
