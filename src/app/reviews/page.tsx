import Header from "@/components/Header";
import Footer from "@/components/Footer";

const reviews = [
  {
    name: "학부모 김OO",
    course: "중등 수학 내신 대비",
    content: "설명이 쉽고 자료가 알차서 아이가 혼자서도 잘 따라갔어요.",
  },
  {
    name: "학생 이OO",
    course: "IB Math AA/AI 대비 종합반",
    content: "IA 작성 가이드가 특히 도움이 많이 됐습니다.",
  },
  {
    name: "학부모 박OO",
    course: "초등 수학 개념완성",
    content: "연산 개념을 차근차근 잡아줘서 좋았어요.",
  },
];

export default function ReviewsPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-3xl font-medium text-[var(--foreground)]">수강 후기</h1>
        <p className="mt-2 text-[var(--secondary)]">
          실제 수강생과 학부모님들의 후기입니다. (임시 예시)
        </p>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {reviews.map((review, i) => (
            <div
              key={i}
              className="rounded-2xl border border-[var(--border-c)] bg-white p-6"
            >
              <p className="text-sm leading-relaxed text-[var(--foreground)]">
                &ldquo;{review.content}&rdquo;
              </p>
              <p className="mt-4 text-xs text-[var(--secondary)]">
                {review.name} · {review.course}
              </p>
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
