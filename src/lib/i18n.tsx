"use client";

// 화면 문구의 한/영 전환.
// 메뉴·버튼 같은 고정 문구만 다루며, DB에 저장된 내용(강좌 제목 등)은
// 입력된 언어 그대로 표시된다.

import { createContext, useContext, useEffect, useState } from "react";
import { sharedCookieDomain } from "@/lib/cookie-domain";

export type Lang = "ko" | "en";

const DICT = {
  // 헤더 · 푸터
  browse: { ko: "강좌 둘러보기", en: "Courses" },
  reviews: { ko: "후기", en: "Reviews" },
  contact: { ko: "문의", en: "Contact" },
  admin: { ko: "관리", en: "Admin" },
  mypage: { ko: "마이페이지", en: "My Page" },
  login: { ko: "로그인", en: "Log in" },
  quickLinks: { ko: "바로가기", en: "Links" },
  contactTitle: { ko: "문의", en: "Contact" },
  freeSample: { ko: "무료 샘플 보기", en: "Free Samples" },
  popularCourse: { ko: "새로 열린 강좌", en: "New course" },

  // 강좌 목록 · 상세
  coursesTitle: { ko: "강좌 · 자료", en: "Courses & Materials" },
  coursesSubtitle: {
    ko: "초 · 중 · 고 · IB 과정별 동영상 강의와 학습자료 패키지",
    en: "Video lessons and study materials from Elementary to IB",
  },
  includes: { ko: "구성", en: "What's included" },
  addToCart: { ko: "장바구니에 담기", en: "Add to cart" },
  enterClassroom: { ko: "강의실 들어가기", en: "Enter classroom" },

  // 수강신청
  enroll: { ko: "수강 신청하기", en: "Enroll" },
  enrolling: { ko: "신청 중...", en: "Enrolling..." },
  loginToEnroll: { ko: "로그인하고 신청하기", en: "Log in to enroll" },
  enrollPending: { ko: "입금 확인 중", en: "Awaiting payment" },
  enrolled: { ko: "수강 중", en: "Enrolled" },
  enrollDoneTitle: { ko: "수강 신청이 접수되었습니다", en: "Enrollment requested" },
  enrollDoneSub: {
    ko: "아래 계좌로 입금해 주시면, 확인 후 강의가 열립니다.",
    en: "Transfer to the account below. Your lessons open after we confirm payment.",
  },
  bankInfoTitle: { ko: "입금 계좌", en: "Payment details" },
  bankInfoPreparing: {
    ko: "입금 안내는 곧 등록됩니다. 문의로 연락 주세요.",
    en: "Payment details coming soon. Please reach us via Contact.",
  },
  alreadyPending: {
    ko: "이미 신청하셨습니다. 입금 확인을 기다리고 있습니다.",
    en: "Already requested. Awaiting payment confirmation.",
  },
  alreadyEnrolled: { ko: "이미 수강 중인 강좌입니다.", en: "You're already enrolled." },
  enrollFailed: {
    ko: "신청에 실패했습니다. 잠시 후 다시 시도해주세요.",
    en: "Request failed. Please try again shortly.",
  },

  // 무료 샘플 · 강의실 · 재생
  sampleTitle: { ko: "무료 샘플 강의", en: "Free Sample Lessons" },
  sampleSubtitle: {
    ko: "결제 없이 미리 보실 수 있는 강의입니다.",
    en: "Preview these lessons without payment.",
  },
  samplePreparing: { ko: "준비 중입니다.", en: "Coming soon." },
  samplePreparingSub: {
    ko: "무료 샘플 강의를 준비하고 있습니다. 먼저 강좌 구성을 살펴보세요.",
    en: "Free samples are on the way. Browse the courses in the meantime.",
  },
  freeBadge: { ko: "무료 샘플", en: "Free sample" },
  watchVideo: { ko: "영상 보러 가기", en: "Watch video" },
  noVideo: { ko: "아직 영상이 등록되지 않았습니다.", en: "No video yet." },
  closeVideo: { ko: "영상 닫기", en: "Close video" },
  downloadMaterial: { ko: "학습자료 내려받기", en: "Download materials" },
  backToCourse: { ko: "← 강좌 소개로", en: "← Back to course" },
  classroom: { ko: "강의실", en: "Classroom" },
  loading: { ko: "불러오는 중...", en: "Loading..." },
  noLessons: { ko: "아직 볼 수 있는 강의가 없습니다.", en: "No lessons available yet." },
  noLessonsLoggedIn: {
    ko: "이 강좌를 수강 신청하시면 전체 강의가 열립니다.",
    en: "Enroll in this course to unlock all lessons.",
  },
  noLessonsLoggedOut: {
    ko: "로그인 후 수강 중인 강좌의 강의를 보실 수 있습니다.",
    en: "Log in to watch lessons from your enrolled courses.",
  },
  exploreCourse: { ko: "강좌 살펴보기", en: "View course" },

  // 로그인 · 회원가입
  email: { ko: "이메일", en: "Email" },
  password: { ko: "비밀번호", en: "Password" },
  name: { ko: "이름", en: "Name" },
  signup: { ko: "회원가입", en: "Sign up" },
  forgotPassword: { ko: "비밀번호를 잊으셨나요?", en: "Forgot your password?" },
  noAccount: { ko: "계정이 없으신가요?", en: "Don't have an account?" },
  haveAccount: { ko: "이미 계정이 있으신가요?", en: "Already have an account?" },
  loggingIn: { ko: "로그인 중...", en: "Logging in..." },
  signingUp: { ko: "가입 중...", en: "Signing up..." },
  pwPlaceholder: { ko: "6자 이상 입력해주세요", en: "At least 6 characters" },
  signupDone: { ko: "가입 확인 이메일을 보냈어요", en: "Check your inbox" },
  signupDoneSub: {
    ko: "메일함에서 인증 링크를 확인한 뒤 로그인해주세요.",
    en: "Click the verification link in your email, then log in.",
  },
  goLogin: { ko: "로그인하러 가기", en: "Go to login" },

  // 후기
  reviewsTitle: { ko: "수강 후기", en: "Student Reviews" },
  reviewsSubtitle: {
    ko: "실제 수강생과 학부모님들이 남겨주신 후기입니다.",
    en: "Reviews from real students and parents.",
  },
  noReviews: { ko: "아직 등록된 후기가 없습니다.", en: "No reviews yet." },
  noReviewsSub: { ko: "첫 수강 후기를 기다리고 있습니다.", en: "Be the first to leave one." },
  student: { ko: "수강생", en: "Student" },

  // 문의
  contactPageTitle: { ko: "문의하기", en: "Contact Us" },
  contactSubtitle: {
    ko: "궁금하신 점을 남겨주시면 빠르게 답변드리겠습니다.",
    en: "Leave a message and we'll get back to you quickly.",
  },
  message: { ko: "문의 내용", en: "Message" },
  send: { ko: "문의 보내기", en: "Send" },
  sending: { ko: "보내는 중...", en: "Sending..." },
  contactDone: { ko: "문의가 접수되었습니다", en: "Your message has been received" },
  contactDoneSub: { ko: "남겨주신 이메일로 답변드리겠습니다.", en: "We'll reply to your email." },
  whatsapp: { ko: "왓츠앱으로 상담하기", en: "Chat on WhatsApp" },

  // 마이페이지
  myInfo: { ko: "내 정보", en: "My Info" },
  logout: { ko: "로그아웃", en: "Log out" },
  myCourses: { ko: "내 강좌", en: "My Courses" },
  noCourses: {
    ko: "아직 수강 중인 강좌가 없습니다.",
    en: "You're not enrolled in any courses yet.",
  },
  goWatch: { ko: "보러 가기", en: "Watch" },
  adminPanel: { ko: "학생 관리 화면으로", en: "Go to admin panel" },
  myWorksheets: { ko: "내 학습지", en: "My Worksheets" },
  writeReview: { ko: "후기 쓰기", en: "Write a review" },
  editReview: { ko: "후기 수정", en: "Edit review" },
  reviewPlaceholder: { ko: "강좌는 어떠셨나요?", en: "How was the course?" },
  reviewSubmit: { ko: "후기 등록", en: "Submit review" },
  reviewSaving: { ko: "등록 중...", en: "Submitting..." },
  reviewSaved: { ko: "후기가 등록되었습니다.", en: "Your review has been saved." },
  reviewFailed: { ko: "후기 등록에 실패했습니다.", en: "Failed to save your review." },

  // 계정
  withdraw: { ko: "회원 탈퇴", en: "Delete account" },
  withdrawConfirm: {
    ko: "정말 탈퇴하시겠어요? 계정과 학습 기록이 모두 삭제되며 되돌릴 수 없습니다.",
    en: "Delete your account? Your data and records will be permanently removed.",
  },
  withdrawDone: { ko: "탈퇴가 완료되었습니다.", en: "Your account has been deleted." },
  withdrawFailed: {
    ko: "탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해주세요.",
    en: "Failed to delete account. Please try again shortly.",
  },
  dangerZone: { ko: "계정 관리", en: "Account" },

  // ===== TOEFL 안내 화면 전용 (2026-08-18) =====
  // 시험 응시 화면(test/[attemptId]/...)과 /toefl/sample은 절대 여기 안 들어간다 — spec §14
  // "학생 응시 화면은 영어만" 이 여전히 유효해서, 그 화면들은 이 사전과 무관하게 하드코딩
  // 영어로 남는다. 아래는 진입/사전점검/마이페이지/제출후/리포트/리뷰 화면(전부 ToeflHeader가
  // 있는 "안내" 화면)에서만 쓴다.
  toefl_myPageSubtitle: { ko: "진행 중인 시험과 지난 응시 기록입니다.", en: "Your in-progress and past TOEFL attempts." },
  toefl_openReviewQueue: { ko: "복습 큐 열기 →", en: "Open review queue →" },
  toefl_backHome: { ko: "← TOEFL 홈으로", en: "← Back to TOEFL home" },
  toefl_fullTest: { ko: "풀 모의고사", en: "Full test" },
  toefl_sectionPractice: { ko: "영역별 연습", en: "Section practice" },
  toefl_loadFailed: { ko: "불러오지 못했습니다.", en: "Failed to load." },
  toefl_reportNotFound: { ko: "리포트를 찾을 수 없습니다.", en: "Report not found." },
  toefl_sectionReading: { ko: "리딩", en: "Reading" },
  toefl_sectionListening: { ko: "리스닝", en: "Listening" },
  toefl_sectionSpeaking: { ko: "스피킹", en: "Speaking" },
  toefl_sectionWriting: { ko: "라이팅", en: "Writing" },
  toefl_sectionDescReading: {
    ko: "빈칸 어휘 문제와 짧은 지문 독해",
    en: "Fill-in-the-blank vocabulary and short passages",
  },
  toefl_sectionDescListening: {
    ko: "대화, 안내방송, 강의 듣기",
    en: "Conversations, announcements, and lectures",
  },
  toefl_sectionDescSpeaking: {
    ko: "문장 따라 말하기와 인터뷰 질문 답하기",
    en: "Repeat sentences and answer interview questions",
  },
  toefl_sectionDescWriting: {
    ko: "문장 완성하기와 구조화된 답안 작성",
    en: "Build sentences and write structured responses",
  },

  // 진입화면
  toefl_title: { ko: "TOEFL 연습", en: "TOEFL Practice" },
  toefl_subtitle: {
    ko: "2026년 개편 포맷 · Reading·Listening은 실력에 맞춰 난이도가 조정됩니다",
    en: "2026 format · Reading & Listening adapt to your level",
  },
  toefl_seeSample: { ko: "샘플 문제 보기 →", en: "See sample questions →" },
  toefl_sampleNote: {
    ko: "계정 없이 볼 수 있습니다. 전체 채점 응시는 가입 후 가능합니다.",
    en: "No account needed. Sign up to take the full, scored test.",
  },
  toefl_noFormsSampleGuide: {
    ko: "현재 응시 가능한 시험이 없어 샘플로 안내합니다.",
    en: "There are no practice sets available to take right now — here's a sample instead.",
  },
  toefl_recommended: { ko: "추천", en: "Recommended" },
  toefl_takenBefore: { ko: "이전에 {count}회 응시함", en: "Taken {count} time(s) before" },
  toefl_fullTestTitle: { ko: "풀 모의고사 응시하기", en: "Take the Full Practice Test" },
  toefl_fullTestSummary: {
    ko: "4개 영역 · 문항 {count}개 · 총 약 {duration}(쉬는 시간 없음)",
    en: "4 sections · {count} questions · about {duration} total, no breaks",
  },
  toefl_retakeFull: { ko: "다시 응시하기 →", en: "Retake Full Test →" },
  toefl_startFull: { ko: "풀 모의고사 시작 →", en: "Start Full Test →" },
  toefl_practiceSectionTitle: { ko: "한 영역씩 연습하기", en: "Practice one section at a time" },
  toefl_practiceSectionSub: { ko: "짧은 세션, 같은 문제은행", en: "Shorter sessions, same question bank" },
  toefl_sectionSummary: { ko: "문항 {count}개 · 약 {duration}", en: "{count} questions · about {duration}" },
  toefl_notAvailable: { ko: "아직 준비되지 않았습니다", en: "Not available yet" },
  toefl_practiceButton: { ko: "연습하기", en: "Practice" },
  toefl_trademark: {
    ko: "TOEFL®은 ETS의 등록상표이며, 본 서비스는 ETS의 승인이나 제휴 관계가 없습니다.",
    en: "TOEFL® is a registered trademark of ETS. This service is not endorsed or affiliated with ETS.",
  },

  // 사전 점검 화면
  toefl_checkTitle: { ko: "시작하기 전에", en: "Before you start" },
  toefl_checkSubtitle: {
    ko: "응시 중 방해받지 않도록 간단히 확인합니다.",
    en: "A quick check so nothing interrupts you mid-test.",
  },
  toefl_safariWarning: {
    ko: "Safari는 오디오 녹음에 알려진 제약이 있습니다. Speaking 영역은 Chrome이나 Firefox를 권장합니다.",
    en: "Safari has known limitations recording audio. Chrome or Firefox is recommended for the Speaking section.",
  },
  toefl_screenTooNarrow: {
    ko: "화면 너비가 {width}px보다 좁습니다. 풀 모의고사는 노트북·데스크톱 크기 화면이 필요합니다 — 다른 기기로 접속해주세요. (영역별 연습은 이 화면에서도 가능합니다.)",
    en: "Your screen is narrower than {width}px. The full test needs a laptop/desktop-sized screen — please switch devices to continue. (Section practice still works on this screen.)",
  },
  toefl_screenTooNarrowFix: {
    ko: "해결 방법: 브라우저 창을 최대화하거나, 태블릿의 화면 회전을 가로로 바꾸거나, 노트북/데스크톱으로 다시 접속해 주세요.",
    en: "How to fix: maximize your browser window, rotate your tablet to landscape, or switch to a laptop/desktop.",
  },
  toefl_audioCheckLabel: { ko: "오디오 확인", en: "Audio check" },
  toefl_audioCheckDesc: {
    ko: "테스트 소리를 재생해서 잘 들리는지 확인해주세요.",
    en: "Play the test sound and confirm you can hear it clearly.",
  },
  toefl_playTestSound: { ko: "▶ 테스트 소리 재생", en: "▶ Play test sound" },
  toefl_replaySound: { ko: "다시 재생", en: "Replay" },
  toefl_volumeOutputHint: {
    ko: "소리가 안 들리면 기기 볼륨을 확인하고, 헤드폰/이어폰이 연결돼 있다면 출력 장치가 맞게 선택됐는지 확인하세요.",
    en: "If you can't hear anything, check your device volume and make sure the right output (speakers/headphones) is selected.",
  },
  toefl_heardClearly: { ko: "소리가 잘 들렸습니다", en: "I heard the sound clearly" },
  toefl_micCheckLabel: { ko: "마이크 확인", en: "Microphone check" },
  toefl_micCheckDesc: {
    ko: "3초간 녹음 후 재생해보세요 — 이 영역은 Speaking이 포함됩니다.",
    en: "Record 3 seconds and play it back — this section requires Speaking.",
  },
  toefl_record3s: { ko: "● 3초 녹음", en: "● Record 3s" },
  toefl_recordingEllipsis: { ko: "● 녹음 중…", en: "● Recording…" },
  toefl_soundsGood: { ko: "✓ 잘 들려요", en: "✓ Sounds good" },
  toefl_recordAgain: { ko: "다시 녹음", en: "Record again" },
  toefl_micConfirmed: { ko: "✓ 마이크 확인됨", en: "✓ Microphone confirmed" },
  toefl_micBlocked: { ko: "마이크 접근이 차단되었습니다.", en: "Microphone access was blocked." },
  toefl_micBlockedSafari: {
    ko: "Safari: 설정 → 웹사이트 → 마이크에서 이 사이트를 허용으로 바꾼 뒤 새로고침하세요.",
    en: "Safari: Settings → Websites → Microphone, set this site to Allow, then reload.",
  },
  toefl_micBlockedChrome: {
    ko: "Chrome/Edge: 주소창 옆 🔒 아이콘 → 사이트 설정 → 마이크 → 허용으로 바꾼 뒤 새로고침하세요.",
    en: "Chrome/Edge: click the 🔒 icon next to the address bar → Site settings → Microphone → Allow, then reload.",
  },
  toefl_micBlockedFirefox: {
    ko: "(Firefox: 🔒 아이콘 → 권한 → 마이크 허용 후 새로고침하세요.)",
    en: "(Firefox: click the 🔒 icon → Permissions → allow the mic, then reload.)",
  },
  toefl_tryAgain: { ko: "다시 시도", en: "Try again" },
  toefl_micDeviceLabel: { ko: "마이크 선택", en: "Choose microphone" },
  toefl_recheckWithDevice: { ko: "이 장치로 다시 점검", en: "Recheck with this device" },
  toefl_continueWithoutSpeaking: { ko: "Speaking 없이 계속하기 →", en: "Continue without Speaking →" },
  toefl_beforeYouBegin: { ko: "시작하기 전 유의사항", en: "Before you begin" },
  toefl_noticeAudioOnce: { ko: "오디오는 한 번만 재생됩니다.", en: "Each audio clip plays only once." },
  toefl_noticeNoReRecord: {
    ko: "Speaking 답변은 제출 후 다시 녹음할 수 없습니다.",
    en: "Speaking responses can't be re-recorded once submitted.",
  },
  toefl_noticeTimerRuns: {
    ko: "시험 화면을 벗어나도 타이머는 멈추지 않고 계속 흐릅니다.",
    en: "Leaving the test doesn't pause the timer — it keeps running.",
  },
  toefl_iUnderstand: { ko: "확인했습니다", en: "I understand" },
  toefl_starting: { ko: "시작하는 중...", en: "Starting..." },
  toefl_start: { ko: "시작 →", en: "Start →" },
  toefl_missingSelection: { ko: "선택된 시험 정보가 없습니다.", en: "Missing test selection." },
  toefl_failedToStart: { ko: "시험을 시작하지 못했습니다.", en: "Failed to start the test." },

  // 마이페이지
  toefl_inProgress: { ko: "진행 중", en: "In progress" },
  toefl_nothingInProgress: { ko: "진행 중인 시험이 없습니다.", en: "Nothing in progress." },
  toefl_discard: { ko: "폐기", en: "Discard" },
  toefl_discarding: { ko: "폐기하는 중…", en: "Discarding…" },
  toefl_resume: { ko: "이어하기 →", en: "Resume →" },
  toefl_pastAttempts: { ko: "지난 응시 기록", en: "Past attempts" },
  toefl_noPastAttempts: { ko: "아직 지난 응시 기록이 없습니다.", en: "No past attempts yet." },
  toefl_viewReport: { ko: "리포트 보기 →", en: "View report →" },
  toefl_discardConfirm: {
    ko: "이 진행 중인 시험을 폐기할까요? 다시 이어할 수 없습니다.",
    en: "Discard this in-progress attempt? You won't be able to resume it.",
  },
  toefl_failedDiscard: { ko: "폐기하지 못했습니다: {message}", en: "Failed to discard: {message}" },
  toefl_startedOn: { ko: "{date}에 시작함", en: "Started {date}" },
  toefl_inProgressSuffix: { ko: "{section} 진행 중", en: "{section} in progress" },

  // 제출 직후(채점 대기) 화면
  toefl_submittedTitle: { ko: "시험이 제출되었습니다", en: "Your test has been submitted" },
  toefl_submittedDesc: {
    ko: "대부분의 점수는 바로 확인할 수 있습니다. AI 채점을 쓰는 Speaking·Writing 응답은 조금 더 걸릴 수 있어요 — 이 탭을 닫으셔도 됩니다. 나중에 확인해도 결과는 그대로 남아 있습니다.",
    en: "Most scores are ready right away. Speaking and Writing responses that use AI scoring can take a little longer — you can safely close this tab and check your report later; nothing will be lost.",
  },
  toefl_readingListening: { ko: "Reading & Listening", en: "Reading & Listening" },
  toefl_speakingWriting: { ko: "Speaking & Writing", en: "Speaking & Writing" },
  toefl_bandPrefix: { ko: "✓ 밴드 {band}", en: "✓ Band {band}" },
  toefl_bandLabel: { ko: "밴드 {band}", en: "Band {band}" },
  toefl_gradedCount: { ko: "{done} / {total} 채점 완료", en: "{done} / {total} graded" },
  toefl_itemN: { ko: "문항 {n}", en: "Item {n}" },
  toefl_statusGraded: { ko: "채점 완료", en: "Graded" },
  toefl_statusGrading: { ko: "채점 중…", en: "Grading…" },
  toefl_statusPendingManual: { ko: "수동 검토 대기", en: "Pending manual review" },
  toefl_gradingInProgress: { ko: "채점 진행 중…", en: "Grading in progress…" },
  toefl_continueToReport: { ko: "리포트 보러 가기 →", en: "Continue to your report →" },
  toefl_someManualReview: {
    ko: "일부 문항은 선생님이 직접 채점 중입니다 — 준비되는 대로 리포트에 반영됩니다.",
    en: "Some responses are being reviewed by a teacher — your report will update once that's done.",
  },
  toefl_viewLaterFromMyPage: { ko: "마이페이지에서 나중에 확인하기", en: "View later from My Page" },
  toefl_attemptNotFound: { ko: "응시 기록을 찾을 수 없습니다.", en: "Attempt not found." },

  // 종합 리포트
  toefl_reportTitle: { ko: "TOEFL 리포트", en: "TOEFL Report" },
  toefl_reportIncomplete: {
    ko: "아직 모든 영역이 끝나지 않았습니다 — 이 리포트는 완료된 영역만 반영합니다.",
    en: "Not every section is finished yet — this report only reflects completed sections.",
  },
  toefl_tutorCtaTitle: { ko: "✨ 선생님 첨삭을 받아보시겠어요?", en: "✨ Want a teacher's eyes on this?" },
  toefl_tutorCtaDesc: {
    ko: "{count}개의 응답은 자동 채점을 넘어서는 전문가 피드백이 도움이 될 수 있습니다. 실제 TOEFL 튜터의 1:1 피드백을 받아보세요.",
    en: "{count} of your responses could use expert feedback beyond automated scoring. Get 1:1 feedback from a real TOEFL tutor.",
  },
  toefl_tutorCtaButton: { ko: "1:1 튜터 피드백 신청 →", en: "Request 1:1 tutor feedback →" },
  toefl_colSection: { ko: "영역", en: "Section" },
  toefl_colScaled: { ko: "영역점수 (0–30)", en: "Scaled (0–30)" },
  toefl_colBand: { ko: "밴드", en: "Band" },
  toefl_notTaken: { ko: "응시 안 함", en: "not taken" },
  toefl_provisional: { ko: "잠정", en: "provisional" },
  toefl_pendingManualBadge: { ko: "일부 문항 채점 대기 중", en: "some responses still under review" },
  toefl_overallBand: { ko: "종합 밴드", en: "Overall band" },
  toefl_totalScaled: { ko: "총점: {total} / {max}", en: "Total scaled: {total} / {max}" },
  toefl_adaptiveRouting: { ko: "적응형 라우팅", en: "Adaptive routing" },
  toefl_routeCapEasy: {
    ko: "Stage 1 점수에 따라 표준 난이도 Stage 2로 배정되었습니다. 이 경로는 밴드 4.0으로 상한이 있습니다.",
    en: "Your Stage 1 score routed you to the standard-difficulty Stage 2 set. Scores on this path are capped at band 4.0.",
  },
  toefl_routeCapHard: {
    ko: "Stage 1 점수에 따라 고난도 Stage 2로 배정되었습니다. 이 경로는 점수 상한이 없습니다.",
    en: "Your Stage 1 score routed you to the harder Stage 2 set. No score cap applies on this path.",
  },
  toefl_strong: { ko: "강점:", en: "Strong:" },
  toefl_needsWork: { ko: "보완 필요:", en: "Needs work:" },
  toefl_reviewEachQuestion: { ko: "문항별 리뷰 보기 →", en: "Review each question →" },

  // 문항별 리뷰
  toefl_questionReview: { ko: "문항별 리뷰", en: "Question Review" },
  toefl_reviewSubtitle: {
    ko: "모든 문항의 내 답, 정답, 해설을 확인하세요.",
    en: "Your answers, the correct answers, and explanations for every question.",
  },
  toefl_backToReport: { ko: "← 리포트로", en: "← Back to report" },
  toefl_failedLoadReview: { ko: "리뷰를 불러오지 못했습니다.", en: "Failed to load the review." },
  toefl_pendingReview: { ko: "🧑‍🏫 검토 대기 중", en: "🧑‍🏫 Pending review" },
  toefl_notAnswered: { ko: "미응답", en: "Not answered" },
  toefl_correct: { ko: "✓ 정답", en: "✓ Correct" },
  toefl_incorrect: { ko: "✗ 오답", en: "✗ Incorrect" },
  toefl_scored: { ko: "채점됨", en: "Scored" },
  toefl_explanationLabel: { ko: "해설", en: "Explanation" },
  toefl_originalSentence: { ko: "원문 문장", en: "Original sentence" },
  toefl_yourRecording: { ko: "내 녹음", en: "Your recording" },
  toefl_yourResponse: { ko: "내 답변", en: "Your response" },
  toefl_interviewQuestion: { ko: "인터뷰 질문", en: "Interview question" },
  toefl_target: { ko: "목표 문장:", en: "Target:" },
  toefl_whatWeHeard: { ko: "인식된 내용:", en: "What we heard:" },
  toefl_yourInsertionPoint: { ko: "내가 고른 위치:", en: "Your insertion point:" },
  toefl_correctLabel: { ko: "정답:", en: "Correct:" },
  toefl_correctPrefix: { ko: "정답:", en: "Correct:" },
  toefl_noAnswer: { ko: "(응답 없음)", en: "(no answer)" },
  toefl_stillPendingManual: {
    ko: "이 응답은 아직 수동 검토를 기다리고 있습니다.",
    en: "This response is still waiting on manual review.",
  },
  toefl_showTranscript: { ko: "스크립트 보기", en: "Show transcript" },
  toefl_addToReview: { ko: "+ 관련 단어 {count}개 복습에 추가", en: "+ Add {count} related word(s) to review queue" },
  toefl_addingToReview: { ko: "추가하는 중…", en: "Adding…" },
  toefl_addedToReview: { ko: "✓ 단어 {count}개 복습에 추가함", en: "✓ Added {count} word(s) to review" },
  toefl_addToReviewFailed: { ko: "추가하지 못했습니다 — 다시 시도해주세요.", en: "Couldn't add to review — please try again." },
  toefl_goToReviewQueue: { ko: "복습하러 가기 →", en: "Go to review queue →" },
  toefl_yourAnswerCorrect: { ko: "✓ 내 답 (정답)", en: "✓ Your answer (correct)" },
  toefl_correctAnswerMarker: { ko: "✓ 정답", en: "✓ Correct answer" },
  toefl_yourAnswerWrong: { ko: "✗ 내 답", en: "✗ Your answer" },
  toefl_audioUnavailable: { ko: "오디오를 사용할 수 없습니다.", en: "Audio unavailable." },

  // 문항 유형(리뷰 화면 전용 — 응시 화면 자체는 항상 영어 그대로)
  toefl_taskLabel_complete_the_words: { ko: "빈칸 채우기", en: "complete the words" },
  toefl_taskLabel_daily_life: { ko: "일상 독해", en: "daily life" },
  toefl_taskLabel_academic_passage: { ko: "학술 지문", en: "academic passage" },
  toefl_taskLabel_choose_a_response: { ko: "알맞은 응답 고르기", en: "choose a response" },
  toefl_taskLabel_conversation: { ko: "대화", en: "conversation" },
  toefl_taskLabel_announcement: { ko: "안내방송", en: "announcement" },
  toefl_taskLabel_academic_talk: { ko: "학술 강의", en: "academic talk" },
  toefl_taskLabel_listen_and_repeat: { ko: "듣고 따라 말하기", en: "listen and repeat" },
  toefl_taskLabel_take_an_interview: { ko: "인터뷰", en: "take an interview" },
  toefl_taskLabel_build_a_sentence: { ko: "문장 완성", en: "build a sentence" },
  toefl_taskLabel_write_an_email: { ko: "이메일 쓰기", en: "write an email" },
  toefl_taskLabel_academic_discussion: { ko: "학술 토론", en: "academic discussion" },

  // 루브릭 지표명(Writing/Speaking AI 채점, 고정 7종)
  toefl_metric_task_achievement: { ko: "과제 수행", en: "task achievement" },
  toefl_metric_coherence: { ko: "논리적 연결", en: "coherence" },
  toefl_metric_lexical_resource: { ko: "어휘력", en: "lexical resource" },
  toefl_metric_grammar: { ko: "문법", en: "grammar" },
  toefl_metric_delivery: { ko: "전달력", en: "delivery" },
  toefl_metric_language_use: { ko: "언어 사용", en: "language use" },
  toefl_metric_topic_development: { ko: "내용 전개", en: "topic development" },
} as const;

// 강좌 분류는 값이 4개로 정해져 있어서 화면에서 번역할 수 있다.
const CATEGORY_EN: Record<string, string> = {
  초등: "Elementary",
  중등: "Middle School",
  고등: "High School",
  IB: "IB",
};

export function categoryLabel(category: string, lang: Lang): string {
  return lang === "en" ? CATEGORY_EN[category] ?? category : category;
}

// DICT 값 안의 "{key}" 자리표시자를 채워 넣는다(TOEFL 화면들처럼 문항 수·날짜 등을 문구에
// 끼워 넣어야 하는 경우용 — 기존 DICT엔 이런 값 있는 문구가 없어서 여태 없었다).
export function interpolate(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), template);
}

export type DictKey = keyof typeof DICT;

type LangContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: DictKey) => string;
};

const LangContext = createContext<LangContextValue>({
  lang: "ko",
  setLang: () => {},
  t: (key) => DICT[key].ko,
});

export function LanguageProvider({
  children,
  initialLang = "ko",
}: {
  children: React.ReactNode;
  initialLang?: Lang;
}) {
  // 서버가 쿠키로 판단한 언어를 그대로 첫 값으로 받는다.
  // 서버 렌더와 클라이언트 첫 렌더가 같은 언어라 깜빡임이 없다.
  const [lang, setLangState] = useState<Lang>(initialLang);

  function setLang(next: Lang) {
    setLangState(next);
    // <html lang> 을 즉시 바꿔 영문/한글 폰트 전환이 바로 반영되게 한다.
    document.documentElement.lang = next;
    // 쿠키(서버가 읽음) + localStorage(안전망) 둘 다 저장.
    // 도메인을 지정해 pmedu4u.com/english.pmedu4u.com 두 사이트가 언어 설정을 공유한다.
    const domain = sharedCookieDomain();
    document.cookie = `lang=${next}; path=/; max-age=31536000; samesite=lax${domain ? `; domain=${domain}` : ""}`;
    window.localStorage.setItem("lang", next);
  }

  const t = (key: DictKey) => DICT[key][lang];

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
