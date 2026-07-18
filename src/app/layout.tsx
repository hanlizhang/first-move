import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "First Move",
  description: "A gentle morning routine, focus, and virtual companion app.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
