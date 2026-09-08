import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createServiceClient } from "@/lib/supabase/service";
import UnsubscribeButton from "./UnsubscribeButton";

// 메일 속 "구독 해지" 링크가 여는 화면. 이 페이지를 여는 것 자체(GET, 읽기전용 조회)로는
// 아무것도 바뀌지 않는다 — 실제 해지는 버튼을 눌러야 실행되는 별도 POST 요청으로 한다
// (메일 보안 스캐너가 링크를 미리 열어보기만 해도 자동 해지되는 사고 방지).
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  const info = token
    ? await createServiceClient()
        .from("mailing_subscribers")
        .select("email, unsubscribed_at")
        .eq("unsubscribe_token", token)
        .maybeSingle()
        .then((r) => r.data)
    : null;

  return (
    <>
      <Header />
      <main className="min-h-screen bg-en-paper px-6 py-24">
        <div className="mx-auto max-w-md rounded-2xl border border-en-line bg-en-card p-8 text-center shadow-sm">
          {!token || !info ? (
            <>
              <h1 className="text-xl font-bold text-en-ink">잘못된 링크입니다</h1>
              <p className="mt-2 text-sm text-en-ink-soft">유효하지 않거나 만료된 수신거부 링크입니다.</p>
            </>
          ) : info.unsubscribed_at ? (
            <>
              <h1 className="text-xl font-bold text-en-ink">이미 수신거부 상태입니다</h1>
              <p className="mt-2 text-sm text-en-ink-soft">{info.email}(으)로는 더 이상 메일이 발송되지 않습니다.</p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-en-ink">구독을 해지하시겠어요?</h1>
              <p className="mt-2 text-sm text-en-ink-soft">{info.email}로 더 이상 문제지 메일을 보내지 않습니다.</p>
              <UnsubscribeButton token={token} />
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
