import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ReactQueryProvider } from "@/lib/ReactQueryProvider";
import { OfflineBanner } from "@/components/OfflineBanner";

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
        <OfflineBanner />
        <ReactQueryProvider>
        <ToastProvider>
          <ErrorBoundary>
            {/* Phone-width column by design. On desktop it sits on a warm canvas with
                rounded corners so it reads as an intentional mobile-first layout
                rather than a page that failed to fill the screen. */}
            <main className="max-w-md mx-auto h-screen bg-background relative overflow-hidden shadow-2xl sm:border-x sm:border-gray-200 lg:h-[92vh] lg:my-[4vh] lg:rounded-2xl lg:border lg:border-[#DCCDBA]">
              {children}
            </main>
          </ErrorBoundary>
        </ToastProvider>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
