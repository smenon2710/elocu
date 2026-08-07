import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Elocu",
  description: "Practice storytelling, interviews, speeches, and debate by talking it out with an AI.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full">{children}</body>
    </html>
  );
}
