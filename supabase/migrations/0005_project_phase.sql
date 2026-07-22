-- Project phase for the land-marketplace home Quick Actions (Ongoing / Current / Future).
-- Additive: new enum + nullable-with-default column on properties. No changes to existing logic.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'project_phase') then
    create type project_phase as enum ('ongoing', 'current', 'future');
  end if;
end$$;

alter table properties
  add column if not exists project_phase project_phase not null default 'current';

-- Backfill the seed catalogue so each phase surfaces at least one project.
update properties set project_phase = 'ongoing' where slug in ('jamin-lake-view', 'jamin-metro-heights');
update properties set project_phase = 'future'  where slug = 'jamin-farm-retreat';
update properties set project_phase = 'current' where slug = 'jamin-green-meadows';
