import { SignUp } from "@clerk/nextjs";
import Link from "next/link";

export default function SignUpPage() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-6 bg-ink-950 px-4 py-10">
      <Link href="/" className="font-display text-2xl text-parchment-100 transition hover:text-ember-400">
        Elocu
      </Link>
      <SignUp />
    </main>
  );
}
