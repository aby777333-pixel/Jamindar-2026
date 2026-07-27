-- 0031 — Add 'completed' to project_phase. The Home "Projects" row becomes
-- four tiles: Completed · Current · Ongoing · Future. Purely additive; all
-- existing rows keep their phase.
alter type public.project_phase add value if not exists 'completed' before 'ongoing';
