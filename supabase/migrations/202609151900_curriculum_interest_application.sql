-- 홈페이지 트랙 → 서브메뉴(학년/과정) → 샘플자료 → "신청" 흐름으로 재설계(2026-09-15, 같은 날
-- 사용자 피드백 반영). 구독형 서비스는 즉석 진단테스트가 아니라 "신청 → 관리자 승인 → 마이페이지 →
-- (관리자가 배정하는) 실전시험/PDF" 흐름이어야 한다는 지적에 따름. 기존 student_curriculum_interest
-- (트랙 단위 "관심 등록")를 과정(curriculum_detail) 단위 "신청 + 승인 상태"로 확장한다.
--
-- 기존 프로덕션에 남아있던 트랙 단위 테스트 행(curriculum_detail 없음, 사용자 본인 테스트 클릭)은
-- 새 PK(student_id, curriculum_detail)로 바꾸기 전에 지운다 — 실제 학생 신청이 아니라 안전함.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.

alter table student_curriculum_interest
  add column if not exists curriculum_detail text,
  add column if not exists status text not null default 'pending';

delete from student_curriculum_interest where curriculum_detail is null;

alter table student_curriculum_interest
  drop constraint if exists student_curriculum_interest_status_check;
alter table student_curriculum_interest
  add constraint student_curriculum_interest_status_check check (status in ('pending', 'approved', 'rejected'));

alter table student_curriculum_interest
  alter column curriculum_detail set not null;

alter table student_curriculum_interest drop constraint if exists student_curriculum_interest_pkey;
alter table student_curriculum_interest add primary key (student_id, curriculum_detail);
