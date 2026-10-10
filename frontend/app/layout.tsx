import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppKitProvider } from "@/context/AppKitProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Spend Authority",
  description: "Onchain spending policy for AI agent purchases with Reap, on Ink Sepolia",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AppKitProvider>
          {children}
        </AppKitProvider>
      </body>
    </html>
  );
}