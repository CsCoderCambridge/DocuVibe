import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DocuVibe Agent",
  description: "Bilingual self-correcting vision and voice civic action agent",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;600&family=Roboto:wght@400;500;700&family=Roboto+Mono:wght@400;500&display=swap"
        />
      </head>
      <body className="bg-surface font-sans text-[#1F1F1F] antialiased">{children}</body>
    </html>
  );
}
