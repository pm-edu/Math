"use client";

import Link from "next/link";
import { site } from "@/lib/site";
import { useLang } from "@/lib/i18n";
import { useSubject, subjectLabel, SUBJECTS, SITE_URL } from "@/lib/subject";

export default function Footer() {
  const { lang, t } = useLang();
  const { subject } = useSubject();
  const subjectWord = subjectLabel(subject, lang);
  const blurb =
    lang === "en"
      ? `Online ${subjectWord} classes · Elementary to IB`
      : `초 · 중 · 고 · IB ${subjectWord} 온라인 클래스`;
  const otherSubject = SUBJECTS.find((s) => s !== subject)!;

  return (
    <footer className="border-t border-[var(--border-c)] bg-[var(--background)]">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <p className="text-lg font-medium text-[var(--foreground)]">{site.name}</p>
            <p className="mt-2 text-sm text-[var(--secondary)]">{blurb}</p>
          </div>

          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">{t("quickLinks")}</p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--secondary)]">
              {site.nav.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="hover:text-[var(--foreground)]">
                    {t(item.key)}
                  </Link>
                </li>
              ))}
              <li>
                <a href={SITE_URL[otherSubject]} className="hover:text-[var(--foreground)]">
                  {subjectLabel(otherSubject, lang)} →
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">{t("contactTitle")}</p>
            <a
              href={`mailto:${site.contactEmail}`}
              className="mt-3 inline-block text-sm text-[var(--secondary)] hover:text-[var(--foreground)]"
            >
              {site.contactEmail}
            </a>
          </div>
        </div>

        <div className="mt-10 border-t border-[var(--border-c)] pt-6 text-xs text-[var(--secondary)]">
          © {new Date().getFullYear()} {site.name}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
