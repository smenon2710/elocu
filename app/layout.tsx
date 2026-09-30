import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { clerkAppearance } from "./clerkAppearance";
import "./globals.css";

export const metadata: Metadata = {
  title: "Elocu",
  description: "Practice storytelling, interviews, speeches, and debate by talking it out with an AI.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Sign-in/up live at our own /sign-in and /sign-up (not Clerk's hosted
    // pages), and both land in the app afterwards; signing out returns to the
    // landing page.
    <ClerkProvider
      appearance={clerkAppearance}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/app"
      signUpFallbackRedirectUrl="/app"
      afterSignOutUrl="/"
    >
      <html lang="en" className="h-full antialiased">
        <body className="h-full">{children}</body>
      </html>
    </ClerkProvider>
  );
}
