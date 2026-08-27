---
description: 기능 하나를 스펙+코드+SQL+타입+검증결과 한 파일로 묶어 외부 AI 교차검증용 팩을 만든다
---

# /review-pack — 교차검증 팩 생성

인자로 받은 기능명(`$ARGUMENTS`)에 대해 아래를 **순서대로** 수행한다. 중간에 판단이 필요하면
멈추지 말고 합리적으로 판단해 계속 진행하되, 무엇을 어떻게 판단했는지 최종 보고에 적는다.

## 0. 기능 맵

아래 표에서 `$ARGUMENTS`와 가장 가까운 행을 찾는다. 정확히 일치하는 이름이 없으면(예:
"녹음"이 아니라 "speaking"이라고 입력) 의미가 가장 가까운 행을 고르고, 후보가 둘 이상이면
전부 골라 합친다. 표에 없는 완전히 새로운 이름이면 src 전체에서 관련 파일을 직접 검색하고,
그 결과 이 표에 새 행으로 추가할 것을 최종 보고에 제안한다(표는 이 파일을 직접 Edit해서
갱신한다 — 다음 실행부터 재사용됨).

| 기능 | 스펙 문서 | 관련 src 파일/폴더 | 관련 SQL/스키마 | 타입 정의 |
|---|---|---|---|---|
| TOEFL 전체 개요 | `docs/toefl-spec.md`(SSOT, v2 draft는 미채택 참고용) | `src/lib/toefl/types.ts` | `supabase/migrations/2026081*` 전체, `supabase/check-migrations.sql` | `src/lib/toefl/types.ts` |
| 적응형 라우팅(routing) | `docs/toefl-spec.md` §8 | `src/lib/toefl/scoring/routing.ts`, `src/lib/toefl/server/modules.ts`, `src/lib/toefl/section-order.ts` | `supabase/migrations/202608151200_create_toefl_schema.sql`(toefl_module, toefl_form_blueprint), `202608191700_blueprint_real_2026_format.sql` | `src/lib/toefl/types.ts`(ToeflRoute, ToeflStage) |
| 채점(scoring, 자동+AI루브릭) | `docs/toefl-spec.md` §7, §12 | `src/lib/toefl/scoring/` 전체(score-item, aggregate, scale, round, ai-rubric, skill-tags), `src/lib/toefl/server/ai-grading.ts`, `src/lib/toefl/server/audio-grading.ts`, `src/lib/toefl/server/grade-response.ts` | `202608151202_seed_toefl_scale_conversion.sql`, `202608271200_toefl_scale_fix_and_cefr.sql`, `202608271300_toefl_ai_score_status.sql` | `src/lib/toefl/types.ts` |
| 녹음/음성(speaking, TTS, 오디오) | `docs/toefl-spec.md` §6(오디오 관련 유형), §10 | `src/components/toefl/useRecorder.ts`, `src/components/toefl/RecorderPanel.tsx`, `src/lib/toefl/recording-upload-queue.ts`, `src/lib/toefl/server/tts.ts`, `src/lib/toefl/server/wav.ts`, `src/lib/toefl/server/audio-grading.ts`, `src/components/toefl/AudioPlayer.tsx` | `202608151201_toefl_rls_and_storage.sql`(toefl-audio/toefl-recordings 버킷) | - |
| 문항 생성·검수(item generation) | `docs/toefl-spec.md` §9, §15(P6) | `src/lib/toefl/server/generators/` 전체, `src/lib/toefl/server/item-generation.ts`, `src/lib/toefl/task-catalog.ts`, `src/app/api/admin/toefl/items/`, `src/app/admin/toefl/items/page.tsx`, `src/app/admin/toefl/review/page.tsx`, `scripts/toefl-generate.ts`, `src/lib/llm-server.ts`, `src/lib/gemini-server.ts` | `202608191600_toefl_item_review_state.sql`, `202608191700_blueprint_real_2026_format.sql` | `src/lib/toefl/types.ts`(ToeflItem, ToeflTaskType) |
| 응시 흐름(attempt state machine) | `docs/toefl-spec.md` §11 | `src/app/api/toefl/attempts/` 전체, `src/app/toefl/test/[attemptId]/`, `src/app/toefl/check/page.tsx`, `src/app/admin/toefl/attempts/page.tsx` | `202608151200_create_toefl_schema.sql`(toefl_attempt, toefl_section_attempt), `202608181400_add_toefl_attempt_overall_scores.sql` | `src/lib/toefl/types.ts`(ToeflAttempt, ToeflSectionAttempt, ToeflAttemptStatus) |
| DB 스키마 전체 | `docs/toefl-spec.md` §4, §5 | `src/lib/toefl/types.ts` | `supabase/migrations/*.sql` 전체(14개), `supabase/check-migrations.sql`, `supabase/catch-up.sql` | `src/lib/toefl/types.ts` |
| 학생관리(출결·시험·문항이력) | `docs/student-management.md` | `src/lib/attendance.ts`, `src/lib/students.ts`, `src/lib/student-stats.ts`, `src/lib/classes.ts`, `src/lib/question-attempts.ts`, `src/app/admin/students/[id]/page.tsx`, `src/app/admin/attendance/page.tsx`, `src/app/admin/dashboard/page.tsx` | `supabase/attendance-and-exams.sql`, `supabase/student-management.sql`, `supabase/student-stats-views.sql`, `supabase/parent-report-tokens.sql` | - |
| 인증/권한 | `CLAUDE.md` [기존 사이트] | `src/lib/roles.ts`, `src/middleware.ts`, `src/lib/toefl/server/auth.ts`, `src/lib/toefl/admin-me.tsx` | `supabase/roles-tier.sql` | - |
| TOEFL 관리자 화면 전반 | `docs/toefl-admin.html`(디자인 목업, 코드 아님) | `src/app/admin/toefl/`, `src/components/toefl/admin/` | - | - |

## 1. 관련 파일 수집

찾은 행(들)의 "관련 src 파일/폴더" 중 폴더는 그 안의 `.ts`/`.tsx` 파일 전부(단 `*.test.ts`는
코드 검증용이 아니라 "테스트가 스펙을 어떻게 이해했는지" 보여주는 좋은 근거이므로 포함하되,
분량이 너무 크면 테스트 파일은 요약 없이 그대로 두고 대신 전체 300KB 한도를 우선한다), 파일은
그대로 목록에 넣는다.

그다음 아래 두 가지를 **항상 추가로** 찾아 목록에 더한다(2026-08-27 교차검증에서 리뷰어가
"이게 없어서 판단을 못 했다"고 지적한 것들 — 표에 없어도 매번 확인):

- **호출하는 route.ts** — 위에서 모은 `src/lib/**` 함수를 실제로 부르는 `src/app/api/**/route.ts`를
  `grep -rl`로 찾아 전부 포함한다. 순수함수만 보고 "이게 실제로 어떻게 쓰이는지"를 못 보면
  리뷰어가 잘못된 지적을 하게 된다(예: payload를 넘기는지 안 넘기는지는 호출부를 봐야 안다).
- **코드 주석이 인용하는 다른 파일** — 수집한 파일들의 주석에 다른 파일 경로가 언급되면
  (예: "toefl-subsystem-plan 메모 참고", "fsrs.ts와 같은 방식") 그 파일도 실제 코드 파일이면
  같이 포함한다(메모·문서 참조는 제외, 코드 파일만).

## 2. 마크다운 조립

다음 순서로 하나의 문자열을 만든다. 파일 내용을 붙일 때는 항상 그 앞에 `## FILE: <경로>` 헤더를
붙인다(스펙 발췌는 `## SPEC: <경로>#<섹션 제목>`).

1. **프로젝트 규칙** — `CLAUDE.md` 전체 원문을 `## 프로젝트 규칙 (CLAUDE.md)` 헤더 아래 그대로.
2. **스펙 발췌** — §6(과제 유형별 데이터 계약)과 §8(적응형 라우팅)은 **어떤 기능이든 항상 포함**한다
   (거의 모든 채점·문항·응시 로직이 이 두 절의 계약을 전제로 하는데, 빠지면 "이 코드가 계약을
   지키는지"를 리뷰어가 판단할 근거가 없다). 그 위에 표에서 찾은 문서에서 이 기능과 직접 관련된
   섹션을 추가로 발췌한다(문서 전체를 넣지 않는다 — 관련 여부가 애매하면 넉넉한 쪽으로 판단해
   포함). 섹션마다 각각 별도 `## SPEC:` 헤더.
3. **SQL/스키마** — 표에서 찾은 마이그레이션·SQL 파일 **전문**(발췌하지 않는다 — DDL 일부만
   보면 컬럼 제약·기본값·RLS 정책을 놓친다).
4. **타입 정의** — 표에서 찾은 타입 파일. 파일이 크고(300줄+) 이 기능과 무관한 타입이 대부분이면
   관련 타입 export만 발췌해도 된다(무엇을 뺐는지 파일 헤더 주석 한 줄로 남긴다).
5. **소스 코드** — 1단계에서 모은 src 파일(호출하는 route.ts·주석 인용 파일 포함) 전문, 발견 순서대로.

## 3. 시크릿·개인정보 제거 (반드시 마지막 조립 후 한 번 더 전체 스캔)

아래에 해당하면 그 파일 전체를 목록에서 빼거나(파일 자체가 `.env*`인 경우) 해당 줄만
`[REDACTED]`로 바꾼다:

- `.env`, `.env.local`, `.env.*` — 파일 자체를 절대 포함하지 않는다(내용을 읽지도 않는다).
- 아래 패턴을 포함하는 줄: `_KEY\s*=`, `_SECRET\s*=`, `service_role`, `sb_secret_`, `sb_publishable_`,
  `AIza`(Gemini 키 접두사), `Bearer [A-Za-z0-9._-]{20,}`, `eyJ[A-Za-z0-9._-]{20,}`(JWT).
- 시드/목업 데이터에 학생으로 보이는 실명·이메일이 하드코딩돼 있으면 값만 `[REDACTED]`(변수명·
  구조는 남긴다 — 리뷰어가 데이터 모양은 알아야 한다).

불확실하면 포함하지 말고 그 줄을 `[REDACTED — 수동 확인 필요]`로 표시한다. 이 규칙은 위
"관련 파일 수집"보다 우선한다 — 즉 관련 있어 보여도 시크릿이면 무조건 제외.

## 4. 검증 실행

프로젝트 루트에서 아래 세 명령을 순서대로 실행하고, 각 결과를 `## 검증 결과` 섹션에 붙인다:

```
npx tsc --noEmit
npx vitest run
npm run build
```

성공하면 "✅ 통과"만 적는다(전체 로그를 붙이지 않는다 — 팩이 불필요하게 커진다). `vitest run`은
성공해도 "✅ 통과 — N개 파일, M개 테스트"처럼 개수를 남긴다(리뷰어가 "테스트가 이 동작을
실제로 검증하는지"를 판단할 최소 근거). 실패하면 에러 메시지 부분만(성공한 파일 목록 등 소음은
제외) 붙인다 — vitest 실패는 어떤 `it(...)`가 깨졌는지 이름까지 남긴다.

## 5. 저장

- 오늘 날짜(로컬 시스템 날짜, `YYYYMMDD`)를 구해 파일명을 `review/<기능명>_<YYYYMMDD>.md`로 정한다.
  기능명에 공백이 있으면 밑줄로 바꾼다.
- `review/` 폴더가 없으면 만든다.
- 파일 맨 위에 아래를 넣는다(그 다음에 위 1~4에서 조립한 내용이 이어진다):
  ```
  # <기능명> 교차검증 팩 (<YYYY-MM-DD>)

  ## 포함 파일
  - (경로 목록, 한 줄에 하나)

  ## 총 줄 수
  <숫자>줄
  ```
- **300KB 초과 시**: 저장하지 않는다. 대신 이 기능을 무엇 기준으로 나누면 되는지(예: "reading과
  listening을 나눠서 `/review-pack reading`, `/review-pack listening`으로 각각 실행하세요")
  구체적으로 안내하고 끝낸다.

## 6. 완료 보고

다음을 사용자에게 보고한다: 저장된 파일 경로, 파일 크기(KB), 포함된 파일 개수, 총 줄 수,
검증 결과(통과/실패), 그리고 0단계에서 표에 없는 이름을 새로 판단했다면 그 판단 내용.
