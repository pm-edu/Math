-- 목적: RUN_SIGNUP.md S1 — 가입 화면 강화에 필요한 컬럼 추가 + authenticated GRANT 재조정.
-- 기존 마이그레이션 파일(profiles.sql, roles-tier.sql)은 건드리지 않는다 — 여기서는
-- alter table add column / revoke·grant만 쓴다. handle_new_user() 트리거는 이번엔 안 건드린다
-- (RUN_SIGNUP.md "이번 지시에서 만들지 않을 것" — 동의 시각은 서버 라우트가 service_role로
-- 직접 기록한다. src/app/api/auth/complete-signup/route.ts 참고).
--
-- 되돌리는 법:
--   alter table profiles drop column if exists phone, drop column if exists curriculum_group,
--     drop column if exists terms_agreed_at, drop column if exists privacy_agreed_at;
--   revoke update on profiles from authenticated;
--   grant update (name, email) on profiles to authenticated;
--
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.

alter table profiles add column if not exists phone text;
alter table profiles add column if not exists curriculum_group text;
alter table profiles add column if not exists terms_agreed_at timestamptz;
alter table profiles add column if not exists privacy_agreed_at timestamptz;

alter table profiles drop constraint if exists profiles_curriculum_group_check;
alter table profiles add constraint profiles_curriculum_group_check
  check (curriculum_group is null or curriculum_group in ('KR', 'IB', 'IGCSE', 'CBSE', 'AS_A_Level'));

-- authenticated가 새 안전 컬럼(name/email/phone/curriculum_group)만 고칠 수 있게 전체를
-- 다시 정의한다(누적 GRANT 대신 revoke+grant로 허용 컬럼 목록을 한 번에 명시) —
-- role, grade_level, terms_agreed_at, privacy_agreed_at, unpaid 등은 여기 없으므로
-- authenticated는 여전히 못 건드린다(S0에서 role이 이미 막혀있음을 실전 테스트로 확인함).
revoke update on profiles from authenticated;
grant update (name, email, phone, curriculum_group) on profiles to authenticated;
