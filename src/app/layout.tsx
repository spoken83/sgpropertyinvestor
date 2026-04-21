import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ViewTransition } from "react";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "SG Property Investment",
    template: "%s | SG Property Investment",
  },
  description: "Data-driven investment finder for Singapore private residential property.",
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
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <Providers>
          <ViewTransition
            enter={{ "nav-back": "slide-down", default: "slide-up" }}
            exit={{ "nav-back": "slide-down", default: "slide-up" }}
          >
            {children}
          </ViewTransition>
        </Providers>
      </body>
    </html>
  );
}
