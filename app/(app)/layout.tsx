import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "@/app/components/Header";
import { HistorySidebar } from "@/app/components/HistorySidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${geistSans.variable} ${geistMono.variable} flex h-full flex-col`}>
      <Header />
      <div className="flex min-h-0 flex-1">
        <HistorySidebar />
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
