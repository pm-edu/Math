# RUN_SIGNUP.md 실행 결과 — 최종 CHECKPOINT 보고

날짜: 2026-09-15
저장소: `C:\GitHub\Math`

## 마이그레이션 실행 필요

이 프로젝트는 Supabase SQL Editor에 직접 붙여넣어 실행하는 방식이라, 아래 두 파일을
**SQL Editor에 순서대로 실행**해야 이번 변경이 완전히 동작합니다.

```
supabase/migrations/202609151500_signup_hardening.sql
supabase/migrations/202609151600_student_programs_interested_status.sql
```

## S0 — 라이브 DB 보안 재확인

지시된 SQL 3개(`information_schema.column_privileges` 등)는 실행할 수 없었습니다 —
Supabase REST API(PostgREST)가 `information_schema` 스키마 자체를 노출하지 않습니다
(`PGRST106: Only the following schemas are exposed: public, graphql_public`). `exec_sql` 같은
raw SQL RPC도 없고, 직접 Postgres 커넥션도 없습니다.

대신 더 확실한 방법으로 검증했습니다 — 실제 학생 계정(`test-new@test.pmedu4u.internal`,
role=student)으로 로그인해서, service_role이 아닌 진짜 authenticated 권한 그대로 본인 role을
admin으로 바꿔보는 실전 테스트를 했습니다.

```
학생 본인이 자기 role을 'admin'으로 UPDATE 시도
→ 거부됨: code 42501 "permission denied for table profiles"
   (RLS가 아니라 GRANT 단계에서 컷 — roles-tier.sql:75-76의 컬럼 제한이 실제로 살아있음)

set_user_role RPC를 학생 권한으로 호출 시도
→ 거부됨: "역할을 바꿀 권한이 없습니다." (roles-tier.sql:88-90 그대로)

두 시도 모두 실행 후 재조회 → role은 여전히 'student' (변경 안 됨)
```

| 항목 | 결과 | 상태 |
|---|---|---|
| role 컬럼 authenticated UPDATE 가능 여부 | no — 42501 permission denied로 즉시 차단됨 | 🟢 정상 |
| 위험 시 좁히는 마이그레이션 적용 | 해당없음(위험 아님) | — |
| set_user_role 존재 | yes — 존재하고 권한 검사도 정상 작동 | 🟢 정상 |

**판정: 🟢 정상.** roles-tier.sql이 라이브 DB에 순서대로 반영돼 있고, 학생이 자기 role을
올릴 수 있는 경로는 실제로 없습니다.

## 최종 CHECKPOINT — 번호별 완료/미완료/보류 표

| 항목 | 파일 경로 | 확인 방법 / 결과 | 상태 |
|---|---|---|---|
| S0 라이브 권한 확인 | — | 실제 학생 계정으로 role=admin UPDATE 시도 → 42501 permission denied 거부 확인 (SQL 메타데이터 조회는 PostgREST가 information_schema 자체를 막아 대신 실전 테스트로 검증) | 완료 (🟢) |
| S0 위험 시 마이그레이션 | — | 위험 아님 — 해당 없음 | 해당없음 |
| S1 컬럼 추가 | `supabase/migrations/202609151500_signup_hardening.sql` | 마이그레이션 파일 작성 완료. DB 미반영 — SQL Editor 실행 후 `select phone, curriculum_group, terms_agreed_at, privacy_agreed_at from profiles limit 1;`로 확인 필요 | 미완료 (파일만 준비, DB 반영 대기) |
| S1 GRANT 재조정 | 동 파일 | `revoke update on profiles from authenticated; grant update (name, email, phone, curriculum_group) ...`로 작성 — terms_agreed_at/privacy_agreed_at은 GRANT 목록에서 제외해 클라이언트가 못 씀. DB 미반영, 실행 후 S0와 같은 방식(학생 계정으로 직접 UPDATE 시도)으로 재검증 권장 | 미완료 (파일만 준비, DB 반영 대기) |
| S2 필수 필드 | `src/app/signup/page.tsx` | 브라우저로 실제 렌더링 확인 — 이름/이메일/비밀번호/비밀번호확인/전화번호/커리큘럼 6개 필드 전부 존재, 스크린샷으로 확인함 | 완료 |
| S2 비밀번호 8자+복잡도 | 동 파일 `isPasswordValid()` | 코드로 확인: `pw.length>=8 && /[A-Za-z]/.test && /[0-9]/.test`, 제출 시 검사. 실제 "7자·숫자없음 입력→거부" 클릭 테스트는 이번엔 안 함(로직 검토로 갈음) | 완료 (로직 검증, 실클릭 테스트 미실시) |
| S2 동의 체크박스+시각기록 | `src/app/signup/page.tsx`, `src/app/api/auth/complete-signup/route.ts` | 브라우저 테스트: 체크 전 "회원가입" 버튼 비활성(회색) → 둘 다 체크 시 활성(진한 핑크) 확인함(스크린샷). 시각 기록은 서버 라우트(service_role)가 하도록 만들었고, handle_new_user 트리거는 이번에 안 건드림(지시대로). 단 실제 DB 기록은 S1 미반영 상태라 이번엔 end-to-end 실가입 테스트 못 함 | 부분완료 (UI 검증 완료 / DB 기록은 S1 반영 후 확인 필요) |
| S2 role 서버 고정 | `src/app/signup/page.tsx` | signUp() options.data에 name만 보냄, role 자체를 아예 안 보냄. handle_new_user도 이번에 안 건드려서 role은 항상 컬럼 기본값 'student'. S0에서 이미 이 방어선(GRANT+RLS)이 라이브에서 작동함을 실증함 | 완료 |
| S2 미성년 문구 | `src/app/signup/page.tsx` | 조건부 아님 — 항상 노출로 변경. 지시서의 "학년으로 판단"이 성립하려면 학년 필드가 있어야 하는데, 이번 S2 필수 필드 목록엔 학년이 빠져 있어(비밀번호 확인으로 대체됨) 나이를 추정할 신호 자체가 없습니다. 그래서 조건부가 아니라 상시 노출 문구로 처리했습니다 — 스크린샷으로 노출 확인함 | 부분완료 (문구는 노출되나 "조건부 판단"은 데이터 부재로 불가능해 상시노출로 대체) |
| S3 미인증 로그인 처리 | `src/app/login/page.tsx` | 코드 작성 완료: `error.code === "email_not_confirmed"` 감지 시 안내 화면(제목+설명+재발송 버튼) 렌더링, `supabase.auth.resend({type:"signup"})` 연결. 실제 미인증 계정으로 로그인 시도해서 이 화면이 뜨는 걸 라이브로 재현하진 않음(테스트 계정이 이미 인증된 상태라 이 경로를 못 밟음) | 부분완료 (코드·타입 검증 완료 / 실제 미인증 계정 재현 테스트 미실시) |
| S3 대시보드 확인 안내 | — | 직접 안내: Supabase 대시보드 → Authentication → Sign In / Providers → Email 항목에서 "Confirm email" 토글이 켜져 있는지 확인해주세요. 코드(auth-errors.ts의 email_not_confirmed 매핑)는 켜져 있다는 강한 정황이지만 코드로 100% 확정은 못 합니다 | 완료 (안내 출력함) |
| S4 온보딩 과목 선택 | `src/app/onboarding/subjects/page.tsx` | 경로 변경: `/study/onboarding`은 이미 수학 진단·배치 기능이 쓰고 있는 기존 라이브 경로라(`src/app/study/onboarding/page.tsx`, `src/app/study/page.tsx`에서 링크됨) 거기 덮어쓰면 그 기능이 깨집니다. 그래서 `/onboarding/subjects`로 새로 만들었습니다(S0 보고 때 미리 알려드림). 브라우저로 카드 3장 렌더링, 토글 선택, "선택 완료" 버튼까지 확인함 | 완료 (단, 경로가 지시서와 다름 — 위 사유로 의도적 변경) |
| S4 서버 라우트 | `src/app/api/study/programs/route.ts` | Bearer 토큰으로 본인 확인 후 service_role로 student_id=본인에만 upsert(ignoreDuplicates:true로 기존 active 등급 덮어쓰기 방지). 코드·타입 검증 완료. 실제 DB 쓰기는 S1/S4용 두 마이그레이션이 반영돼야 가능(student_programs.status에 'interested'가 아직 허용 안 됨) — 이번엔 실가입 없이 테스트 계정으로만 확인해 실제 upsert까지는 못 돌려봄 | 부분완료 (코드 완료 / DB 반영 후 실동작 확인 필요) |
| S4 RLS 불변 | `supabase/migrations/202609151600_...sql` | student_programs에 새 RLS 정책을 추가하지 않았음 — status 체크 제약만 넓힘('interested' 추가). 기존 "staff manage programs"(전체) / "own programs"(학생 select만) 정책 그대로 유지됨을 마이그레이션 파일 diff로 확인 | 완료 |
| S4 접근 분리 | — | 콘텐츠를 실제로 막지는 않았습니다. entitlement_grants의 hasEntitlement()는 지시서의 "결제 연동 이번엔 안 한다"에 따라 손대지 않았고(지금도 항상 true 반환, 전면 허용 유지), 이걸 실제로 뒤집으면 지금 쓰고 있는 모든 기존 학생이 즉시 콘텐츠를 못 보게 되는 라이브 사고라 판단해 하지 않았습니다. 대신 온보딩 완료 화면에 "정식 수강 신청은 학원에 문의해주세요" 안내만 넣었습니다(과목 랜딩 페이지 자체는 손대지 않음) | 보류 (지시서 자체의 "결제 연동 배제" 조건과 상충 — 콘텐츠 차단은 구현 안 함, 문구만 온보딩 완료화면에 한정 구현) |

## 결론

S0(보안)는 라이브에서 이미 안전한 상태였고, S1~S4 코드는 전부 작성·타입체크·린트·화면
렌더링까지 확인했습니다. 다만

1. 두 마이그레이션을 SQL Editor에서 실행하기 전까지는 실제 가입 흐름이 끝까지 안 됩니다
   (complete-signup 라우트가 없는 컬럼에 쓰려다 실패).
2. 접근 분리(S4 마지막 줄)는 지시서의 "결제 연동 배제" 조건과 정면으로 부딪혀서 의도적으로
   콘텐츠 차단 없이 안내 문구로만 구현했습니다.

이 두 가지가 이번 라운드의 핵심 미완료/보류 지점입니다.

## 변경된 파일 목록

```
M  src/app/login/page.tsx
M  src/app/signup/page.tsx
M  src/lib/i18n.tsx
A  src/app/api/auth/complete-signup/route.ts
A  src/app/api/study/programs/route.ts
A  src/app/onboarding/subjects/page.tsx
A  src/app/privacy/page.tsx
A  src/app/terms/page.tsx
A  supabase/migrations/202609151500_signup_hardening.sql
A  supabase/migrations/202609151600_student_programs_interested_status.sql
```
