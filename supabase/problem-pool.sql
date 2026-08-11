-- 문제 저장소(풀) 구체화: 텍스트 본문 + 출처 + 검수 여부
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다.

-- 문제 본문을 텍스트(LaTeX 포함)로도 담는다. 이미지만 있으면 비워둔다.
alter table problems add column if not exists content_text text;
alter table problems add column if not exists solution_text text;

-- 이 문제가 어디서 왔는지 (손입력 / PDF추출 / AI생성)
alter table problems add column if not exists source text not null default 'manual';
alter table problems add column if not exists source_ref text; -- 원본 PDF 파일명·페이지 등

-- 사람이 검수했는지. AI/PDF로 들어온 문제는 검수 전까지 학생에게 노출하지 않는다.
-- 손으로 직접 넣은 기존 문제는 이미 믿을 수 있으므로 true 로 둔다.
alter table problems add column if not exists verified boolean not null default true;

-- 앞으로 들어오는 PDF/AI 추출 문제는 코드에서 verified=false 로 저장한다.
-- (이 기본값 true 는 '손입력' 기준이고, 추출 코드가 명시적으로 false 를 넣는다)

-- 검수 화면에서 "검수 안 된 것만" 빨리 찾기 위한 인덱스
create index if not exists problems_verified_idx on problems (verified, source);

-- 학생에게 문제를 보여주는 정책에 "검수된 것만" 조건을 더한다.
-- 기존 정책을 검수 조건 포함으로 교체한다.
drop policy if exists "students view assigned problems" on problems;
create policy "students view assigned problems" on problems
  for select using (
    verified = true
    and exists (
      select 1
      from worksheet_problems wp
      join worksheet_assignments wa on wa.worksheet_id = wp.worksheet_id
      where wp.problem_id = problems.id
        and wa.user_id = auth.uid()
    )
  );

-- 관리자는 검수 여부와 상관없이 전부 본다 (검수하려면 봐야 하므로)
-- 기존 "admins manage problems" 정책(for all)이 이미 관리자 전체 접근을 허용한다.
