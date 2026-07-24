-- 0018_property_submissions.sql
-- Promoter Module — Lead Capture (promoter-submitted off-market properties).
--
-- Additive & non-breaking. A promoter submits a property → it enters the admin
-- approval workflow (submitted → under_review → info_required → approved /
-- rejected). Promoters see only their own submissions; the admin sees all and
-- moves the status via a SECURITY DEFINER RPC. A dedicated public 'submissions'
-- storage bucket holds the uploaded photos (each user writes only their own
-- folder). Explicit GRANTs (public-schema auto-grant is being removed).

create table if not exists public.property_submissions(
  id                   uuid primary key default gen_random_uuid(),
  promoter_id          uuid not null references public.profiles(id) on delete cascade,
  title                text,
  property_type        text,
  description          text,
  price                numeric(14,2),
  area_value           numeric(12,2),
  area_unit            text,
  address              text,
  locality             text,
  city                 text,
  district             text,
  state                text,
  pincode              text,
  lat                  double precision,
  lng                  double precision,
  gmaps_url            text,
  street_view_url      text,
  images               text[] not null default '{}',
  videos               text[] not null default '{}',
  documents            jsonb  not null default '[]'::jsonb,
  voice_note           text,
  seller_name          text,
  seller_phone         text,
  seller_notes         text,
  notes                text,
  status               text not null default 'submitted'
                         check (status in ('submitted','under_review','info_required','approved','rejected')),
  review_reason        text,
  reviewed_by          uuid references public.profiles(id),
  reviewed_at          timestamptz,
  approved_property_id uuid references public.properties(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists property_submissions_promoter_idx on public.property_submissions(promoter_id);
create index if not exists property_submissions_status_idx   on public.property_submissions(status);

alter table public.property_submissions enable row level security;
grant select, insert, update on public.property_submissions to authenticated;

drop policy if exists ps_read on public.property_submissions;
create policy ps_read on public.property_submissions for select to authenticated
  using (promoter_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

drop policy if exists ps_insert on public.property_submissions;
create policy ps_insert on public.property_submissions for insert to authenticated
  with check (promoter_id = auth.uid());

-- promoter may edit their own submission only while it is editable; a trigger
-- forces it back into the review queue (so admin updates aren't affected).
drop policy if exists ps_update_own on public.property_submissions;
create policy ps_update_own on public.property_submissions for update to authenticated
  using (promoter_id = auth.uid() and status in ('submitted','info_required'))
  with check (promoter_id = auth.uid());

create or replace function public.ps_touch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() = new.promoter_id then
    -- a promoter edit is a resubmit → re-enter the queue, clear prior review
    new.status := 'submitted';
    new.review_reason := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists ps_touch_trg on public.property_submissions;
create trigger ps_touch_trg before update on public.property_submissions
  for each row execute function public.ps_touch();

-- Admin: move a submission through the workflow + notify the promoter.
create or replace function public.admin_review_submission(p_id uuid, p_decision text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_prom uuid;
begin
  if not exists (select 1 from public.profiles where id = v_uid and role = 'super_admin') then raise exception 'not authorized'; end if;
  if p_decision not in ('under_review','info_required','approved','rejected') then raise exception 'invalid decision'; end if;
  update public.property_submissions
     set status = p_decision, review_reason = p_reason, reviewed_by = v_uid, reviewed_at = now(), updated_at = now()
   where id = p_id
   returning promoter_id into v_prom;
  if v_prom is not null then
    insert into public.notifications(user_id, type, title, body) values (v_prom, 'submission',
      case p_decision when 'approved' then 'Your property submission was approved 🎉'
                      when 'rejected' then 'Submission update'
                      when 'info_required' then 'More info needed on your submission'
                      else 'Your submission is under review' end,
      coalesce(p_reason, case p_decision when 'approved' then 'It will be published shortly.'
                                         else 'Open Lead Capture in the app to see the details.' end));
  end if;
end $$;

revoke execute on function public.admin_review_submission(uuid, text, text) from public;
grant  execute on function public.admin_review_submission(uuid, text, text) to authenticated;

-- ── storage: dedicated public bucket, users write only their own folder ────
insert into storage.buckets (id, name, public) values ('submissions', 'submissions', true)
  on conflict (id) do nothing;

drop policy if exists "submissions read"       on storage.objects;
drop policy if exists "submissions insert own" on storage.objects;
drop policy if exists "submissions update own" on storage.objects;
create policy "submissions read" on storage.objects for select using (bucket_id = 'submissions');
create policy "submissions insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "submissions update own" on storage.objects for update to authenticated
  using (bucket_id = 'submissions' and (storage.foldername(name))[1] = auth.uid()::text);
