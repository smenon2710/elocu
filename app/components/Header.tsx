import Link from "next/link";

export function Header() {
  return (
    <header className="flex shrink-0 items-center justify-between border-b bg-white px-4 py-3 sm:px-6">
      <Link href="/" className="text-lg font-semibold text-gray-900">
        Elocu
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/app/progress" className="text-gray-600 hover:text-gray-900">
          Progress
        </Link>
        <Link href="/app" className="text-gray-600 hover:text-gray-900">
          New session
        </Link>
      </nav>
    </header>
  );
}
