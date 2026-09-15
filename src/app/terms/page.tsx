import Header from "@/components/Header";
import Footer from "@/components/Footer";

// 임시 플레이스홀더 — 실제 약관 문구는 아직 없음(2026-09-15, RUN_SIGNUP.md S2).
// 가입 화면의 "이용약관" 동의 체크박스가 링크할 대상이 없어서 우선 만들어 둔다.
export default function TermsPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-medium text-[var(--foreground)]">이용약관</h1>
        <p className="mt-4 text-sm leading-relaxed text-[var(--secondary)]">
          이용약관 내용은 준비 중입니다. 문의사항은{" "}
          <a href="/contact" className="text-[var(--pink-dark)] underline">
            문의하기
          </a>
          로 연락해주세요.
        </p>
      </main>
      <Footer />
    </>
  );
}
