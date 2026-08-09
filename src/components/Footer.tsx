import Link from "next/link";
import { site } from "@/lib/site";

export default function Footer() {
  return (
    <footer className="border-t border-[var(--border-c)] bg-[var(--background)]">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <p className="text-lg font-medium text-[var(--foreground)]">{site.name}</p>
            <p className="mt-2 text-sm text-[var(--secondary)]">{site.blurb}</p>
          </div>

          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">바로가기</p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--secondary)]">
              {site.nav.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="hover:text-[var(--foreground)]">
                    {item.label}
                  </Link>
                </li>
              ))}
              {site.partner && (
                <li>
                  <a href={site.partner.url} className="hover:text-[var(--foreground)]">
                    {site.partner.label}
                  </a>
                </li>
              )}
            </ul>
          </div>

          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">문의</p>
            <p className="mt-3 text-sm text-[var(--secondary)]">support@mathclass.example</p>
          </div>
        </div>

        <div className="mt-10 border-t border-[var(--border-c)] pt-6 text-xs text-[var(--secondary)]">
          © {new Date().getFullYear()} {site.name}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
