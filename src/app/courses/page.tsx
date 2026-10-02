import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CoursesRenewingNotice from "@/components/CoursesRenewingNotice";

// 2026-10-02 응급처치: 사이트를 새로 지을 예정이라 강좌 목록·가격·수강 신청 안내를 숨기고
// "새 단장 중" 안내만 보여준다. 예전 목록 화면은 git 기록(8767eba)에 그대로 있다.
export default function CoursesPage() {
  return (
    <>
      <Header />
      <CoursesRenewingNotice />
      <Footer />
    </>
  );
}
