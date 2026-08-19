"use client";

// 랜딩 히어로 우측의 시그니처 블록 — 적응형 라우팅 구조도 + 목표 밴드 눈금.
// docs/toefl-main.html 의 .rail-card 를 그대로 옮긴 것.
//
// SVG 안 색은 하드코딩하지 않고 currentColor 또는 CSS 변수를 참조한다. 다만 <marker> 안의
// fill 은 참조 시점 문제로 변수가 안 먹는 브라우저가 있어, 화살촉만 부모에서 색을 내려준다.
// 문구는 아직 한국어 하드코딩이다 — 번역 연결은 이후 단계(사전 치환)에서 일괄 처리한다.

import { useState } from "react";

const BANDS = ["1.0", "2.0", "3.0", "4.0", "5.0", "6.0"];
const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"];
const DEFAULT_BAND = "4.0";

export default function RoutingRail() {
  const [band, setBand] = useState(DEFAULT_BAND);

  return (
    <div className="rounded-[20px] border border-[var(--en-line)] bg-[var(--en-card)] p-[26px] pb-[22px] shadow-[0_1px_2px_rgba(24,42,78,.05),0_8px_24px_rgba(24,42,78,.07)]">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="en-num text-[13px] font-extrabold uppercase tracking-[.08em] text-[var(--en-ink-soft)]">
          Adaptive Routing
        </span>
        <span className="text-[11.5px] font-bold text-[var(--en-gold-deep)]">Reading · Listening 적용</span>
      </div>

      <svg
        viewBox="0 0 460 190"
        className="block h-auto w-full"
        role="img"
        aria-label="1단계 모듈 성적에 따라 상급 경로는 밴드 6.0까지, 하급 경로는 밴드 4.0까지로 갈라지는 구조"
      >
        <defs>
          <marker id="rail-ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--en-ink)" />
          </marker>
          <marker id="rail-ahg" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--en-gold)" />
          </marker>
        </defs>

        {/* Stage 1 — 전원 동일 난이도 */}
        <rect x="10" y="72" width="118" height="46" rx="12" fill="var(--en-ink)" />
        <text x="69" y="91" textAnchor="middle" fill="#fff" fontSize="12.5" fontWeight="700">
          Stage 1
        </text>
        <text x="69" y="107" textAnchor="middle" fill="#B9C4DC" fontSize="10.5">
          전원 동일 난이도
        </text>

        {/* 갈림길 — 위(상급)는 골드 실선, 아래(하급)는 회색 점선 */}
        <path d="M128,95 C170,95 175,45 218,45" fill="none" stroke="var(--en-gold)" strokeWidth="3.5" markerEnd="url(#rail-ahg)" />
        <path
          d="M128,95 C170,95 175,148 218,148"
          fill="none"
          stroke="#C6CFDF"
          strokeWidth="3"
          strokeDasharray="6 5"
          markerEnd="url(#rail-ah)"
        />

        {/* 상급 모듈 */}
        <rect x="224" y="22" width="128" height="46" rx="12" fill="var(--en-gold-soft)" stroke="var(--en-gold)" strokeWidth="1.8" />
        <text x="288" y="41" textAnchor="middle" fill="#8A5B00" fontSize="12.5" fontWeight="700">
          상급 모듈
        </text>
        <text x="288" y="57" textAnchor="middle" fill="#B07A10" fontSize="10.5">
          Stage 2 · Hard
        </text>

        {/* 하급 모듈 */}
        <rect x="224" y="125" width="128" height="46" rx="12" fill="#F0F4FB" stroke="#C6CFDF" strokeWidth="1.5" />
        <text x="288" y="144" textAnchor="middle" fill="var(--en-ink-soft)" fontSize="12.5" fontWeight="700">
          하급 모듈
        </text>
        <text x="288" y="160" textAnchor="middle" fill="#7C8AA5" fontSize="10.5">
          Stage 2 · Easy
        </text>

        {/* 결과: 점수 상한 */}
        <text x="368" y="40" fill="var(--en-ink)" fontSize="13" fontWeight="700" className="en-num">
          Band ≤ 6.0
        </text>
        <text x="368" y="56" fill="#B07A10" fontSize="10.5">
          상한 없음
        </text>
        <text x="368" y="143" fill="var(--en-ink-soft)" fontSize="13" fontWeight="700" className="en-num">
          Band ≤ 4.0
        </text>
        <text x="368" y="159" fill="#7C8AA5" fontSize="10.5">
          만점도 4.0
        </text>
      </svg>

      <div className="mt-2.5 flex justify-between text-xs text-[var(--en-ink-soft)]">
        <span>첫 모듈이 점수 상한을 결정합니다</span>
        <span>목표 밴드를 눌러보세요 ↓</span>
      </div>

      <div className="mt-4 flex gap-[5px]" role="group" aria-label="목표 밴드 선택">
        {BANDS.map((b) => {
          const on = b === band;
          return (
            <button
              key={b}
              type="button"
              onClick={() => setBand(b)}
              aria-pressed={on}
              className={`en-num flex-1 rounded-lg py-[7px] text-center text-[13px] font-bold transition-all ${
                on
                  ? "-translate-y-0.5 bg-[var(--en-gold)] text-[var(--en-on-gold)] shadow-[0_3px_8px_rgba(245,166,35,.4)]"
                  : "bg-[#F0F4FB] text-[var(--en-ink-soft)]"
              }`}
            >
              {b}
            </button>
          );
        })}
      </div>

      <div className="mt-1 flex gap-[5px]" aria-hidden="true">
        {CEFR.map((c) => (
          <span key={c} className="flex-1 text-center text-[10.5px] tracking-[.04em] text-[var(--en-ink-soft)]">
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}
