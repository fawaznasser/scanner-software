import type { Metadata } from "next";
import "./globals.css";
import "./sections.css";
import "./dashboard-controls.css";
import "./accessibility.css";
import "./scanner-backend.css";
import "./dropdowns.css";
import "./audit.css";
import "./users.css";

export const metadata: Metadata = {
  title: "DMS | CNRS-L",
  description: "CNRS-L document management, scanning, and secure document library",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
