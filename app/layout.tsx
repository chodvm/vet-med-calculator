import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vet Med Drug Calculator",
  description: "Veterinary medication dosing calculator",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background antialiased">{children}</body>
    </html>
  );
}
