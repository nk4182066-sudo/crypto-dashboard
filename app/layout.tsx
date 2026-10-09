import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import Navbar from "@/components/navbar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Trading Student Expert AI",
  description: "Crypto, forex, and stock market analysis dashboard",
  applicationName: "Trading Student Expert AI",
  icons: {
    icon: [{ url: "/icon-192.png", type: "image/png", sizes: "192x192" }, { url: "/icon-512.png", type: "image/png", sizes: "512x512" }],
    apple: [{ url: "/icon-192.png", type: "image/png", sizes: "192x192" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#101416",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">
        <Navbar />
        <div className="flex-1 pb-16 md:pb-0">{children}</div>
      </body>
    </html>
  );
}
