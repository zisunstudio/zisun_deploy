import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" });

export const metadata: Metadata = {
  title: "ZISUN | Wear Your Story",
  description: "Discover curated fashion through our shoppable story feed.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${playfair.variable} font-sans bg-background text-foreground`}>
        <main className="max-w-md mx-auto h-screen bg-background relative overflow-hidden shadow-2xl sm:border-x sm:border-gray-200">
          {children}
        </main>
      </body>
    </html>
  );
}
