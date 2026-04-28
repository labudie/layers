import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PageTransition } from "@/app/components/PageTransition";
import { TapHaptics } from "@/app/components/TapHaptics";
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
      { url: "/Layers App Logo Clear.svg?v=4", type: "image/svg+xml" },
    ],
    shortcut: "/Layers App Logo Clear.svg?v=4",
    apple: "/apple-touch-icon.svg?v=4",
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
        <link rel="icon" href="/Layers App Logo Clear.svg?v=4" type="image/svg+xml" />
        <link rel="shortcut icon" href="/Layers App Logo Clear.svg?v=4" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.svg?v=4" />
      </head>
      <body className="flex min-h-dvh flex-col overflow-x-hidden">
        {/* Per-page chrome: `AppSiteChrome` (hamburger left, title center). Home uses it via `DailyGameClient`. */}
        <PHProvider>
          <div className="flex min-h-0 flex-1 flex-col">
            <TapHaptics />
            <Suspense fallback={null}>
              <PostHogPageView />
            </Suspense>
            <PageTransition>{children}</PageTransition>
          </div>
        </PHProvider>
      </body>
    </html>
  );
}
