import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { ExtensionGuard } from "@/components/extension-guard";
import { siteConfig } from "@/lib/config";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: `${siteConfig.appName} · ${siteConfig.collegeShortName}`,
    template: `%s · ${siteConfig.appName}`,
  },
  description: `College communication and management portal for ${siteConfig.collegeName}.`,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1120" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Font variables live on <html> because globals.css applies `font-sans` there.
    <html lang="en-IN" suppressHydrationWarning className={`${inter.variable} ${geistMono.variable}`}>
      <head>
        <ExtensionGuard />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
