"use client";

import katex from "katex";
import "katex/dist/katex.min.css";
import "./problem-math.css";
import type { Problem } from "@/lib/problems";

// 텍스트 안에 섞인 LaTeX 수식($...$, $$...$$, \(...\), \[...\])을
// KaTeX로 출판물 형태로 렌더링한다. 나머지 글자는 그대로 둔다.
const MATH_RE =
  /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)/g;

function renderLatex(latex: string, display: boolean): string {
  try {
    return katex.renderToString(latex, {
      displayMode: display,
      throwOnError: false,
    });
  } catch {
    return latex;
  }
}

export function MathText({ text, className }: { text: string; className?: string }) {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  MATH_RE.lastIndex = 0;

  while ((m = MATH_RE.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(<span key={key++}>{text.slice(last, m.index)}</span>);
    }
    const display = m[1] !== undefined || m[3] !== undefined;
    const latex = m[1] ?? m[2] ?? m[3] ?? m[4] ?? "";
    nodes.push(
      <span
        key={key++}
        dangerouslySetInnerHTML={{ __html: renderLatex(latex, display) }}
      />
    );
    last = MATH_RE.lastIndex;
  }
  if (last < text.length) {
    nodes.push(<span key={key++}>{text.slice(last)}</span>);
  }

  return (
    <div className={`math-body whitespace-pre-wrap ${className ?? ""}`}>{nodes}</div>
  );
}

// 문제 하나를 화면에 표시한다.
// - 텍스트로 추출한 문제(problem_type === "text")는 수식을 렌더링해 보여주고,
// - 이미지로 등록한 문제는 기존처럼 이미지를 보여준다.
export function ProblemBody({
  problem,
  imgClassName,
  textClassName,
}: {
  problem: Problem;
  imgClassName?: string;
  textClassName?: string;
}) {
  if (problem.problem_type === "text" && problem.content_text) {
    return (
      <MathText
        text={problem.content_text}
        className={
          textClassName ??
          "text-[15px] leading-relaxed text-[var(--foreground)]"
        }
      />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={problem.image_url} alt="문제" className={imgClassName} />;
}
