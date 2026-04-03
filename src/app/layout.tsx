import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sunburella Feedback Sky",
  description: "A gentle sky where user feedback floats like clouds.",
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
