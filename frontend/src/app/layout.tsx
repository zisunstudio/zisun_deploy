import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "ZISUN | Curated Fashion & Lifestyle",
  description: "Discover curated fashion through our shoppable story feed.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans min-h-screen bg-background text-foreground`}>
        {/* Mobile-first constraints for the MVP App feel */}
        <main className="max-w-md mx-auto h-screen bg-background relative overflow-hidden shadow-2xl sm:border-x sm:border-gray-800">
          {children}
        </main>
      </body>
    </html>
  );
}
