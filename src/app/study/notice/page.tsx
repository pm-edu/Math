import Header from "@/components/Header";
import Footer from "@/components/Footer";

// 접근권(entitlement_grants) 없는 학생이 도달하는 안내 화면(RUN_MATH_SITE.md 2-6).
// math. 호스트에서는 /courses의 "강좌 가입"을 노출하지 않으므로(전역 금지: 결제 웹훅 등은
// 이번 범위 밖), 문의처만 안내한다.
export default function StudyNoticePage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-xl font-medium text-[var(--foreground)]">수강 신청 안내</h1>
        <p className="mt-3 text-sm text-[var(--secondary)]">
          아직 수강 신청이 확인되지 않은 계정입니다. 아래로 문의해주시면 안내해드립니다.
        </p>
        <div className="mt-8 space-y-2 rounded-2xl border border-[var(--border-c)] bg-white p-6 text-sm text-[var(--foreground)]">
          <p>WhatsApp: +91 99580 64728</p>
          <p>KakaoTalk ID: 2014pmedu</p>
        </div>
      </main>
      <Footer />
    </>
  );
}
