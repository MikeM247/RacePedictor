import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Race Predictor Dashboard",
  description: "Desktop-first dashboard for race prediction insights",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
