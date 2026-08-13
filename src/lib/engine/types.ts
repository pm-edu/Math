// 영어 단어 완전학습 엔진의 공용 타입.
// 이 파일과 engine/ 아래 다른 파일들은 전부 순수 함수(입력→출력, 부수효과 없음)로만 구성한다.
// UI·Supabase 호출은 여기 들어오지 않는다. (Stage 2에서 로직 구현, 지금은 뼈대만)

// 숙련도 5단계 사다리. 0=미학습.
export type MasteryLevel = 0 | 1 | 2 | 3 | 4 | 5;

// 문항 유형 10종 (스펙 [D] 참고)
export type ItemType =
  | "EN_KO_MC" // 영→한 4지선다 (Lv1)
  | "AUDIO_MC" // 음성 듣고 뜻 고르기 (Lv1)
  | "KO_EN_TYPE" // 뜻 보고 영어 타이핑 (Lv2)
  | "DICTATION" // 음성 듣고 철자 쓰기 (Lv2)
  | "CLOZE" // 문맥 빈칸 채우기 (Lv3)
  | "COLLOCATION" // 연어 짝 맞추기 (Lv3)
  | "SENTENCE_WRITE" // 문장 작성, AI 루브릭 채점 (Lv3)
  | "SPEED_ROUND" // 속도 라운드 (Lv4, MVP 이후)
  | "SHADOWING" // 발음 셰도잉, 채점 없는 연습 (Lv4, MVP 이후)
  | "CONTRAST"; // 혼동쌍 대조 문항 (전 레벨)

// FSRS 등급. 학생이 스스로 매기지 않고 채점 결과+반응시간에서 자동 산출한다.
export type FsrsRating = "again" | "hard" | "good" | "easy";

export type GradeResult = {
  isCorrect: boolean;
  rating: FsrsRating;
  // 채점 세부 정보(선택한 오답, 채점 근거 등)는 유형별로 다르므로 unknown으로 열어둔다.
  detail?: unknown;
};

// TODO(Stage 2): FSRS 스케줄러 상태(stability, difficulty, due_at)와
// 순수 함수 스케줄 계산기를 여기 또는 fsrs.ts 에 정의한다.
