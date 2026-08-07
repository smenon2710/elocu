import Link from "next/link";
import { Fraunces, IBM_Plex_Mono, Inter } from "next/font/google";

const fraunces = Fraunces({ subsets: ["latin"], weight: ["500", "600"], style: ["normal"] });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"] });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500"] });

const MODES = [
  {
    name: "Conversation",
    description: "Talk through anything, casually.",
    example: "So what happened after the deadline moved up?",
  },
  {
    name: "Interview",
    description: "Real questions, tailored to the role.",
    example: "Walk me through how you found that bug.",
  },
  {
    name: "Debate",
    description: "State a position. Get argued with.",
    example: "I'll argue the other side of that.",
  },
  {
    name: "Speech",
    description: "Deliver a talk. We get out of the way.",
    example: "Whenever you're ready, begin.",
  },
  {
    name: "Orator",
    description: "No topic? We'll hand you one.",
    example: "Persuade me cities should ban cars downtown.",
  },
];

function StartButton({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/app"
      className={`inline-block rounded-full bg-[#D98E4A] px-7 py-3 text-sm font-medium text-[#14131B] transition hover:bg-[#e6a262] ${className}`}
    >
      Start talking →
    </Link>
  );
}

export default function LandingPage() {
  return (
    <main className={`${inter.className} min-h-full bg-[#14131B] text-[#F3EDE1]`}>
      {/* Hero */}
      <section className="mx-auto max-w-2xl px-6 pt-16 pb-20 sm:pt-24">
        <p className={`${plexMono.className} text-center text-xs tracking-[0.25em] text-[#6f9d94] uppercase`}>
          Elocu — the art of speaking well
        </p>

        <div
          className={`${plexMono.className} mt-10 rounded-2xl border border-white/10 bg-[#1E1C28] p-6 text-sm leading-relaxed sm:p-8 sm:text-base`}
        >
          <p className="transcript-line" style={{ animationDelay: "0.2s" }}>
            <span className="text-[#D98E4A]">YOU</span>
            <span className="text-[#9C9488]">{"   "}</span>
            Remote work is better than office work.
          </p>
          <p className="transcript-line mt-4" style={{ animationDelay: "1.1s" }}>
            <span className="text-[#5B8A82]">ELOCU</span>
            <span className="text-[#9C9488]">{" "}</span>
            I&apos;ll argue the other side — office work wins on one thing remote can&apos;t fake:
            spontaneous problem-solving. Convince me I&apos;m wrong.
          </p>
          <p className="transcript-line mt-4" style={{ animationDelay: "2.4s" }}>
            <span className="text-[#D98E4A]">YOU</span>
            <span className="text-[#9C9488]">{"   "}</span>
            <span className="transcript-cursor" aria-hidden="true">
              ▍
            </span>
          </p>
        </div>

        <h1
          className={`${fraunces.className} mt-10 text-center text-4xl leading-tight font-medium tracking-tight text-[#F3EDE1] sm:text-5xl`}
        >
          Reasoning gets sharper out loud.
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-center text-[#9C9488]">
          Practice interviews, speeches, hard conversations, and real debate — against an AI that
          actually pushes back. No setup. Just start talking.
        </p>

        <div className="mt-8 flex justify-center">
          <StartButton />
        </div>
      </section>

      {/* Modes */}
      <section className="border-t border-white/10 bg-[#1A1826] px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className={`${plexMono.className} text-center text-xs tracking-[0.25em] text-[#6f9d94] uppercase`}>
            Five rooms to practice in
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MODES.map((m) => (
              <div key={m.name} className="rounded-xl border border-white/10 bg-[#1E1C28] p-5">
                <h3 className={`${fraunces.className} text-lg text-[#F3EDE1]`}>{m.name}</h3>
                <p className="mt-1 text-sm text-[#9C9488]">{m.description}</p>
                <p className={`${plexMono.className} mt-3 text-xs text-[#D98E4A]`}>
                  &ldquo;{m.example}&rdquo;
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Philosophy */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-2xl">
          <p className={`${plexMono.className} text-xs tracking-[0.25em] text-[#6f9d94] uppercase`}>
            Why talking, not typing
          </p>
          <h2 className={`${fraunces.className} mt-6 text-2xl leading-snug text-[#F3EDE1] sm:text-3xl`}>
            Plato thought reasoning only gets sharp when it&apos;s tested out loud, against another
            mind.
          </h2>
          <p className="mt-6 leading-relaxed text-[#9C9488]">
            Elocu is built on the same bet. It&apos;s not a quiz, and it&apos;s not a chatbot that
            agrees with you — it&apos;s practice ground for the thing that actually makes you
            better at speaking: doing it, out loud, against real pushback, over and over.
          </p>
        </div>
      </section>

      {/* Feedback preview */}
      <section className="border-t border-white/10 bg-[#1A1826] px-6 py-20">
        <div className="mx-auto max-w-lg">
          <h2 className={`${plexMono.className} text-center text-xs tracking-[0.25em] text-[#6f9d94] uppercase`}>
            What you get back
          </h2>
          <div className="mt-8 rounded-2xl border border-white/10 bg-[#1E1C28] p-6">
            <div className="flex items-center justify-between">
              <h3 className={`${fraunces.className} text-[#F3EDE1]`}>Structure</h3>
              <div className="flex gap-1" aria-label="Score 3 out of 5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <div key={n} className={`h-2 w-5 rounded-full ${n <= 3 ? "bg-[#D98E4A]" : "bg-white/10"}`} />
                ))}
              </div>
            </div>
            <blockquote
              className={`${plexMono.className} mt-4 border-l-2 border-[#5B8A82] pl-3 text-sm text-[#9C9488] italic`}
            >
              &ldquo;so there is a difficulty in recording the other person&apos;s voice&rdquo;
            </blockquote>
            <p className="mt-4 text-sm text-[#F3EDE1]/90">
              <span className="font-medium text-[#D98E4A]">Try this: </span>
              Cut the throat-clearing and open directly with the pain point — the difficulty
              capturing the other person&apos;s voice.
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 py-24 text-center">
        <h2 className={`${fraunces.className} text-3xl text-[#F3EDE1]`}>Ready when you are.</h2>
        <div className="mt-6">
          <StartButton />
        </div>
      </section>

      <footer className="border-t border-white/10 px-6 py-8 text-center text-xs text-[#9C9488]">
        <p className={plexMono.className}>Elocu</p>
      </footer>
    </main>
  );
}
