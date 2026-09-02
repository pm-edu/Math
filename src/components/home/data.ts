// 홈페이지 트랙 셀렉터의 콘텐츠 — JSX에 하드코딩하지 않고 여기 배열로 분리한다(지시서 §2).

export type ProgramStatus = "live" | "soon";

export interface Program {
  id: string;
  label: string; // "TOEFL" | "단어" | "SAT" | "IELTS" | "일반영어"
  labelLang: "en" | "ko"; // en이면 Space Grotesk, ko면 Pretendard로 렌더(ProgramRow가 분기)
  description: string;
  status: ProgramStatus;
  href?: string; // live일 때만
  icon: "toefl" | "vocab" | "sat" | "ielts" | "general";
}

export const PROGRAMS: Program[] = [
  {
    id: "toefl",
    label: "TOEFL",
    labelLang: "en",
    description: "2026 개편 포맷 그대로. 12유형 연습과 적응형 모의고사",
    status: "live",
    href: "/toefl",
    icon: "toefl",
  },
  {
    id: "vocab",
    label: "단어",
    labelLang: "ko",
    description: "간격 반복으로 외운 단어를 잊지 않게 관리합니다",
    status: "live",
    href: "/english",
    icon: "vocab",
  },
  {
    id: "sat",
    label: "SAT",
    labelLang: "en",
    description: "출시 알림을 신청하면 오픈할 때 알려드립니다",
    status: "soon",
    icon: "sat",
  },
  {
    id: "ielts",
    label: "IELTS",
    labelLang: "en",
    description: "출시 알림을 신청하면 오픈할 때 알려드립니다",
    status: "soon",
    icon: "ielts",
  },
  {
    id: "general",
    label: "일반영어",
    labelLang: "ko",
    description: "시험 대비가 아닌 기초 회화·독해 과정을 준비하고 있어요",
    status: "soon",
    icon: "general",
  },
];

export const MATH_CHIPS = ["초등", "중등", "고등", "IB"];

export const FLOW_STEPS: { no: string; title: string; body: string }[] = [
  { no: "1단계", title: "진단", body: "30분 진단으로 지금 위치와 약한 단원을 찾습니다." },
  { no: "2단계", title: "수업", body: "화상 수업과 공용 화이트보드에서 문제를 같이 풉니다." },
  { no: "3단계", title: "복습", body: "틀린 문제는 잊을 때쯤 다시 돌아옵니다." },
  { no: "4단계", title: "리포트", body: "정답률과 약점 단원을 매주 학부모님께 보냅니다." },
];

export const CURRICULUM_CHIPS: { name: string; note?: string }[] = [
  { name: "IGCSE", note: "0607" },
  { name: "Cambridge", note: "AS · A Level" },
  { name: "IB", note: "AA HL · SL" },
  { name: "IB", note: "AI HL · SL" },
  { name: "인도", note: "CBSE" },
  { name: "한국 교육과정" },
  { name: "TOEFL", note: "iBT 2026" },
];
