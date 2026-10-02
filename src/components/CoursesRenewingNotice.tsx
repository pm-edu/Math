import Link from "next/link";
import { T } from "@/components/T";

// 강좌 목록·상세 페이지 공용 임시 안내(2026-10-02 응급처치). 목록·가격·수강 신청 버튼을 숨기고
// 이것만 보여준다 — 사이트를 새로 지을 예정이라 기존 강좌 화면은 고치지 않고 덮어두기만 한다.
export default function CoursesRenewingNotice() {
  return (
    <main className="min-h-screen bg-en-paper">
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <h1 className="text-3xl font-bold text-en-ink">
          <T k="courses_renewingTitle" />
        </h1>
        <p className="mt-4 text-en-ink-soft">
          <T k="courses_renewingBody" />
        </p>
        <Link
          href="/contact"
          className="mt-8 inline-flex items-center justify-center h-12 px-[22px] rounded-[11px] bg-en-ink text-white text-[.9375rem] font-bold transition-colors hover:bg-en-ink/90"
        >
          <T k="courses_contactCta" />
        </Link>
      </div>
    </main>
  );
}
