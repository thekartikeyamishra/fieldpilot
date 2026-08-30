import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FieldPilot — voice-to-work for field technicians",
  description:
    "Talk through the job. FieldPilot identifies the asset, pulls its history, recommends the next step with evidence, and records the work you approve.",
  applicationName: "FieldPilot",
};

export const viewport: Viewport = {
  themeColor: "#0b1013",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
