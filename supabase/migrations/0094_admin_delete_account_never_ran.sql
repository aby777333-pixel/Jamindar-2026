-- 0094 — admin_delete_account could never actually run.
--
-- Found while testing 0093, which copied the fault faithfully: the profile
-- UPDATE sets `acquisition_meta = null`, but the column is NOT NULL DEFAULT
-- '{}'. Every call therefore died on 23502 at the final step — after the
-- posts, comments and document requests had already been updated inside the
-- same transaction, so those rolled back too and the button in the console
-- can never have worked against a real account. The fix is the empty object
-- the column defaults to, which carries exactly as little information as the
-- null intended. This is the 0091 function verbatim otherwise.
create or replace function public.admin_delete_account(p_user uuid, p_confirm text)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_p profiles; v_tomb text; v_posts int; v_comments int; v_reqs int;
begin
  if not public.is_super_admin() then raise exception 'not authorized'; end if;
  -- the admin has to type the word the confirmation dialog shows
  if coalesce(p_confirm,'') <> 'DELETE' then raise exception 'confirmation phrase missing'; end if;

  select * into v_p from profiles where id = p_user;
  if v_p.id is null then raise exception 'user not found'; end if;
  if v_p.role::text = 'super_admin' then raise exception 'an administrator account cannot be deleted from here'; end if;
  if v_p.full_name = 'Deleted user' then raise exception 'this account has already been removed'; end if;

  v_tomb := 'deleted-' || replace(p_user::text, '-', '');

  perform set_config('app.allow_protected', 'on', true);

  update profiles set
      full_name = 'Deleted user',
      email = null, mobile = v_tomb, avatar_url = null,
      city = null, district = null, state = null, pincode = null,
      dob = null, gender = null, is_active = false, acquisition_meta = '{}'::jsonb
    where id = p_user;

  update community_posts set status = 'removed'
    where author_id = p_user and status <> 'removed';
  get diagnostics v_posts = row_count;

  update community_comments set status = 'removed', deleted_at = now(), deleted_by = auth.uid()
    where author_id = p_user and coalesce(status,'published') <> 'removed';
  get diagnostics v_comments = row_count;

  update document_requests set status = 'rejected', review_reason = 'Account removed',
         reviewed_by = auth.uid(), reviewed_at = now()
    where user_id = p_user and status = 'pending';
  get diagnostics v_reqs = row_count;

  delete from notifications where user_id = p_user;

  perform public.admin_log('user.delete', 'users', p_user::text,
    coalesce(v_p.full_name,'user') || ' anonymised and deactivated',
    jsonb_build_object('full_name', v_p.full_name, 'email', v_p.email, 'mobile', v_p.mobile,
                       'member_code', v_p.member_code, 'role', v_p.role::text),
    jsonb_build_object('anonymised', true, 'posts_removed', v_posts,
                       'comments_removed', v_comments, 'requests_closed', v_reqs,
                       'financial_records', 'retained', 'referral_tree', 'unchanged'));

  return jsonb_build_object('ok', true, 'posts_removed', v_posts,
                            'comments_removed', v_comments, 'requests_closed', v_reqs);
end $fn$;
