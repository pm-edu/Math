import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function ContactPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-3xl font-medium text-[var(--foreground)]">문의하기</h1>
        <p className="mt-2 text-[var(--secondary)]">
          궁금하신 점을 남겨주시면 빠르게 답변드리겠습니다.
        </p>

        <form className="mt-10 space-y-5">
          <div>
            <label className="text-sm font-medium text-[var(--foreground)]">이름</label>
            <input
              type="text"
              placeholder="홍길동"
              className="mt-1.5 w-full rounded-lg border border-[var(--border-c)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--foreground)]">이메일</label>
            <input
              type="email"
              placeholder="name@example.com"
              className="mt-1.5 w-full rounded-lg border border-[var(--border-c)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--foreground)]">문의 내용</label>
            <textarea
              rows={5}
              placeholder="문의하실 내용을 입력해주세요"
              className="mt-1.5 w-full rounded-lg border border-[var(--border-c)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]"
            />
          </div>
          <button
            type="submit"
            className="rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)] transition-transform hover:scale-[1.02]"
          >
            문의 보내기
          </button>
        </form>
      </main>
      <Footer />
    </>
  );
}
