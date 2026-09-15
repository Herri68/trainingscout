import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mas Lini — CS AI Bang Herri",
  description:
    "Framework dan kesan Creative Talk melalui WhatsApp bersama Mas Lini.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
