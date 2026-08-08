import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-[var(--border-c)] bg-[var(--background)]">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <p className="text-lg font-medium text-[var(--foreground)]">수학클래스</p>
            <p className="mt-2 text-sm text-[var(--secondary)]">
              초 · 중 · 고 · IB 수학 온라인 클래스
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">바로가기</p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--secondary)]">
              <li><Link href="/courses" className="hover:text-[var(--foreground)]">강좌/자료</Link></li>
              <li><Link href="/reviews" className="hover:text-[var(--foreground)]">후기</Link></li>
              <li><Link href="/contact" className="hover:text-[var(--foreground)]">문의</Link></li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">문의</p>
            <p className="mt-3 text-sm text-[var(--secondary)]">support@mathclass.example</p>
          </div>
        </div>

        <div className="mt-10 border-t border-[var(--border-c)] pt-6 text-xs text-[var(--secondary)]">
          © {new Date().getFullYear()} 수학클래스. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
