"use client";

// TOEFL 랜딩(메인) 페이지. 디자인 기준은 docs/toefl-main.html — 레이아웃·문구·간격을 그대로 따른다.
//
// 2026-08-19: 원래 이 경로에 있던 "폼 선택 + 응시 시작" 화면은 /toefl/start 로 옮겼다.
// 랜딩의 CTA(풀 모의고사·영역 연습·STEP 2·3·12유형)가 전부 그 경로로 들어간다.
//
// 문구는 아직 한국어 하드코딩이다. 사이트 전역 언어 토글(useLang)에 연결하는 사전 치환은
// 다음 단계에서 일괄 처리한다 — 지금 헤더의 토글을 눌러도 이 페이지 문구는 안 바뀐다.
// 시험 응시 화면(test/[attemptId]/...)과 /toefl/sample 은 이 작업 범위 밖이며 영어 고정이다.

import Link from "next/link";
import LandingHeader from "@/components/toefl/landing/LandingHeader";
import RoutingRail from "@/components/toefl/landing/RoutingRail";

// TODO: 유형별 연습 전용 라우트가 생기면 TYPE_HREF 를 유형별 경로로 교체한다.
// 지금은 12개 유형 링크가 전부 폼 선택 화면으로 간다.
const TYPE_HREF = "/toefl/start";

const FACTS: { value: string; label: string }[] = [
  { value: "90분", label: "총 시험 시간 (기존 116분)" },
  { value: "4영역 12유형", label: "R · L · S · W 전면 개편" },
  { value: "1.0–6.0", label: "밴드 점수 · CEFR 연동" },
  { value: "2단계 적응형", label: "Reading · Listening 라우팅" },
];

const STEPS: { no: string; title: string; body: string; go: string; href: string; free?: boolean }[] = [
  {
    no: "STEP 1",
    title: "유형별 연습",
    body: "Complete the Words, Listen & Repeat, Build a Sentence… 낯선 신유형을 유형 하나 단위로 반복 연습합니다.",
    go: "12개 유형 보기",
    href: "#types",
    free: true,
  },
  {
    no: "STEP 2",
    title: "영역 연습",
    body: "Reading · Listening · Speaking · Writing을 영역 단위로, 실제와 같은 서버 타이머와 자동저장 환경에서 연습합니다.",
    go: "영역 선택하기",
    href: "/toefl/start",
  },
  {
    no: "STEP 3",
    title: "풀 모의고사",
    body: "4개 영역을 끊김 없이 90분에 응시하고, 밴드 점수·라우팅 결과·문항별 리뷰까지 종합 리포트를 받습니다.",
    go: "모의고사 시작",
    href: "/toefl/start",
  },
];

const TYPE_GROUPS: { key: string; name: string; count: string; color: string; items: { ko: string; en: string }[] }[] = [
  {
    key: "read",
    name: "Reading",
    count: "3 유형 · 적응형",
    color: "var(--en-read)",
    items: [
      { ko: "단어 완성하기", en: "Complete the Words" },
      { ko: "실생활 지문 읽기", en: "Read in Daily Life" },
      { ko: "학술 지문 읽기", en: "Read an Academic Passage" },
    ],
  },
  {
    key: "listen",
    name: "Listening",
    count: "4 유형 · 적응형",
    color: "var(--en-listen)",
    items: [
      { ko: "응답 고르기", en: "Listen & Choose a Response" },
      { ko: "일상 대화 듣기", en: "Daily-life Conversation" },
      { ko: "공지 듣기", en: "Announcement" },
      { ko: "학술 강의 듣기", en: "Academic Talk" },
    ],
  },
  {
    key: "speak",
    name: "Speaking",
    count: "2 유형 · 8분",
    color: "var(--en-speak)",
    items: [
      { ko: "듣고 따라 말하기", en: "Listen & Repeat" },
      { ko: "인터뷰 응답", en: "Take an Interview" },
    ],
  },
  {
    key: "write",
    name: "Writing",
    count: "3 유형",
    color: "var(--en-write)",
    items: [
      { ko: "문장 완성하기", en: "Build a Sentence" },
      { ko: "이메일 작성", en: "Write an E-mail" },
      { ko: "토론 글쓰기", en: "Academic Discussion" },
    ],
  },
];

const DIFFS: { icon: string; title: string; body: string }[] = [
  {
    icon: "🔀",
    title: "라우팅 결과 공개",
    body: "Stage 2에서 상급·하급 어느 모듈로 갔는지 공개합니다. 점수 상한이 어디서 정해졌는지 알아야 다음 전략이 나옵니다.",
  },
  {
    icon: "📝",
    title: "문항별 리뷰",
    body: "내 답과 정답·해설, 듣기 스크립트 다시 듣기, 말하기 녹음 재생까지 시험이 끝난 뒤 전부 열립니다.",
  },
  {
    icon: "🔁",
    title: "오답 단어 → 자동 복습",
    body: "리뷰에서 몰랐던 단어를 한 번에 단어 복습(간격 반복)에 추가합니다. 모의고사가 단어장까지 이어집니다.",
  },
];

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
    <div data-theme="en" className="toefl-landing min-h-screen bg-[var(--en-paper)] text-[var(--en-ink)]">
      <LandingHeader />

      {/* ───────── Hero ───────── */}
      <section id="about" className="px-6 pb-14 pt-11 sm:pt-16">
        <div className="mx-auto grid max-w-[1120px] items-center gap-9 min-[961px]:grid-cols-[1.05fr_.95fr] min-[961px]:gap-14">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--en-gold-soft)] px-3.5 py-1.5 text-[13px] font-extrabold tracking-[.02em] text-[var(--en-gold-deep)]">
              <span className="h-[7px] w-[7px] rounded-full bg-[var(--en-gold)]" />
              2026년 1월 21일 개정 시행 · 최신 형식 반영
            </span>
            <h1 className="mb-4 mt-[18px] text-[clamp(30px,4.4vw,46px)] font-extrabold leading-[1.22] tracking-[-.035em]">
              새로워진 TOEFL,
              <br />
              <span className="u">시험이 갈리는 지점</span>부터
              <br />
              연습하세요
            </h1>
            <p className="mb-7 max-w-[34em] text-[16.5px] text-[var(--en-ink-soft)]">
              2026 개정 TOEFL은 첫 모듈 성적이 다음 모듈의 난이도와 점수 상한을 결정합니다. PM EDU는 실제
              시험과 같은 적응형 라우팅으로 연습하고, 어느 갈림길로 갔는지까지 리포트로 보여드립니다.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/toefl/start"
                className="rounded-[10px] bg-[var(--en-ink)] px-6 py-[13px] text-[15px] font-bold text-white transition-transform hover:-translate-y-px"
              >
                풀 모의고사 시작 (90분)
              </Link>
              <Link
                href="/toefl/sample"
                className="rounded-[10px] border-[1.5px] border-[var(--en-line)] bg-white px-[22px] py-3 text-[15px] font-bold text-[var(--en-ink)] transition-colors hover:border-[var(--en-ink)]"
              >
                로그인 없이 샘플 체험
              </Link>
              <span className="mt-1 w-full text-[12.5px] text-[var(--en-ink-soft)]">
                샘플은 12개 문항 유형을 각 1문항씩, 가입 없이 바로 풀 수 있습니다.
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
            유형에서 시작해 실전으로 끝냅니다
          </h2>
          <p className="mt-2.5 max-w-[44em] text-[15.5px] text-[var(--en-ink-soft)]">
            막연히 문제만 푸는 대신, 개정 시험의 12개 유형을 하나씩 익히고 → 영역 단위로 감각을 붙이고 →
            실제 시험과 같은 조건의 모의고사로 완성하는 3단계입니다.
          </p>

          <div className="mt-9 grid gap-[18px] min-[601px]:grid-cols-2 min-[961px]:grid-cols-3">
            {STEPS.map((s) => (
              <Link
                key={s.no}
                href={s.href}
                className={`group relative rounded-[14px] border border-[var(--en-line)] bg-[var(--en-card)] px-6 py-[26px] transition-all hover:-translate-y-1 hover:border-[var(--en-gold)] ${CARD_SHADOW}`}
              >
                {s.free && (
                  <span className="absolute right-5 top-5 rounded-md bg-[var(--en-gold-soft)] px-2 py-[3px] text-[11px] font-extrabold text-[var(--en-gold-deep)]">
                    무료 샘플
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
            2026 개정 문항 유형, 전부 연습할 수 있습니다
          </h2>
          <p className="mt-2.5 max-w-[44em] text-[15.5px] text-[var(--en-ink-soft)]">
            유형 이름을 누르면 해당 유형만 골라 연습합니다. 각 유형의 첫 문항은 로그인 없이 체험할 수 있습니다.
          </p>

          <div className="mt-9 grid gap-4 min-[601px]:grid-cols-2 min-[961px]:grid-cols-4">
            {TYPE_GROUPS.map((g) => (
              <div key={g.key} className="overflow-hidden rounded-[14px] border border-[var(--en-line)] bg-[var(--en-paper)]">
                <div className="flex items-center justify-between px-4 py-3.5 text-white" style={{ background: g.color }}>
                  <span className="text-[15px] font-extrabold">{g.name}</span>
                  <span className="en-num text-xs font-bold opacity-85">{g.count}</span>
                </div>
                <ul className="px-2 py-2.5">
                  {g.items.map((it) => (
                    <li key={it.en}>
                      <Link
                        href={TYPE_HREF}
                        className="group flex items-center justify-between rounded-lg px-2.5 py-[9px] text-[13.5px] font-semibold text-[var(--en-ink)] transition-shadow hover:bg-white hover:shadow-[0_1px_4px_rgba(24,42,78,.08)]"
                      >
                        <span>
                          {it.ko}
                          <span className="block text-[11px] font-medium text-[var(--en-ink-soft)]">{it.en}</span>
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
              점수만 주지 않습니다.
              <br />왜 그 점수인지 보여줍니다
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
            aria-label="종합 리포트 예시"
          >
            <div className="mb-4 flex items-center justify-between border-b border-dashed border-[var(--en-line)] pb-3.5">
              <span className="en-num text-[13px] font-extrabold uppercase tracking-[.06em] text-[var(--en-ink-soft)]">
                Score Report · 예시
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
              <span>
                Reading은 <b className="text-[var(--en-ink)]">상급 모듈</b>, Listening은{" "}
                <b className="text-[var(--en-ink)]">상급 모듈</b>로 라우팅되었습니다.
              </span>
            </div>

            <div className="mt-2.5 flex items-center justify-between rounded-[10px] bg-[var(--en-gold-soft)] px-3.5 py-2.5 text-[13px] font-bold">
              <span>몰랐던 단어 7개</span>
              <span className="rounded-[10px] bg-[var(--en-gold)] px-3 py-1.5 text-xs font-bold text-[var(--en-on-gold)]">
                복습에 추가
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── 최종 CTA ───────── */}
      <div className="mx-6 rounded-3xl bg-[var(--en-ink)] px-6 py-16 text-center text-white">
        <h2 className="text-[clamp(24px,3vw,32px)] font-extrabold leading-[1.3] tracking-[-.03em] text-white">
          오늘 실력이 어느 밴드인지부터 확인하세요
        </h2>
        <p className="mx-auto mb-7 mt-3 max-w-[36em] text-[15.5px] text-[#B9C4DC]">
          가입 없이 12개 유형을 체험하거나, 90분 풀 모의고사로 현재 밴드와 라우팅 결과를 받아보세요.
        </p>
        <Link
          href="/toefl/sample"
          className="inline-flex rounded-[10px] bg-[var(--en-gold)] px-7 py-3.5 text-[15.5px] font-bold text-[var(--en-on-gold)] shadow-[0_2px_8px_rgba(245,166,35,.35)] transition-transform hover:-translate-y-px"
        >
          무료 샘플 풀어보기
        </Link>
      </div>

      {/* ───────── 푸터 ───────── */}
      <footer className="px-6 pb-14 pt-11 text-[13px] text-[var(--en-ink-soft)]">
        <div className="mx-auto flex max-w-[1120px] flex-wrap justify-between gap-5">
          <span>
            © PM EDU · toefl.pmedu4u.com — TOEFL®는 ETS의 등록상표이며, 본 사이트의 문항은 자체 제작
            콘텐츠입니다.
          </span>
          {/* TODO: 이용약관·개인정보처리방침 페이지가 생기면 실제 경로로 교체한다. */}
          <nav className="flex gap-4.5">
            <span className="cursor-default">이용약관</span>
            <span className="cursor-default">개인정보처리방침</span>
            <Link href="/contact" className="hover:text-[var(--en-ink)]">
              문의
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
