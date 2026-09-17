-- ════════════════════════════════════════════════════════════════════════════
-- 0097 — THE LAYOUT MAPPING ENGINE (2026-09-17)
--
-- Owner's brief: stop drawing plots as generated blocks and show the ORIGINAL
-- approved layout image, with every plot individually interactive through a
-- separate, precisely aligned overlay — managed from one admin console for the
-- website and the app alike, reusable for every future project.
--
-- WHAT THIS ADDS (additive only — no existing column, policy or RPC is removed):
--
--   layout_versions      one uploaded layout image per revision of a project:
--                        draft → published → superseded (or archived). The
--                        original upload is kept untouched (`source_url`); the
--                        page renders a colour-safe rendition (`image_url`).
--   layout_shapes        the polygons, in NORMALISED image coordinates (0..1 on
--                        both axes), so they stay aligned at any resolution the
--                        image is served at. kind = plot | road | open_space |
--                        reserved | boundary.
--   plot_status_history  every change of a plot's status, written by trigger
--                        from whichever path changed it (console, RPC, hold).
--   properties.plan_image  the PUBLISHED SNAPSHOT. The website and the app both
--                        already read `properties`, so publishing writes one
--                        compact jsonb here and both platforms pick it up
--                        through the paths they already use (ISR revalidation
--                        on the web, the realtime UPDATE subscription in the
--                        app). The version tables stay the source of truth;
--                        this column is their published cache.
--   plot uid             every element of `plot_layout` gains a stable `uid`,
--                        independent of its displayed number. Assigned by
--                        trigger, so every existing writer (admin textarea
--                        merge, pricing grid, set_plot_status, the app's
--                        editor) keeps working unchanged — they all merge onto
--                        the previous row and therefore carry the key along.
--
-- RULES ENFORCED HERE, NOT ONLY IN THE CONSOLE:
--   • A published or superseded version is immutable: its image, scale and
--     polygons cannot be edited. Changing approved geometry means forking a
--     new draft revision (admin_layout_fork) — the old one stays on record.
--   • Publishing refuses duplicate plot numbers, unassigned polygons, polygons
--     linked to no plot record, invalid polygons (too few points, out of the
--     image, zero area, self-intersecting) and unresolved blocking review
--     flags. Warnings (e.g. plot records the image does not show) must be
--     explicitly acknowledged.
--   • Every write is super-admin only and audited to admin_audit.
--
-- Applied to the live project through the Supabase migration API; this file is
-- the record. Re-runnable.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── published snapshot column ───────────────────────────────────────────────
alter table public.properties add column if not exists plan_image jsonb;

-- ─── versions ────────────────────────────────────────────────────────────────
create table if not exists public.layout_versions (
  id             uuid primary key default gen_random_uuid(),
  property_id    uuid not null references public.properties(id) on delete cascade,
  version_no     int  not null,
  state          text not null default 'draft'
                   check (state in ('draft','published','superseded','archived')),
  label          text,
  source_name    text,
  source_url     text,
  image_url      text not null,
  image_hi_url   text,
  image_w        int  not null check (image_w > 0),
  image_h        int  not null check (image_h > 0),
  metres_per_px  numeric check (metres_per_px is null or metres_per_px > 0),
  scale_note     text,
  style          jsonb not null default '{}'::jsonb,
  review         jsonb not null default '[]'::jsonb,
  based_on       uuid references public.layout_versions(id) on delete set null,
  note           text,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  published_by   uuid,
  published_at   timestamptz,
  unique (property_id, version_no)
);
create unique index if not exists layout_versions_one_published
  on public.layout_versions(property_id) where state = 'published';
create index if not exists layout_versions_property on public.layout_versions(property_id);

-- ─── shapes ──────────────────────────────────────────────────────────────────
create table if not exists public.layout_shapes (
  id          uuid primary key default gen_random_uuid(),
  version_id  uuid not null references public.layout_versions(id) on delete cascade,
  kind        text not null check (kind in ('plot','road','open_space','reserved','boundary')),
  plot_no     text,
  plot_uid    text,
  label       text,
  points      jsonb not null check (jsonb_typeof(points) = 'array'),
  sort        int  not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists layout_shapes_version on public.layout_shapes(version_id);

-- ─── status history ──────────────────────────────────────────────────────────
create table if not exists public.plot_status_history (
  id          bigserial primary key,
  property_id uuid not null references public.properties(id) on delete cascade,
  plot_no     text,
  plot_uid    text,
  old_status  text,
  new_status  text,
  changed_by  uuid,
  changed_at  timestamptz not null default now()
);
create index if not exists plot_status_history_property on public.plot_status_history(property_id, changed_at desc);

alter table public.layout_versions     enable row level security;
alter table public.layout_shapes       enable row level security;
alter table public.plot_status_history enable row level security;

drop policy if exists layout_versions_admin on public.layout_versions;
create policy layout_versions_admin on public.layout_versions for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists layout_shapes_admin on public.layout_shapes;
create policy layout_shapes_admin on public.layout_shapes for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists plot_status_history_admin on public.plot_status_history;
create policy plot_status_history_admin on public.plot_status_history for select to authenticated
  using (public.is_super_admin());

revoke all on public.layout_versions, public.layout_shapes, public.plot_status_history from anon;
grant select, insert, update, delete on public.layout_versions, public.layout_shapes to authenticated;
grant select on public.plot_status_history to authenticated;

-- ─── immutability of approved geometry ───────────────────────────────────────
create or replace function public.layout_versions_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    -- A property being deleted cascades; anything else keeps its history.
    if old.state <> 'draft' and exists (select 1 from properties where id = old.property_id) then
      raise exception 'Layout version % is on record and cannot be deleted — archive a draft instead', old.version_no
        using errcode = '42501';
    end if;
    return old;
  end if;
  if old.state <> 'draft' and (
       new.property_id, new.version_no, new.image_url, new.image_hi_url, new.source_url,
       new.image_w, new.image_h, new.metres_per_px, new.style
     ) is distinct from (
       old.property_id, old.version_no, old.image_url, old.image_hi_url, old.source_url,
       old.image_w, old.image_h, old.metres_per_px, old.style
     ) then
    raise exception 'Layout version % is % — fork a new revision to change it', old.version_no, old.state
      using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_layout_versions_guard on public.layout_versions;
create trigger trg_layout_versions_guard before update or delete on public.layout_versions
  for each row execute function public.layout_versions_guard();

create or replace function public.layout_shapes_guard() returns trigger
language plpgsql set search_path = public as $$
declare v_state text; v_vid uuid;
begin
  v_vid := case when tg_op = 'DELETE' then old.version_id else new.version_id end;
  select state into v_state from layout_versions where id = v_vid;
  -- v_state is null while a cascade from the version itself is running.
  if v_state is not null and v_state <> 'draft' then
    raise exception 'Shapes of a % layout cannot be changed — fork a new revision', v_state
      using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.version_id <> new.version_id then
    select state into v_state from layout_versions where id = old.version_id;
    if v_state is not null and v_state <> 'draft' then
      raise exception 'Shapes of a % layout cannot be moved', v_state using errcode = '42501';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists trg_layout_shapes_guard on public.layout_shapes;
create trigger trg_layout_shapes_guard before insert or update or delete on public.layout_shapes
  for each row execute function public.layout_shapes_guard();

-- ─── stable plot uids ────────────────────────────────────────────────────────
create or replace function public.plot_layout_assign_uids() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.plot_layout is null or jsonb_typeof(new.plot_layout) <> 'array' then
    return new;
  end if;
  if exists (select 1 from jsonb_array_elements(new.plot_layout) e
              where jsonb_typeof(e) = 'object' and coalesce(e->>'uid','') = '') then
    new.plot_layout := (
      select coalesce(jsonb_agg(
               case when jsonb_typeof(e) = 'object' and coalesce(e->>'uid','') = ''
                    then e || jsonb_build_object('uid', gen_random_uuid()::text)
                    else e end
               order by i), '[]'::jsonb)
        from jsonb_array_elements(new.plot_layout) with ordinality t(e, i));
  end if;
  return new;
end $$;
drop trigger if exists trg_properties_plot_uids on public.properties;
create trigger trg_properties_plot_uids before insert or update of plot_layout on public.properties
  for each row execute function public.plot_layout_assign_uids();

-- ─── status history trigger (never blocks a save) ────────────────────────────
create or replace function public.plot_status_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.plot_layout is distinct from old.plot_layout
       and jsonb_typeof(new.plot_layout) = 'array' then
      insert into plot_status_history(property_id, plot_no, plot_uid, old_status, new_status, changed_by)
      select new.id, n.e->>'plot', n.e->>'uid',
             case when o.e is null then null else coalesce(o.e->>'status','available') end,
             coalesce(n.e->>'status','available'), auth.uid()
        from jsonb_array_elements(new.plot_layout) n(e)
        left join lateral (
          select x as e from jsonb_array_elements(
                   case when jsonb_typeof(old.plot_layout) = 'array' then old.plot_layout else '[]'::jsonb end) x
           where x->>'plot' = n.e->>'plot' limit 1) o on true
       where jsonb_typeof(n.e) = 'object'
         and (o.e is null or coalesce(o.e->>'status','available') <> coalesce(n.e->>'status','available'));
    end if;
  exception when others then
    raise warning 'plot_status_log skipped: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists trg_properties_plot_status_log on public.properties;
create trigger trg_properties_plot_status_log after update of plot_layout on public.properties
  for each row execute function public.plot_status_log();

-- Backfill uids on every existing layout (fires the uid trigger; statuses are
-- unchanged, so the history trigger records nothing).
update public.properties set plot_layout = plot_layout
 where jsonb_typeof(plot_layout) = 'array'
   and exists (select 1 from jsonb_array_elements(plot_layout) e
                where jsonb_typeof(e) = 'object' and coalesce(e->>'uid','') = '');

-- ─── the fifth public status: "not released" ─────────────────────────────────
-- `blocked` stays valid (no plot uses it today); `not_released` joins it so the
-- two can mean different things.
create or replace function public.admin_set_plot_status(p_property uuid, p_plot text, p_status text)
returns void language plpgsql security definer set search_path = public as $function$
begin
  if not public.is_super_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if p_status not in ('available','reserved','booked','sold','blocked','not_released') then
    raise exception 'Unknown status %', p_status using errcode = '22023';
  end if;

  perform public.set_plot_status(p_property, p_plot, p_status);

  if p_status in ('booked','sold') then
    update public.plot_holds
       set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid()
     where property_id = p_property and plot = p_plot and status = 'held';
    perform public.notify_user(h.buyer_id, 'plot_confirmed',
      'Plot ' || p_plot || ' confirmed',
      'Your booking for plot ' || p_plot || ' is confirmed. Reference ' || h.ref || '.',
      jsonb_build_object('property_id', p_property, 'plot', p_plot, 'ref', h.ref))
      from public.plot_holds h
     where h.property_id = p_property and h.plot = p_plot and h.status = 'confirmed'
       and h.confirmed_at > now() - interval '5 seconds';
  elsif p_status = 'available' then
    update public.plot_holds set status = 'released'
     where property_id = p_property and plot = p_plot and status = 'held';
  end if;
end $function$;
revoke execute on function public.admin_set_plot_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_plot_status(uuid, text, text) to authenticated;

-- ─── geometry helpers ────────────────────────────────────────────────────────
create or replace function public.layout_poly_problem(p_points jsonb)
returns text language plpgsql immutable set search_path = public as $$
declare
  n int; xs float8[]; ys float8[]; i int; j int; a float8 := 0;
  ax float8; ay float8; bx float8; by_ float8; cx float8; cy float8; dx float8; dy float8;
  d1 float8; d2 float8; d3 float8; d4 float8;
begin
  if p_points is null or jsonb_typeof(p_points) <> 'array' then return 'no points'; end if;
  n := jsonb_array_length(p_points);
  if n < 3 then return 'fewer than 3 points'; end if;
  if n > 400 then return 'more than 400 points'; end if;
  for i in 0..n-1 loop
    if jsonb_typeof(p_points->i) <> 'array' or jsonb_array_length(p_points->i) <> 2
       or jsonb_typeof(p_points->i->0) <> 'number' or jsonb_typeof(p_points->i->1) <> 'number' then
      return 'malformed point';
    end if;
    xs[i] := (p_points->i->>0)::float8; ys[i] := (p_points->i->>1)::float8;
    if xs[i] < -0.001 or xs[i] > 1.001 or ys[i] < -0.001 or ys[i] > 1.001 then
      return 'point outside the image';
    end if;
  end loop;
  for i in 0..n-1 loop
    j := (i + 1) % n;
    a := a + xs[i] * ys[j] - xs[j] * ys[i];
  end loop;
  if abs(a) / 2 < 1e-7 then return 'zero area'; end if;
  -- self-intersection: non-adjacent edges must not cross
  if n > 3 then
    for i in 0..n-1 loop
      ax := xs[i]; ay := ys[i]; bx := xs[(i+1)%n]; by_ := ys[(i+1)%n];
      for j in i+2..n-1 loop
        if i = 0 and j = n-1 then continue; end if;
        cx := xs[j]; cy := ys[j]; dx := xs[(j+1)%n]; dy := ys[(j+1)%n];
        d1 := (dx-cx)*(ay-cy) - (dy-cy)*(ax-cx);
        d2 := (dx-cx)*(by_-cy) - (dy-cy)*(bx-cx);
        d3 := (bx-ax)*(cy-ay) - (by_-ay)*(cx-ax);
        d4 := (bx-ax)*(dy-ay) - (by_-ay)*(dx-ax);
        if ((d1 > 0 and d2 < 0) or (d1 < 0 and d2 > 0)) and ((d3 > 0 and d4 < 0) or (d3 < 0 and d4 > 0)) then
          return 'edges cross (self-intersecting)';
        end if;
      end loop;
    end loop;
  end if;
  return null;
end $$;

-- ─── validate ────────────────────────────────────────────────────────────────
create or replace function public.admin_layout_validate(p_version uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v layout_versions; errs jsonb := '[]'::jsonb; warns jsonb := '[]'::jsonb;
  r record; plots jsonb; cnt jsonb;
begin
  if not public.is_super_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  select * into v from layout_versions where id = p_version;
  if not found then raise exception 'Layout version not found' using errcode = 'P0002'; end if;
  select case when jsonb_typeof(plot_layout) = 'array' then plot_layout else '[]'::jsonb end
    into plots from properties where id = v.property_id;

  if coalesce(v.image_url,'') = '' or v.image_w is null or v.image_h is null then
    errs := errs || jsonb_build_object('code','no_image','message','No layout image');
  end if;

  for r in select s.id, s.kind, s.plot_no, s.label, public.layout_poly_problem(s.points) problem
             from layout_shapes s where s.version_id = p_version loop
    if r.problem is not null then
      errs := errs || jsonb_build_object('code','invalid_polygon','shape_id',r.id,'plot',r.plot_no,
        'message', initcap(replace(r.kind,'_',' ')) || coalesce(' ' || r.plot_no, coalesce(' "' || r.label || '"','')) || ': ' || r.problem);
    end if;
    if r.kind = 'plot' and coalesce(trim(r.plot_no),'') = '' then
      errs := errs || jsonb_build_object('code','unassigned','shape_id',r.id,
        'message','A plot polygon has no plot number');
    elsif r.kind = 'plot' and not exists (
      select 1 from jsonb_array_elements(plots) e where lower(trim(e->>'plot')) = lower(trim(r.plot_no))) then
      errs := errs || jsonb_build_object('code','missing_record','shape_id',r.id,'plot',r.plot_no,
        'message','Plot ' || r.plot_no || ' is drawn but has no plot record');
    end if;
  end loop;

  for r in select lower(trim(plot_no)) k, min(plot_no) plot_no, count(*) n from layout_shapes
            where version_id = p_version and kind = 'plot' and coalesce(trim(plot_no),'') <> ''
            group by 1 having count(*) > 1 loop
    errs := errs || jsonb_build_object('code','duplicate','plot',r.plot_no,
      'message','Plot ' || r.plot_no || ' is drawn ' || r.n || ' times');
  end loop;

  for r in select e->>'plot' plot_no from jsonb_array_elements(plots) e
            where not exists (select 1 from layout_shapes s where s.version_id = p_version and s.kind = 'plot'
                               and lower(trim(s.plot_no)) = lower(trim(e->>'plot')))
            order by nullif(regexp_replace(e->>'plot','\D','','g'),'')::int nulls last loop
    warns := warns || jsonb_build_object('code','unmapped_record','plot',r.plot_no,
      'message','Plot record ' || r.plot_no || ' is not on this layout');
  end loop;

  for r in select x from jsonb_array_elements(case when jsonb_typeof(v.review)='array' then v.review else '[]' end) x
            where coalesce((x->>'resolved')::boolean, false) = false loop
    if r.x->>'severity' = 'blocker' then
      errs := errs || jsonb_build_object('code','review_blocker','plot',r.x->>'plot','message',r.x->>'message');
    else
      warns := warns || jsonb_build_object('code','review','plot',r.x->>'plot','message',r.x->>'message');
    end if;
  end loop;

  if v.metres_per_px is null then
    warns := warns || jsonb_build_object('code','no_scale','message','No scale calibrated — the Measure tool will be hidden');
  end if;

  select jsonb_build_object(
    'plots', count(*) filter (where kind = 'plot'),
    'roads', count(*) filter (where kind = 'road'),
    'open_spaces', count(*) filter (where kind = 'open_space'),
    'reserved', count(*) filter (where kind = 'reserved'),
    'records', jsonb_array_length(plots))
    into cnt from layout_shapes where version_id = p_version;

  return jsonb_build_object('ok', jsonb_array_length(errs) = 0, 'errors', errs, 'warnings', warns, 'counts', cnt);
end $$;

-- ─── save a draft (create or update, shapes replaced wholesale) ──────────────
create or replace function public.admin_layout_save(
  p_version uuid, p_property uuid, p_meta jsonb, p_shapes jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v layout_versions; v_id uuid; v_no int; s jsonb; i int := 0;
begin
  if not public.is_super_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  if p_shapes is not null and jsonb_typeof(p_shapes) <> 'array' then
    raise exception 'shapes must be an array' using errcode = '22023';
  end if;

  if p_version is null then
    if not exists (select 1 from properties where id = p_property) then
      raise exception 'Property not found' using errcode = 'P0002';
    end if;
    select coalesce(max(version_no), 0) + 1 into v_no from layout_versions where property_id = p_property;
    insert into layout_versions(property_id, version_no, label, source_name, source_url, image_url, image_hi_url,
                                image_w, image_h, metres_per_px, scale_note, style, review, note, based_on)
    values (p_property, v_no, p_meta->>'label', p_meta->>'source_name', p_meta->>'source_url', p_meta->>'image_url',
            p_meta->>'image_hi_url', (p_meta->>'image_w')::int, (p_meta->>'image_h')::int,
            nullif(p_meta->>'metres_per_px','')::numeric, p_meta->>'scale_note',
            coalesce(p_meta->'style','{}'::jsonb), coalesce(p_meta->'review','[]'::jsonb), p_meta->>'note',
            nullif(p_meta->>'based_on','')::uuid)
    returning * into v;
  else
    select * into v from layout_versions where id = p_version for update;
    if not found then raise exception 'Layout version not found' using errcode = 'P0002'; end if;
    if v.property_id <> p_property then raise exception 'Version belongs to another project' using errcode = '42501'; end if;
    if v.state <> 'draft' then
      raise exception 'Version % is % — fork a new revision to change it', v.version_no, v.state using errcode = '42501';
    end if;
    update layout_versions set
      label         = case when p_meta ? 'label' then p_meta->>'label' else label end,
      source_name   = case when p_meta ? 'source_name' then p_meta->>'source_name' else source_name end,
      source_url    = case when p_meta ? 'source_url' then p_meta->>'source_url' else source_url end,
      image_url     = coalesce(nullif(p_meta->>'image_url',''), image_url),
      image_hi_url  = case when p_meta ? 'image_hi_url' then p_meta->>'image_hi_url' else image_hi_url end,
      image_w       = coalesce((p_meta->>'image_w')::int, image_w),
      image_h       = coalesce((p_meta->>'image_h')::int, image_h),
      metres_per_px = case when p_meta ? 'metres_per_px' then nullif(p_meta->>'metres_per_px','')::numeric else metres_per_px end,
      scale_note    = case when p_meta ? 'scale_note' then p_meta->>'scale_note' else scale_note end,
      style         = coalesce(p_meta->'style', style),
      review        = coalesce(p_meta->'review', review),
      note          = case when p_meta ? 'note' then p_meta->>'note' else note end
    where id = v.id returning * into v;
  end if;

  if p_shapes is not null then
    delete from layout_shapes where version_id = v.id;
    for s in select * from jsonb_array_elements(p_shapes) loop
      i := i + 1;
      insert into layout_shapes(version_id, kind, plot_no, plot_uid, label, points, sort)
      values (v.id, coalesce(s->>'kind','plot'), nullif(trim(s->>'plot_no'),''), nullif(s->>'plot_uid',''),
              nullif(s->>'label',''), coalesce(s->'points','[]'::jsonb), i);
    end loop;
  end if;

  perform public.admin_log(case when p_version is null then 'layout.create' else 'layout.save' end, 'layouts',
    v.id::text, 'Layout v' || v.version_no || ' draft saved (' || coalesce(jsonb_array_length(p_shapes), 0) || ' shapes)',
    null, jsonb_build_object('property_id', v.property_id, 'version_no', v.version_no));
  return v.id;
end $$;

-- ─── publish ─────────────────────────────────────────────────────────────────
create or replace function public.admin_layout_publish(p_version uuid, p_note text, p_acknowledge boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v layout_versions; val jsonb; snap jsonb; prev jsonb; plots jsonb;
begin
  if not public.is_super_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  select * into v from layout_versions where id = p_version for update;
  if not found then raise exception 'Layout version not found' using errcode = 'P0002'; end if;
  if v.state <> 'draft' then
    raise exception 'Only a draft can be published (v% is %)', v.version_no, v.state using errcode = '42501';
  end if;
  val := public.admin_layout_validate(p_version);
  if not (val->>'ok')::boolean then
    raise exception 'Cannot publish: % blocking problem(s) — %', jsonb_array_length(val->'errors'),
      (select string_agg(x->>'message', '; ') from (select x from jsonb_array_elements(val->'errors') x limit 5) q)
      using errcode = '22023';
  end if;
  if jsonb_array_length(val->'warnings') > 0 and not coalesce(p_acknowledge, false) then
    raise exception 'Cannot publish: % warning(s) must be acknowledged', jsonb_array_length(val->'warnings')
      using errcode = '22023';
  end if;

  select plan_image, case when jsonb_typeof(plot_layout)='array' then plot_layout else '[]'::jsonb end
    into prev, plots from properties where id = v.property_id for update;

  update layout_versions set state = 'superseded'
   where property_id = v.property_id and state = 'published' and id <> v.id;
  update layout_versions set state = 'published', published_at = now(), published_by = auth.uid(),
         note = coalesce(nullif(p_note,''), note)
   where id = v.id returning * into v;

  snap := jsonb_build_object(
    'version_id', v.id, 'version_no', v.version_no, 'published_at', v.published_at,
    'src', v.image_url, 'hi', v.image_hi_url, 'w', v.image_w, 'h', v.image_h,
    'metres_per_px', v.metres_per_px, 'scale_note', v.scale_note, 'style', v.style,
    'review_plots', coalesce((
       select jsonb_agg(distinct x->>'plot') from jsonb_array_elements(v.review) x
        where coalesce((x->>'resolved')::boolean,false) = false and coalesce(x->>'plot','') <> ''), '[]'::jsonb),
    'shapes', coalesce((
       select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                'k', s.kind, 'plot', s.plot_no,
                'uid', coalesce(s.plot_uid, (select e->>'uid' from jsonb_array_elements(plots) e
                                             where lower(trim(e->>'plot')) = lower(trim(s.plot_no)) limit 1)),
                'label', s.label, 'pts', s.points)) order by s.sort)
         from layout_shapes s where s.version_id = v.id), '[]'::jsonb));

  update properties set plan_image = snap where id = v.property_id;

  perform public.admin_log('layout.publish', 'layouts', v.id::text,
    'Published layout v' || v.version_no || coalesce(' — ' || nullif(p_note,''), ''),
    case when prev is null then null else jsonb_build_object('version_id', prev->'version_id', 'version_no', prev->'version_no') end,
    jsonb_build_object('property_id', v.property_id, 'version_no', v.version_no, 'counts', val->'counts',
                       'warnings_acknowledged', jsonb_array_length(val->'warnings')));
  return jsonb_build_object('version_id', v.id, 'version_no', v.version_no, 'counts', val->'counts');
end $$;

-- ─── unpublish (the page falls back to the previous views) ───────────────────
create or replace function public.admin_layout_unpublish(p_property uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_super_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  update layout_versions set state = 'superseded' where property_id = p_property and state = 'published';
  get diagnostics n = row_count;
  update properties set plan_image = null where id = p_property;
  perform public.admin_log('layout.unpublish', 'layouts', p_property::text,
    'Interactive layout withdrawn from the website and app', null, jsonb_build_object('versions', n));
end $$;

-- ─── fork: new revision / restore an earlier version ─────────────────────────
create or replace function public.admin_layout_fork(p_version uuid, p_label text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v layout_versions; v_no int; v_new uuid;
begin
  if not public.is_super_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  select * into v from layout_versions where id = p_version;
  if not found then raise exception 'Layout version not found' using errcode = 'P0002'; end if;
  select coalesce(max(version_no), 0) + 1 into v_no from layout_versions where property_id = v.property_id;
  insert into layout_versions(property_id, version_no, label, source_name, source_url, image_url, image_hi_url,
                              image_w, image_h, metres_per_px, scale_note, style, review, based_on, note)
  values (v.property_id, v_no, coalesce(nullif(p_label,''), 'Revision of v' || v.version_no), v.source_name,
          v.source_url, v.image_url, v.image_hi_url, v.image_w, v.image_h, v.metres_per_px, v.scale_note,
          v.style, v.review, v.id, null)
  returning id into v_new;
  insert into layout_shapes(version_id, kind, plot_no, plot_uid, label, points, sort)
  select v_new, kind, plot_no, plot_uid, label, points, sort from layout_shapes where version_id = v.id;
  perform public.admin_log('layout.fork', 'layouts', v_new::text,
    'Draft v' || v_no || ' created from v' || v.version_no, null,
    jsonb_build_object('property_id', v.property_id, 'from_version', v.version_no));
  return v_new;
end $$;

create or replace function public.admin_layout_archive(p_version uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v layout_versions;
begin
  if not public.is_super_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  select * into v from layout_versions where id = p_version;
  if not found then raise exception 'Layout version not found' using errcode = 'P0002'; end if;
  if v.state <> 'draft' then raise exception 'Only a draft can be archived' using errcode = '42501'; end if;
  update layout_versions set state = 'archived' where id = p_version;
  perform public.admin_log('layout.archive', 'layouts', v.id::text, 'Draft v' || v.version_no || ' archived', null,
    jsonb_build_object('property_id', v.property_id));
end $$;

-- ─── create / edit one plot record from the mapper ───────────────────────────
-- Merges whitelisted keys into the matching `plot_layout` element (null removes
-- the key), or appends a new record. A status change is routed through
-- admin_set_plot_status so holds are confirmed/released exactly as before.
create or replace function public.admin_plot_upsert(p_property uuid, p_plot text, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  plots jsonb; found_it boolean; k text; clean jsonb := '{}'::jsonb; drop_keys text[] := '{}';
  allowed text[] := array['size_sqft','size_sqm','dim_m','facing','road_m','price','offer_price','block','corner'];
  v_status text; old_status text; out_row jsonb;
begin
  if not public.is_super_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  if coalesce(trim(p_plot),'') = '' then raise exception 'Plot number required' using errcode = '22023'; end if;
  p_plot := trim(p_plot);
  p_patch := coalesce(p_patch, '{}'::jsonb);
  for k in select jsonb_object_keys(p_patch) loop
    if k = any(allowed) then
      if jsonb_typeof(p_patch->k) = 'null' or p_patch->>k = '' then drop_keys := drop_keys || k;
      else clean := clean || jsonb_build_object(k, p_patch->k); end if;
    end if;
  end loop;
  v_status := nullif(p_patch->>'status','');
  if v_status is not null and v_status not in ('available','reserved','booked','sold','blocked','not_released') then
    raise exception 'Unknown status %', v_status using errcode = '22023';
  end if;

  select case when jsonb_typeof(plot_layout)='array' then plot_layout else '[]'::jsonb end into plots
    from properties where id = p_property for update;
  if not found then raise exception 'Property not found' using errcode = 'P0002'; end if;

  select exists (select 1 from jsonb_array_elements(plots) e where e->>'plot' = p_plot),
         (select coalesce(e->>'status','available') from jsonb_array_elements(plots) e where e->>'plot' = p_plot limit 1)
    into found_it, old_status;

  if found_it then
    plots := (select jsonb_agg(case when e->>'plot' = p_plot then (e - drop_keys) || clean else e end order by i)
                from jsonb_array_elements(plots) with ordinality t(e, i));
  else
    plots := plots || jsonb_build_array(jsonb_build_object('plot', p_plot,
               'status', coalesce(v_status, 'not_released')) || clean);
  end if;

  update properties set plot_layout = plots,
         plots_total = jsonb_array_length(plots),
         plots_available = (select count(*) from jsonb_array_elements(plots) e
                             where coalesce(e->>'status','available') = 'available')
   where id = p_property;

  if found_it and v_status is not null and v_status <> old_status then
    perform public.admin_set_plot_status(p_property, p_plot, v_status);
  end if;

  select e into out_row from properties p, jsonb_array_elements(p.plot_layout) e
   where p.id = p_property and e->>'plot' = p_plot limit 1;
  perform public.admin_log(case when found_it then 'plot.update' else 'plot.create' end, 'layouts',
    p_property::text, 'Plot ' || p_plot || case when found_it then ' updated' else ' created' end, null, out_row);
  return out_row;
end $$;

revoke execute on function public.admin_layout_validate(uuid) from public, anon;
revoke execute on function public.admin_layout_save(uuid, uuid, jsonb, jsonb) from public, anon;
revoke execute on function public.admin_layout_publish(uuid, text, boolean) from public, anon;
revoke execute on function public.admin_layout_unpublish(uuid) from public, anon;
revoke execute on function public.admin_layout_fork(uuid, text) from public, anon;
revoke execute on function public.admin_layout_archive(uuid) from public, anon;
revoke execute on function public.admin_plot_upsert(uuid, text, jsonb) from public, anon;
revoke execute on function public.plot_status_log() from public, anon;
grant execute on function public.admin_layout_validate(uuid) to authenticated;
grant execute on function public.admin_layout_save(uuid, uuid, jsonb, jsonb) to authenticated;
grant execute on function public.admin_layout_publish(uuid, text, boolean) to authenticated;
grant execute on function public.admin_layout_unpublish(uuid) to authenticated;
grant execute on function public.admin_layout_fork(uuid, text) to authenticated;
grant execute on function public.admin_layout_archive(uuid) to authenticated;
grant execute on function public.admin_plot_upsert(uuid, text, jsonb) to authenticated;
