import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Race Predictor",
  description: "Approved coaching, training plans, activities, and race prediction insights",
  icons: {
    icon: [{ url: "/racepredictor-app-icon.png", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#081622",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" style={{ backgroundColor: "#f5f8fc", colorScheme: "light" }}>
      <body>{children}</body>
    </html>
  );
}
