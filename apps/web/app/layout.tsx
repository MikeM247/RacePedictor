import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Race Predictor | Night Ops",
  description: "Approved coaching, training plans, activities, and race prediction insights",
  icons: {
    icon: [{ url: "/racepredictor-app-icon.png", type: "image/png" }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
