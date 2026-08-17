import { Fraunces, IBM_Plex_Mono, Inter } from "next/font/google";
import { Header } from "@/app/components/Header";
import { HistorySidebar } from "@/app/components/HistorySidebar";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${fraunces.variable} ${plexMono.variable} ${inter.variable} flex h-full flex-col bg-ink-950 font-sans text-parchment-100 antialiased`}
    >
      <Header />
      <div className="flex min-h-0 flex-1">
        <HistorySidebar />
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
