"use client";

// TOEFL 랜딩(메인) 페이지. 디자인 기준은 docs/toefl-main.html — 레이아웃·문구·간격을 그대로 따른다.
//
// 2026-08-19: 원래 이 경로에 있던 "폼 선택 + 응시 시작" 화면은 /toefl/start 로 옮겼다.
// 랜딩의 CTA(풀 모의고사·영역 연습·STEP 2·3·12유형)가 전부 그 경로로 들어간다.
//
// 문구는 t()로 번역돼 있다(2026-09-02, 인도 서비스 대비 학생용 화면 일괄 번역).
// 시험 응시 화면(test/[attemptId]/...)과 /toefl/sample 은 이 작업 범위 밖이며 영어 고정이다.

import Link from "next/link";
import "./globals.css";
import LandingHeader from "@/components/toefl/landing/LandingHeader";
import RoutingRail from "@/components/toefl/landing/RoutingRail";
import { LandingViewerProvider, useLandingViewer } from "@/lib/toefl/landing-viewer";
import { interpolate, useLang, type DictKey } from "@/lib/i18n";
import type { ToeflTaskType } from "@/lib/toefl/types";

// 2026-08-28: 유형별 연습 라우트(/toefl/practice/[type]) 신설로 각 유형 링크가 실제로 그
// 유형만 골라 연습하는 화면으로 간다(예전엔 전부 /toefl/start로만 갔음).

// 시간은 하드코딩하지 않는다 — toefl_form_blueprint에서 조회한 totalMinutes로 채운다
// (landing-viewer.tsx, [[toefl-ui-work-rules]] 2번). 조회 전에는 "–"로 표시.
function minutesText(totalMinutes: number | null, t: (key: DictKey) => string): string {
  return totalMinutes == null ? "–" : interpolate(t("toefl_landing_minutesUnit"), { n: totalMinutes });
}

function buildFacts(totalMinutes: number | null, t: (key: DictKey) => string): { value: string; label: string }[] {
  return [
    { value: minutesText(totalMinutes, t), label: t("toefl_landing_totalTestTime") },
    { value: t("toefl_landing_fourSectionsTwelveTypes"), label: t("toefl_landing_fullRevamp") },
    { value: t("toefl_landing_bandScoreRange"), label: t("toefl_landing_bandCefr") },
    { value: t("toefl_landing_twoStageAdaptive"), label: t("toefl_landing_readingListeningRouting") },
  ];
}

function buildSteps(
  totalMinutes: number | null,
  t: (key: DictKey) => string
): { no: string; title: string; body: string; go: string; href: string; free?: boolean }[] {
  return [
    {
      no: "STEP 1",
      title: t("toefl_landing_step1Title"),
      body: t("toefl_landing_step1Body"),
      go: t("toefl_landing_step1Go"),
      href: "#types",
      free: true,
    },
    {
      no: "STEP 2",
      title: t("toefl_landing_step2Title"),
      body: t("toefl_landing_step2Body"),
      go: t("toefl_landing_step2Go"),
      // /toefl/start 한 화면에 풀 모의고사·영역별 연습이 같이 있어서, STEP2/STEP3가
      // 완전히 같은 화면으로 보이는 문제(2026-09-02 실사용 피드백) — focus 파라미터로
      // 어느 카드로 스크롤+강조할지 알려준다.
      href: "/toefl/start?focus=section",
    },
    {
      no: "STEP 3",
      title: t("toefl_fullTest"),
      body: interpolate(t("toefl_landing_step3Body"), { minutes: minutesText(totalMinutes, t) }),
      go: t("toefl_startTest"),
      href: "/toefl/start?focus=full",
    },
  ];
}

const TYPE_GROUPS: { key: string; name: string; countKey: DictKey; color: string; items: { type: ToeflTaskType; ko: string; en: string }[] }[] = [
  {
    key: "read",
    name: "Reading",
    countKey: "toefl_landing_readingCount",
    color: "var(--en-read)",
    items: [
      { type: "complete_the_words", ko: "단어 완성하기", en: "Complete the Words" },
      { type: "daily_life", ko: "실생활 지문 읽기", en: "Read in Daily Life" },
      { type: "academic_passage", ko: "학술 지문 읽기", en: "Read an Academic Passage" },
    ],
  },
  {
    key: "listen",
    name: "Listening",
    countKey: "toefl_landing_listeningCount",
    color: "var(--en-listen)",
    items: [
      { type: "choose_a_response", ko: "응답 고르기", en: "Listen & Choose a Response" },
      { type: "conversation", ko: "일상 대화 듣기", en: "Daily-life Conversation" },
      { type: "announcement", ko: "공지 듣기", en: "Announcement" },
      { type: "academic_talk", ko: "학술 강의 듣기", en: "Academic Talk" },
    ],
  },
  {
    key: "speak",
    name: "Speaking",
    countKey: "toefl_landing_speakingCount",
    color: "var(--en-speak)",
    items: [
      { type: "listen_and_repeat", ko: "듣고 따라 말하기", en: "Listen & Repeat" },
      { type: "take_an_interview", ko: "인터뷰 응답", en: "Take an Interview" },
    ],
  },
  {
    key: "write",
    name: "Writing",
    countKey: "toefl_landing_writingCount",
    color: "var(--en-write)",
    items: [
      { type: "build_a_sentence", ko: "문장 완성하기", en: "Build a Sentence" },
      { type: "write_an_email", ko: "이메일 작성", en: "Write an E-mail" },
      { type: "academic_discussion", ko: "토론 글쓰기", en: "Academic Discussion" },
    ],
  },
];

function buildDiffs(t: (key: DictKey) => string): { icon: string; title: string; body: string }[] {
  return [
    { icon: "🔀", title: t("toefl_landing_diff1Title"), body: t("toefl_landing_diff1Body") },
    { icon: "📝", title: t("toefl_landing_diff2Title"), body: t("toefl_landing_diff2Body") },
    { icon: "🔁", title: t("toefl_landing_diff3Title"), body: t("toefl_landing_diff3Body") },
  ];
}

// 리포트 카드는 정적 예시 목업이다 — 실제 응시 데이터와 연결하지 않는다.
const REPORT_ROWS: { label: string; pct: number; score: string; color: string }[] = [
  { label: "Reading", pct: 83, score: "5.0", color: "var(--en-read)" },
  { label: "Listening", pct: 75, score: "4.5", color: "var(--en-listen)" },
  { label: "Speaking", pct: 66, score: "4.0", color: "var(--en-speak)" },
  { label: "Writing", pct: 75, score: "4.5", color: "var(--en-write)" },
];

const CARD_SHADOW = "shadow-[0_1px_2px_rgba(24,42,78,.05),0_8px_24px_rgba(24,42,78,.07)]";

export default function ToeflLandingPage() {
  return (
    <LandingViewerProvider>
      <LandingContent />
    </LandingViewerProvider>
  );
}

function LandingContent() {
  // 계정이 있는 사람에게는 샘플을 권하지 않는다 — 히어로·하단 CTA가 응시로 바뀐다.
  const { loggedIn, totalMinutes } = useLandingViewer();
  const { t, lang } = useLang();
  const FACTS = buildFacts(totalMinutes, t);
  const STEPS = buildSteps(totalMinutes, t);
  const DIFFS = buildDiffs(t);

  return (
    <div data-theme="en" className="toefl-landing min-h-screen bg-[var(--en-paper)] text-[var(--en-ink)]">
      <LandingHeader />

      {/* ───────── Hero ───────── */}
      <section id="about" className="px-6 pb-14 pt-11 sm:pt-16">
        <div className="mx-auto grid max-w-[1120px] items-center gap-9 min-[961px]:grid-cols-[1.05fr_.95fr] min-[961px]:gap-14">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--en-gold-soft)] px-3.5 py-1.5 text-[13px] font-extrabold tracking-[.02em] text-[var(--en-gold-deep)]">
              <span className="h-[7px] w-[7px] rounded-full bg-[var(--en-gold)]" />
              {t("toefl_landing_heroEyebrow")}
            </span>
            <h1 className="mb-4 mt-[18px] text-[clamp(30px,4.4vw,46px)] font-extrabold leading-[1.22] tracking-[-.035em]">
              {lang === "ko" ? (
                <>
                  새로워진 TOEFL,
                  <br />
                  <span className="u">시험이 갈리는 지점</span>부터
                  <br />
                  연습하세요
                </>
              ) : (
                <>
                  The New TOEFL.
                  <br />
                  Practice where <span className="u">it actually splits</span>.
                </>
              )}
            </h1>
            <p className="mb-7 max-w-[34em] text-[16.5px] text-[var(--en-ink-soft)]">{t("toefl_landing_heroSubtitle")}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/toefl/start?focus=full"
                className="rounded-[10px] bg-[var(--en-ink)] px-6 py-[13px] text-[15px] font-bold text-white transition-transform hover:-translate-y-px"
              >
                {t("toefl_startTest")} ({minutesText(totalMinutes, t)})
              </Link>
              {loggedIn !== null && (
                <Link
                  href={loggedIn ? "/toefl/mypage" : "/toefl/sample"}
                  className="rounded-[10px] border-[1.5px] border-[var(--en-line)] bg-white px-[22px] py-3 text-[15px] font-bold text-[var(--en-ink)] transition-colors hover:border-[var(--en-ink)]"
                >
                  {loggedIn ? t("toefl_landing_viewMyStudy") : t("toefl_landing_tryWithoutLogin")}
                </Link>
              )}
              <span className="mt-1 w-full text-[12.5px] text-[var(--en-ink-soft)]">
                {loggedIn ? t("toefl_landing_pastAttemptsHint") : t("toefl_landing_sampleHint")}
              </span>
            </div>
          </div>

          <RoutingRail />
        </div>
      </section>

      {/* ───────── 시험 사실 스트립 ───────── */}
      <div className="border-y border-[var(--en-line)] bg-white">
        <div className="mx-auto grid max-w-[1120px] grid-cols-2 px-6 min-[961px]:grid-cols-4">
          {FACTS.map((f, i) => (
            <div
              key={f.value}
              className={`flex flex-col gap-0.5 px-[18px] py-[22px] ${
                i % 2 === 1 ? "border-l border-[var(--en-line)]" : ""
              } ${i >= 2 ? "border-t border-[var(--en-line)]" : ""} min-[961px]:border-t-0 ${
                i > 0 ? "min-[961px]:border-l min-[961px]:border-[var(--en-line)]" : ""
              }`}
            >
              <b className="en-num text-[22px] font-bold tracking-[-.01em]">{f.value}</b>
              <span className="text-[12.5px] text-[var(--en-ink-soft)]">{f.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ───────── 학습 경로 ───────── */}
      <section id="path" className="px-6 py-13 sm:py-18">
        <div className="mx-auto max-w-[1120px]">
          <p className="en-num mb-2.5 text-xs font-bold uppercase tracking-[.14em] text-[var(--en-gold-deep)]">
            Learning Path
          </p>
          <h2 className="text-[clamp(24px,3vw,32px)] font-extrabold leading-[1.3] tracking-[-.03em]">
            {t("toefl_landing_pathHeading")}
          </h2>
          <p className="mt-2.5 max-w-[44em] text-[15.5px] text-[var(--en-ink-soft)]">{t("toefl_landing_pathSubtitle")}</p>

          <div className="mt-9 grid gap-[18px] min-[601px]:grid-cols-2 min-[961px]:grid-cols-3">
            {STEPS.map((s) => (
              <Link
                key={s.no}
                href={s.href}
                className={`group relative rounded-[14px] border border-[var(--en-line)] bg-[var(--en-card)] px-6 py-[26px] transition-all hover:-translate-y-1 hover:border-[var(--en-gold)] ${CARD_SHADOW}`}
              >
                {s.free && (
                  <span className="absolute right-5 top-5 rounded-md bg-[var(--en-gold-soft)] px-2 py-[3px] text-[11px] font-extrabold text-[var(--en-gold-deep)]">
                    {t("toefl_landing_freeSampleBadge")}
                  </span>
                )}
                <span className="en-num text-[13px] font-bold tracking-[.1em] text-[var(--en-gold-deep)]">{s.no}</span>
                <h3 className="my-2 text-[19px] font-extrabold tracking-[-.02em]">{s.title}</h3>
                <p className="text-sm text-[var(--en-ink-soft)] min-[601px]:min-h-[66px]">{s.body}</p>
                <span className="mt-3.5 inline-flex items-center gap-1.5 text-[13.5px] font-bold text-[var(--en-ink)]">
                  {s.go}
                  <span className="transition-transform group-hover:translate-x-[3px]">→</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── 12 문항유형 ───────── */}
      <section id="types" className="border-y border-[var(--en-line)] bg-white px-6 py-13 sm:py-18">
        <div className="mx-auto max-w-[1120px]">
          <p className="en-num mb-2.5 text-xs font-bold uppercase tracking-[.14em] text-[var(--en-gold-deep)]">
            12 Task Types
          </p>
          <h2 className="text-[clamp(24px,3vw,32px)] font-extrabold leading-[1.3] tracking-[-.03em]">
            {t("toefl_landing_typesHeading")}
          </h2>
          <p className="mt-2.5 max-w-[44em] text-[15.5px] text-[var(--en-ink-soft)]">{t("toefl_landing_typesSubtitle")}</p>

          <div className="mt-9 grid gap-4 min-[601px]:grid-cols-2 min-[961px]:grid-cols-4">
            {TYPE_GROUPS.map((g) => (
              <div key={g.key} className="overflow-hidden rounded-[14px] border border-[var(--en-line)] bg-[var(--en-paper)]">
                <div className="flex items-center justify-between px-4 py-3.5 text-white" style={{ background: g.color }}>
                  <span className="text-[15px] font-extrabold">{g.name}</span>
                  <span className="en-num text-xs font-bold opacity-85">{t(g.countKey)}</span>
                </div>
                <ul className="px-2 py-2.5">
                  {g.items.map((it) => (
                    <li key={it.en}>
                      <Link
                        href={`/toefl/practice/${it.type}`}
                        className="group flex items-center justify-between rounded-lg px-2.5 py-[9px] text-[13.5px] font-semibold text-[var(--en-ink)] transition-shadow hover:bg-white hover:shadow-[0_1px_4px_rgba(24,42,78,.08)]"
                      >
                        <span>
                          {lang === "ko" ? it.ko : it.en}
                          {lang === "ko" && (
                            <span className="block text-[11px] font-medium text-[var(--en-ink-soft)]">{it.en}</span>
                          )}
                        </span>
                        <span className="text-[11px] text-[var(--en-ink-soft)] opacity-0 transition-opacity group-hover:opacity-100">
                          ↗
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── 리포트 미리보기 ───────── */}
      <section id="report" className="px-6 py-13 sm:py-18">
        <div className="mx-auto grid max-w-[1120px] items-center gap-9 min-[961px]:grid-cols-[.9fr_1.1fr] min-[961px]:gap-14">
          <div>
            <p className="en-num mb-2.5 text-xs font-bold uppercase tracking-[.14em] text-[var(--en-gold-deep)]">
              Report &amp; Review
            </p>
            <h2 className="text-[clamp(24px,3vw,32px)] font-extrabold leading-[1.3] tracking-[-.03em]">
              {t("toefl_landing_reportHeading1")}
              <br />
              {t("toefl_landing_reportHeading2")}
            </h2>
            <ul className="mt-6 flex flex-col gap-4">
              {DIFFS.map((d) => (
                <li key={d.title} className="flex items-start gap-3.5">
                  <span
                    className="grid h-[38px] w-[38px] flex-none place-items-center rounded-[10px] bg-[var(--en-gold-soft)] text-[17px]"
                    aria-hidden="true"
                  >
                    {d.icon}
                  </span>
                  <div>
                    <b className="block text-[15.5px] tracking-[-.01em]">{d.title}</b>
                    <p className="text-[13.5px] text-[var(--en-ink-soft)]">{d.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div
            className={`rounded-[20px] border border-[var(--en-line)] bg-[var(--en-card)] p-[26px] ${CARD_SHADOW} min-[961px]:rotate-[.6deg]`}
            aria-label={t("toefl_landing_reportSampleAria")}
          >
            <div className="mb-4 flex items-center justify-between border-b border-dashed border-[var(--en-line)] pb-3.5">
              <span className="en-num text-[13px] font-extrabold uppercase tracking-[.06em] text-[var(--en-ink-soft)]">
                Score Report · {t("toefl_landing_reportSampleLabel")}
              </span>
              <div className="flex items-baseline gap-2">
                <span className="en-num text-[44px] font-bold tracking-[-.02em]">4.5</span>
                <span className="rounded-md bg-[var(--en-ink)] px-2 py-0.5 text-[13px] font-extrabold text-white">B2</span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {REPORT_ROWS.map((r) => (
                <div key={r.label} className="grid grid-cols-[86px_1fr_40px] items-center gap-3 text-[13.5px]">
                  <span className="font-bold">{r.label}</span>
                  <span className="h-[9px] overflow-hidden rounded-full bg-[#EFF3FA]">
                    <i className="block h-full rounded-full" style={{ width: `${r.pct}%`, background: r.color }} />
                  </span>
                  <span className="en-num text-right font-bold">{r.score}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-[10px] border border-[var(--en-line)] bg-[var(--en-paper)] px-3.5 py-2.5 text-[12.5px] text-[var(--en-ink-soft)]">
              <span aria-hidden="true">🔀</span>
              <span>{t("toefl_landing_reportRoutedSentence")}</span>
            </div>

            <div className="mt-2.5 flex items-center justify-between rounded-[10px] bg-[var(--en-gold-soft)] px-3.5 py-2.5 text-[13px] font-bold">
              <span>{t("toefl_landing_mockUnknownWords")}</span>
              <span className="rounded-[10px] bg-[var(--en-gold)] px-3 py-1.5 text-xs font-bold text-[var(--en-on-gold)]">
                {t("toefl_landing_mockAddToReview")}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── 최종 CTA ───────── */}
      <div className="mx-6 rounded-3xl bg-[var(--en-ink)] px-6 py-16 text-center text-white">
        <h2 className="text-[clamp(24px,3vw,32px)] font-extrabold leading-[1.3] tracking-[-.03em] text-white">
          {t("toefl_landing_finalCtaHeading")}
        </h2>
        <p className="mx-auto mb-7 mt-3 max-w-[36em] text-[15.5px] text-[#B9C4DC]">
          {interpolate(loggedIn ? t("toefl_landing_finalCtaSubLoggedIn") : t("toefl_landing_finalCtaSubGuest"), {
            minutes: minutesText(totalMinutes, t),
          })}
        </p>
        {loggedIn !== null && (
          <Link
            href={loggedIn ? "/toefl/start?focus=full" : "/toefl/sample"}
            className="inline-flex rounded-[10px] bg-[var(--en-gold)] px-7 py-3.5 text-[15.5px] font-bold text-[var(--en-on-gold)] shadow-[0_2px_8px_rgba(245,166,35,.35)] transition-transform hover:-translate-y-px"
          >
            {loggedIn ? t("toefl_startTest") : t("toefl_tryFreeSample")}
          </Link>
        )}
      </div>

      {/* ───────── 푸터 ───────── */}
      <footer className="px-6 pb-14 pt-11 text-[13px] text-[var(--en-ink-soft)]">
        <div className="mx-auto flex max-w-[1120px] flex-wrap justify-between gap-5">
          <span>{t("toefl_landing_footerCopyright")}</span>
          {/* TODO: 이용약관·개인정보처리방침 페이지가 생기면 실제 경로로 교체한다. */}
          <nav className="flex gap-4.5">
            <span className="cursor-default">{t("toefl_landing_terms")}</span>
            <span className="cursor-default">{t("toefl_landing_privacy")}</span>
            <Link href="/contact" className="hover:text-[var(--en-ink)]">
              {t("contact")}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
