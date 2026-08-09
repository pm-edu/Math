"use client";

import Link from "next/link";
import { site } from "@/lib/site";
import { useLang } from "@/lib/i18n";
import type { Course } from "@/lib/courses";

export default function Hero({ featured }: { featured?: Course | null }) {
  const { lang, t } = useLang();

  const tagline = lang === "en" ? site.taglineEn : site.tagline;
  const taglineLines = tagline.split("\n");
  const subLines = (
    lang === "en"
      ? site.heroSubEn
      : `동영상 강의와 학습자료를 함께 제공하는 온라인 ${site.subject} 클래스.\n학년과 과정에 맞춘 커리큘럼으로 시작하세요.`
  ).split("\n");

  return (
    <section className="mx-auto max-w-6xl px-6 pt-16 pb-20 md:pt-24 md:pb-28">
      <div className="grid items-center gap-12 md:grid-cols-2">
        <div>
          <span className="inline-block rounded-full bg-[var(--mint)] px-4 py-1.5 text-xs font-medium text-[var(--mint-dark)]">
            {lang === "en" ? site.badgeEn : site.badge}
          </span>

          <h1 className="mt-5 text-4xl font-medium leading-tight text-[var(--foreground)] md:text-5xl">
            {taglineLines.map((line, i) => (
              <span key={i}>
                {i > 0 && <br />}
                {line}
              </span>
            ))}
          </h1>

          <p className="mt-5 text-base leading-relaxed text-[var(--secondary)] md:text-lg">
            {subLines.map((line, i) => (
              <span key={i}>
                {i > 0 && <br />}
                {line}
              </span>
            ))}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/courses"
              className="rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)] transition-transform hover:scale-[1.03]"
            >
              {t("browse")}
            </Link>
            <Link
              href="/sample"
              className="rounded-full border border-[var(--border-c)] bg-white px-6 py-3 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--mint)]/40"
            >
              {t("freeSample")}
            </Link>
          </div>
        </div>

        {featured && (
          <div className="relative">
            <div className="rounded-3xl bg-[var(--pink-light)] p-8 md:p-10">
              <Link
                href={`/courses/${featured.slug}`}
                className="block rounded-2xl bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <p className="text-xs font-medium text-[var(--secondary)]">
                  {t("popularCourse")}
                </p>
                <p className="mt-2 text-lg font-medium text-[var(--foreground)]">
                  {featured.title}
                </p>
                <p className="mt-1 text-sm text-[var(--secondary)]">
                  {featured.lessons > 0
                    ? lang === "en"
                      ? `${featured.lessons} video lessons`
                      : `동영상 ${featured.lessons}강`
                    : featured.description}
                </p>
                <div className="mt-4 h-2 w-full rounded-full bg-[var(--mint)]">
                  <div className="h-2 w-2/3 rounded-full bg-[var(--pink)]" />
                </div>
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
