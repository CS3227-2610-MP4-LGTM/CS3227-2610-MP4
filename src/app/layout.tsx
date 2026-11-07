import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LGTM",
  description:
    "A code review academy for learning to spot flaws in pull requests.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
