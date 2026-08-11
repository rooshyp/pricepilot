import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const image = `${origin}/og.png`;

  return {
    metadataBase: new URL(origin),
    title: {
      default: "PricePilot — Pricing intelligence for better decisions",
      template: "%s · PricePilot",
    },
    description:
      "Model demand, revenue, margin, and profit tradeoffs with explainable pricing intelligence.",
    openGraph: {
      type: "website",
      title: "PricePilot",
      description: "Pricing intelligence for better decisions",
      images: [
        {
          url: image,
          width: 1731,
          height: 909,
          alt: "PricePilot price frontier",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "PricePilot",
      description: "Pricing intelligence for better decisions",
      images: [image],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
