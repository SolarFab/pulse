import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import FeedbackButton from "@/components/FeedbackButton";

const inter = Inter({
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "NachtKarte — Berlin Events",
  description: "Discover what’s happening in Berlin right now. Live event map with AI concierge.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "NachtKarte",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased bg-[#faf9f6] text-[#1a1a1a] overscroll-none`}>
        {children}
        <FeedbackButton />
      </body>
    </html>
  );
}
