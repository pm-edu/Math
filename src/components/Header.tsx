import Link from "next/link";

const navItems = [
  { label: "강좌 둘러보기", href: "/courses" },
  { label: "후기", href: "/reviews" },
  { label: "문의", href: "/contact" },
];

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border-c)] bg-[var(--background)]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-medium text-[var(--foreground)]">
          수학클래스
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-[var(--secondary)] transition-colors hover:text-[var(--foreground)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden text-sm text-[var(--secondary)] hover:text-[var(--foreground)] sm:inline"
          >
            로그인
          </Link>
          <Link
            href="/courses"
            className="rounded-full bg-[var(--pink)] px-5 py-2 text-sm font-medium text-[var(--pink-dark)] transition-transform hover:scale-[1.03]"
          >
            강좌 보기
          </Link>
        </div>
      </div>
    </header>
  );
}
