# Claude Code 지시서 — PM EDU 학생 관리 모듈
> 이 문서를 `docs/student-management.md` 로 저장 후 Claude Code 에서 참조.
> 소규모 사설 학원 기준. 관리자(원장) 1인 + 학생 + 학부모(읽기 전용 링크)만 존재.
> 강사 다중 권한 / 수납 자동화 / 결재 라인 — 전부 없음. 만들지 말 것.

---

## 0. 컨텍스트
- 기존 PM EDU 플랫폼(Next.js 16 App Router, TypeScript strict, Tailwind, Supabase Tokyo, Vercel)에 모듈로 추가한다.
- 기존 문제은행(questions), 시험 엔진, 인증(auth.users)과 연동한다. 새로 만들지 않는다.
- 언어: UI·에러 메시지 한국어 기본. 학생 화면은 학생의 `primary_language` 에 따라 한/영 전환.
- 커리큘럼: 한국 중·고 / IGCSE 0607·0580 / A-Level 9709 / IB AA·AI HL·SL / CBSE / SAT / TOEFL.

## 1. 권한 (단순하게)

| 역할 | 접근 |
|---|---|
| admin (원장) | 전체 CRUD |
| student | 본인 데이터 조회 + 문제풀이/과제 제출 |
| parent | 로그인 없음. 서명된 토큰 링크로 자녀 리포트 조회만 |

- RLS: `admin 전체` / `student 본인(auth_user_id = auth.uid())` 두 정책이면 끝.
- 학부모용은 `/report/[token]` 공개 라우트 + 서버에서 토큰 검증. 계정 만들지 말 것.
- 관찰로그(student_notes)와 상담(consultations)은 admin 전용. 학생·학부모 쿼리에서 제외.

## 2. 데이터 (핵심 테이블 12개만)

`supabase/migrations/` 에 아래만 생성. 기존 schema.sql 초안에서 **제외**: guardians 분리 테이블(학생 테이블에 보호자 2명 인라인), classes/lessons 분리(단순 lessons 로 통합), tuition/payments(미납 플래그 1개로 대체), notification_logs(추후).

```
students            학생 (보호자명·연락처·카톡여부 인라인 컬럼 포함,
                     status, curriculum, 목표시험일, 미납 플래그 unpaid boolean)
lessons             수업 회차 (날짜, 시간, 커리큘럼, 주제, 취소여부)
lesson_students     수업-학생 배정 (반 개념 대신 회차별 배정 — 소규모에 유리)
attendance          출결 (present/late/absent_excused/absent_unexcused/makeup, 지각분, 사유)
curriculum_units    단원 (기존 커리큘럼 체크리스트 데이터 이관)
assignments         과제 (unit_id, due_at)
assignment_submissions  제출 (status, submitted_at, completeness, score)
question_attempts   문항 풀이 ★ (question_id, unit_id, difficulty 1~4, attempt_no,
                     is_correct, elapsed_seconds, error_category, created_at)
                     error_category: concept/calculation/interpretation/time
assessments         시험 (kind: internal/school/mock/official, exam_date, max_score)
assessment_results  시험 결과 (raw_score, grade_label, unit_breakdown jsonb)
student_notes       수업 후 관찰 로그 (focus 1~5, understanding 1~5, stuck_point, next_plan)
consultations       상담 (held_at, summary, next_due_on)
```

인덱스 필수: `question_attempts(student_id, created_at desc)`, `(student_id, unit_id)`, `attendance(student_id)`.

## 3. 통계 — 이 공식 그대로, 임의 변경 금지

통계는 전부 SQL View 로 만들고 프론트에서 재계산하지 않는다. 기간 기본값 28일.

### 3.1 개별 학생 View

```sql
v_student_core   -- 학생 목록·상세 공용, 학생당 1행
  출석률        = (출석+지각) / 예정수업 × 100          -- 경보 < 85
  제출률        = 제출 / 배정 × 100                     -- 경보 < 80
  최초시도정답률 = attempt_no=1 정답 / attempt_no=1 시도  -- 실력 지표. 전체 정답률과 분리
  성장Δ        = 최근28일 정답률 − 직전28일 정답률
  리스크        = 25×출석하락 + 25×제출하락 + 25×성장음수 + 25×14일무활동 (0~100)
                 -- 55 이상이면 목록 상단 고정
v_student_units  -- 단원별: 정답률, 시도수, 오답수 → 레이더/취약 Top5
v_student_errors -- 오답 유형 4분류 비율 → 도넛
v_student_exams  -- 시험 회차별 점수 추이
```

### 3.2 전체 View

```sql
v_monthly        -- 월별: 재원생, 신규, 퇴원, 순증, 평균 출석률/제출률/정답률
v_unit_weakness  -- 전 학생 단원 취약도 = (100−정답률) × ln(시도수+1),
                 -- 시도 20건 미만 제외 → 콘텐츠 제작 우선순위
v_risk_list      -- 리스크 55+ 학생 목록 (이름, 점수, 주원인)
```

- 전체 통계용 일별 스냅샷 테이블 1개: `daily_stats(stat_date, students_active, attempts, correct, attended, planned, submitted, due)`. pg_cron 새벽 3시 KST(UTC 18시) upsert. 이것 하나로 월별 추이 복원.
- 코호트 리텐션, 강사 성과, ARPU, 유입 퍼널 — **만들지 않는다** (학생 수 적어 무의미).

## 4. 화면 (5개만)

```
/admin/students            목록: 검색 + status/curriculum 필터,
                           컬럼 [이름·커리큘럼·출석률·제출률·정답률·성장Δ·리스크],
                           기본 정렬 리스크 내림차순, 리스크 55+ 행 배경 강조
/admin/students/[id]       상세: 탭 [개요|출결|과제|풀이|시험|상담]
                           개요 = KPI 5칸 + 단원 레이더 + 8주 추이선 + 오답 도넛 + 취약 Top5
/admin/attendance          오늘 수업 학생 일괄 체크 (기본값 '출석', 예외만 변경, 저장 1클릭)
/admin/dashboard           전체: 월별 추이, 단원 취약도 Top10, 리스크 목록, 미납 학생
/report/[token]            학부모 뷰 (읽기 전용): 출결 요약, 제출률, 성적 추이, 코멘트
                           — 리스크 점수·타 학생 비교는 절대 비노출
```

학생 마이페이지는 기존 학생 대시보드에 진도율 게이지·취약 단원·오답노트 링크만 추가.

## 5. 구현 규칙

- 서버 컴포넌트 우선, 폼은 Server Actions, 입력 검증 zod, 에러 한국어.
- 목록 필터 상태는 URL 쿼리스트링 (`?status=active&curriculum=ib_aa_hl`).
- 차트는 recharts. 레이더(단원), 선(추이), 도넛(오답), 바(취약 단원).
- `supabase gen types` 로 타입 생성 후 커밋. any 금지.
- 통계 쿼리는 반드시 View 를 select. 컴포넌트 안에서 집계 SQL 작성 금지.
- 커밋은 기능 단위. 각 단계 끝에 마이그레이션 + 시드 데이터로 스크린샷 가능한 상태 유지.

## 6. 빌드 순서

| 단계 | 범위 | 완료 기준 |
|---|---|---|
| P0 | 마이그레이션 + RLS + 시드(학생 5명, 수업 20회, 풀이 500건) | 타입 생성 통과 |
| P1 | 학생 CRUD + 목록 + 상세 골격 | 목록에서 v_student_core 값 표시 |
| P2 | 출결 일괄 체크 + 출결 통계 | 30초 안에 하루 출결 입력 가능 |
| P3 | 과제 배정·제출 + question_attempts 연동 | 기존 문제은행에서 과제 생성 |
| P4 | 통계 View 전체 + 상세 개요 탭 차트 | 레이더·추이·도넛 렌더 |
| P5 | 전체 대시보드 + daily_stats cron | 월별 추이 표시 |
| P6 | 학부모 토큰 리포트 + 카카오톡 공유용 링크 | 토큰 만료 30일 |

P2 완료 시점부터 실운영 시작. P4가 이 모듈의 가치.

## 7. 하지 말 것

- 학부모 로그인 계정, 다중 강사 권한, 결재/승인 플로우
- 수납 모듈 (unpaid 플래그로 충분)
- 실시간 알림 인프라 (P6 카톡 링크 공유로 대체)
- 통계 수치의 프론트 재계산, 지표 공식 임의 변경
- 리스크 점수·상대 순위의 학생/학부모 노출

---

## PM EDU 실제 코드베이스 반영 조정 (2026-08-16 세션에서 확정)

이 프로젝트는 위 지시서가 가정한 것보다 이미 더 정교한 시스템이 있어, 아래처럼 조정해서 진행한다. 자세한 배경은 세션 대화 참고, 여기는 결론만.

- **보호자**: 지시서는 인라인 컬럼을 원했지만, 이미 지난 세션에 만든 `guardians`+`student_guardians` 분리 테이블을 그대로 유지(재혼가정 등 보호자 2명 제한 없이 대응 가능해서 더 나음).
- **권한**: 지시서의 admin/student 2단계 대신, 이 프로젝트에 이미 있는 owner/admin/teacher/assistant/student 5단계(`is_staff()`/`is_admin()`)를 그대로 씀. 절대 2단계로 되돌리지 않는다.
- **학생 정체성**: 새 `students` 테이블 안 만듦 — `profiles`가 이미 그 역할(role/class_id/grade_level/unpaid 등 계속 여기 추가).
- **수업 회차**: `lessons`란 이름은 기존 강좌 동영상 강의 테이블과 겹쳐서 `class_sessions`로 개명. 반(`classes`)은 없애지 않고 `class_sessions.class_id`로 선택적 연결.
- **과제**: `assignments`/`assignment_submissions` 새로 안 만들고 기존 `worksheets`/`worksheet_assignments`/`problem_submissions` 재사용(`worksheets`에 `due_at`/`unit_id`만 추가).
- **`question_attempts`**: P0에서는 스키마만 생성. 기존 `worksheets/[id]` 제출 플로우가 `problem_submissions`에 upsert(히스토리 없음)하고 있어서, 실제로 여기 기록을 쌓는 연동은 P3에서 별도 작업.
- **`error_category`**: 지금은 매기지 않음(항상 null 허용) — 나중에 필요해지면 교사 수동 태깅 화면을 추가하기로 함.
- **`curriculum_units`**: 수학 전용(`src/lib/curriculum-topics.ts`의 기존 정적 데이터를 그대로 시드로 이관, 약 430개 항목). 영어는 기존 카테고리 체계를 그대로 씀.
- **RLS 패턴**: 이 프로젝트에 교사를 자기 반으로 좁히는 RLS 정책이 원래 없어서(`classes.sql`도 화면단 필터링), 새 테이블들도 `is_staff()` 전원 접근으로 통일.
- **P0 시드 데이터(학생 5명 등)는 생략**: `profiles.id`가 실제 `auth.users`에 연결돼 있어 가짜 인증계정을 실서비스 DB에 만드는 위험을 피함. 대신 스키마·RLS는 익명 REST 호출로 검증.
- **P4 View 8개(지시서엔 7개)**: `v_student_weekly_trend`를 추가함 — 지시서 §3.1에 없지만 "상세 개요=...+8주 추이선"을 채우려면 필요해서 만듦(주간 정답률 집계).
- **P4 View는 전부 `security_invoker = true`**: 뷰가 조회하는 사람의 RLS를 그대로 따르게 만들어서, 직원이 보면 전체 학생·학생 본인이 보면 자기 것만 자동으로 걸러진다. 별도 "공개용 뷰"를 안 만들어도 됨(TOEFL 서브시스템의 `toefl_item_public`과는 다른 방식 — 그쪽은 정의자 권한 뷰 + WHERE 필터).
- **`v_monthly`에서 퇴원/순증 뺌**: 지시서는 재원생·신규·퇴원·순증을 다 원했지만, `students` 대신 `profiles`를 재사용하기로 한 결정 때문에 "퇴원(withdrawn) 상태·날짜" 개념 자체가 없음. 지금은 월별 신규가입자 수 + 평균 출석·정답률만 제공. 나중에 퇴원 처리 개념이 생기면 추가.
- **`v_monthly`는 `daily_stats` 스냅샷을 안 쓰고 매번 원본 테이블에서 직접 집계**: 지시서는 "daily_stats(pg_cron으로 매일 채움)로 월별 추이를 복원"하는 설계였지만, 이 프로젝트엔 cron 인프라가 아예 없어서(P0에서 확인) 당장은 라이브 테이블 직접 집계로 대체 — 데이터량이 적어 성능 문제 없음. `daily_stats` 테이블 자체는 남겨뒀으니 나중에 정말 필요해지면(데이터량이 커지면) cron 연동으로 바꿀 수 있음.
- **리스크 점수 공식**: 지시서엔 "25×출석하락 + 25×제출하락 + 25×성장음수 + 25×14일무활동"이라고만 적혀 있어 "하락"을 이진값(0/1)으로 볼지 비례로 볼지 모호했음 — 출석률 84%와 20%가 똑같이 25점을 받는 게 부자연스러워서, 출석·제출 두 항목은 임계값(85%/80%) 대비 얼마나 못 미치는지 0~1로 비례 환산해서 25를 곱했고, 성장음수·14일무활동은 지시서 그대로 이진 플래그로 둠.
