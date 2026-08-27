# 스크린샷 가이드

`review/screens_20260827.md`(화면 인벤토리)에서 우선순위 순으로 뽑은 10개다. 학생 핵심 흐름
(가입 → 시험 시작 → 각 과제 유형 1개 → 제출 → 리포트)과 관리자 핵심 흐름(학생 목록 → 채점 큐
→ 재채점 → 리포트 확인)을 각각 커버한다. 경로는 Vercel Preview 배포 기준(`https://<preview-url>`
뒤에 그대로 붙이면 된다).

## 학생 핵심 흐름

1. **가입** — `/signup`
2. **시험 시작(폼/유형 선택)** — `/toefl/start`
3. **과제 유형 1개 — Reading 응시 화면** — `/toefl/test/[attemptId]/reading`
   (실제 attemptId는 `/toefl/start`에서 응시를 한 번 시작해야 생김 — 로그인 후 직접 시작)
4. **과제 유형 1개 — Speaking 응시 화면(자동 녹음)** — `/toefl/test/[attemptId]/speaking`
5. **제출** — `/toefl/attempt/[attemptId]/submitted`
6. **리포트** — `/toefl/report/[attemptId]`

## 관리자 핵심 흐름

7. **학생 목록** — `/admin/toefl/students`
8. **채점 큐** — `/admin/toefl/grading-queue`
9. **재채점** — `/admin/toefl/grading-queue`에서 개별 항목의 "재시도" 실행 후 상태 변화
   (별도 URL 없음 — 같은 화면에서 액션 전/후를 찍는다)
10. **리포트 확인(관리자 관점)** — `/admin/toefl/attempts` (학생별 attempt 상태에서 리포트로 진입)

## 참고

- attemptId·studentId가 들어가는 경로는 로그인 후 실제 데이터로 한 번 진행해야 URL이 생긴다 —
  값을 미리 알 수 없으니 직접 진행하면서 그때그때의 URL을 쓸 것.
- `/toefl/test/**`와 `/toefl/sample`은 스펙상 언어 토글이 없고 항상 영어로 고정된 화면이다 —
  스크린샷에 한글이 하나도 없어도 버그가 아니다.
