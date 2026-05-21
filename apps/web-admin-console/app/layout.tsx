import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MMD Privé Admin Console",
  description: "Admin console for MMD Privé deals.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
