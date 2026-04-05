import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PHProvider } from "@/app/providers";
import PostHogPageView from "@/app/posthog-pageview";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#7c3aed",
};

export const metadata: Metadata = {
  title: "Layers",
  description: "The daily design guessing game",
  applicationName: "Layers",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Layers",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body className="flex min-h-dvh flex-col overflow-x-hidden">
        {/* Per-page chrome: `AppSiteChrome` (hamburger left, title center). Home uses it via `DailyGameClient`. */}
        <PHProvider>
          <div className="flex min-h-0 flex-1 flex-col">
            <Suspense fallback={null}>
              <PostHogPageView />
            </Suspense>
            {children}
          </div>
        </PHProvider>
      </body>
    </html>
  );
}
