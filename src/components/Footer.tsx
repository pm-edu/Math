"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { site } from "@/lib/site";
import { useLang } from "@/lib/i18n";
import { useSubject, subjectLabel, SUBJECTS, SITE_URL } from "@/lib/subject";

// math.pmedu4u.com은 "완전히 다른 사이트처럼" 보여야 한다(RUN_MATH_SITE.md 1-2,
// 2026-09-22 재확인) — Header.tsx는 이미 math 호스트에서 허브 메뉴(Courses/다른 과목)를
// 숨기게 돼 있었는데, Footer는 그 작업 때 빠뜨려서 실사용 중 발견됨("Courses"/"English →"
// 링크가 math.pmedu4u.com에도 그대로 보임). Header와 같은 판정 방식(클라이언트에서
// hostname 확인, 서버 첫 렌더에는 없는 정보라 useEffect에서).
export default function Footer() {
  const { lang, t } = useLang();
  const { subject } = useSubject();
  const subjectWord = subjectLabel(subject, lang);
  const blurb =
    lang === "en"
      ? `Online ${subjectWord} classes · Elementary to IB`
      : `초 · 중 · 고 · IB ${subjectWord} 온라인 클래스`;
  const otherSubject = SUBJECTS.find((s) => s !== subject)!;

  const [isMathHost, setIsMathHost] = useState(false);
  useEffect(() => {
    setIsMathHost(window.location.hostname.startsWith("math."));
  }, []);

  if (isMathHost) {
    return (
      <footer className="border-t border-[var(--border-c)] bg-[var(--background)]">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <p className="text-lg font-medium text-[var(--foreground)]">{site.name}</p>
              <p className="mt-2 text-sm text-[var(--secondary)]">{blurb}</p>
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
