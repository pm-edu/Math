import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CoursesRenewingNotice from "@/components/CoursesRenewingNotice";

// 2026-10-02 응급처치: 강좌 상세의 가격·수강 신청 버튼·강의실 입장 버튼을 숨기고 목록과 같은
// "새 단장 중" 안내를 보여준다. 어떤 주소로 들어와도 같은 안내라 강좌 조회도 하지 않는다.
// 수강 신청은 브라우저→DB 직접 쓰기(EnrollButton, RLS)인데 DB 규칙은 바꾸지 않기로 했다(화면만 숨김).
// 예전 상세 화면은 git 기록(8767eba)에 그대로 있다.
export default function CourseDetailPage() {
  return (
    <>
      <Header />
      <CoursesRenewingNotice />
      <Footer />
    </>
  );
}
