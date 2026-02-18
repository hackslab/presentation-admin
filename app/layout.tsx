import type { Metadata } from "next";
import "./globals.css";
import { AppToaster } from "@/components/ui/app-toaster";

export const metadata: Metadata = {
  title: "Axiom Admin Panel",
  description: "Creative MagicUI admin dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
