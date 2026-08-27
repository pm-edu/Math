import { redirect } from "next/navigation";

// 화면 검토(2026-08-27) [D]: v1(Leitner) 단어 학습은 완전학습 엔진(v2, /english)으로 이미
// 완전히 교체됐다(2026-08-13) — 이 경로는 옛 안내 화면만 남아 있었고 어디서도 링크되지 않는
// 고아 화면이었다(화면 인벤토리로 확인함). 화면 자체를 지우는 대신 리다이렉트로 남겨서,
// 혹시 남아 있을 옛 북마크·외부 링크도 깨지지 않게 한다.
export default function VocabPage() {
  redirect("/english");
}
