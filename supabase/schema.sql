-- Kortbyte v0.2 — Supabase/PostgreSQL
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Samlare',
  country_code text not null default 'SE',
  city text,
  plan text not null default 'free' check (plan in ('free','plus')),
  trade_count integer not null default 0,
  rating numeric(3,2),
  created_at timestamptz not null default now()
);

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  category text not null,
  card_set text,
  card_year text,
  card_number text,
  variant text,
  grading_company text,
  grade text,
  estimated_value_sek integer,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.wanted_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  query text not null,
  category text,
  min_value_sek integer,
  max_value_sek integer,
  created_at timestamptz not null default now()
);

create table if not exists public.trade_proposals (
  id uuid primary key default gen_random_uuid(),
  proposer_id uuid not null references public.profiles(id),
  receiver_id uuid not null references public.profiles(id),
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled','completed','countered')),
  parent_trade_id uuid references public.trade_proposals(id),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.trade_items (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trade_proposals(id) on delete cascade,
  card_id uuid not null references public.cards(id),
  from_user_id uuid not null references public.profiles(id),
  to_user_id uuid not null references public.profiles(id)
);

create index if not exists cards_owner_active_idx on public.cards(owner_id,is_active);
create index if not exists wanted_cards_user_idx on public.wanted_cards(user_id);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,display_name) values(new.id,coalesce(new.raw_user_meta_data->>'display_name',split_part(new.email,'@',1),'Samlare')) on conflict(id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Database-level Free limit. Front-end check is convenience only.
create or replace function public.enforce_free_card_limit() returns trigger language plpgsql security definer set search_path=public as $$
declare current_plan text; active_cards integer;
begin
  if new.is_active is false then return new; end if;
  select plan into current_plan from public.profiles where id=new.owner_id;
  if coalesce(current_plan,'free')='free' then
    select count(*) into active_cards from public.cards where owner_id=new.owner_id and is_active=true and (tg_op='INSERT' or id<>new.id);
    if active_cards>=5 then raise exception 'Gratisnivån tillåter högst 5 aktiva byteskort'; end if;
  end if;
  return new;
end; $$;
drop trigger if exists cards_free_limit on public.cards;
create trigger cards_free_limit before insert or update of is_active,owner_id on public.cards for each row execute function public.enforce_free_card_limit();

alter table public.profiles enable row level security;
alter table public.cards enable row level security;
alter table public.wanted_cards enable row level security;
alter table public.trade_proposals enable row level security;
alter table public.trade_items enable row level security;

drop policy if exists "profiles visible" on public.profiles;
create policy "profiles visible" on public.profiles for select using (true);
drop policy if exists "profile own update" on public.profiles;
create policy "profile own update" on public.profiles for update using(auth.uid()=id) with check(auth.uid()=id);

drop policy if exists "active cards visible" on public.cards;
create policy "active cards visible" on public.cards for select using(is_active=true or auth.uid()=owner_id);
drop policy if exists "own cards insert" on public.cards;
create policy "own cards insert" on public.cards for insert with check(auth.uid()=owner_id);
drop policy if exists "own cards update" on public.cards;
create policy "own cards update" on public.cards for update using(auth.uid()=owner_id) with check(auth.uid()=owner_id);
drop policy if exists "own cards delete" on public.cards;
create policy "own cards delete" on public.cards for delete using(auth.uid()=owner_id);

drop policy if exists "wanted visible" on public.wanted_cards;
create policy "wanted visible" on public.wanted_cards for select using(true);
drop policy if exists "own wanted insert" on public.wanted_cards;
create policy "own wanted insert" on public.wanted_cards for insert with check(auth.uid()=user_id);
drop policy if exists "own wanted update" on public.wanted_cards;
create policy "own wanted update" on public.wanted_cards for update using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists "own wanted delete" on public.wanted_cards;
create policy "own wanted delete" on public.wanted_cards for delete using(auth.uid()=user_id);

-- Storage bucket for card images.
insert into storage.buckets(id,name,public) values('card-images','card-images',true) on conflict(id) do update set public=true;
drop policy if exists "card images public read" on storage.objects;
create policy "card images public read" on storage.objects for select using(bucket_id='card-images');
drop policy if exists "card images own insert" on storage.objects;
create policy "card images own insert" on storage.objects for insert to authenticated with check(bucket_id='card-images' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "card images own delete" on storage.objects;
create policy "card images own delete" on storage.objects for delete to authenticated using(bucket_id='card-images' and (storage.foldername(name))[1]=auth.uid()::text);


-- Migration safety when upgrading an existing v0.2 database
alter table public.trade_proposals add column if not exists parent_trade_id uuid references public.trade_proposals(id);
alter table public.trade_proposals add column if not exists note text;

-- v0.3 trade security
create index if not exists trade_proposals_users_idx on public.trade_proposals(proposer_id,receiver_id,created_at desc);
create index if not exists trade_items_trade_idx on public.trade_items(trade_id);

drop policy if exists "trade participants read" on public.trade_proposals;
create policy "trade participants read" on public.trade_proposals for select using(auth.uid()=proposer_id or auth.uid()=receiver_id);
drop policy if exists "trade proposer insert" on public.trade_proposals;
create policy "trade proposer insert" on public.trade_proposals for insert with check(auth.uid()=proposer_id and proposer_id<>receiver_id);
drop policy if exists "trade participants update" on public.trade_proposals;
create policy "trade participants update" on public.trade_proposals for update using(auth.uid()=proposer_id or auth.uid()=receiver_id) with check(auth.uid()=proposer_id or auth.uid()=receiver_id);

drop policy if exists "trade items participants read" on public.trade_items;
create policy "trade items participants read" on public.trade_items for select using(exists(select 1 from public.trade_proposals t where t.id=trade_id and (t.proposer_id=auth.uid() or t.receiver_id=auth.uid())));
drop policy if exists "trade items proposer insert" on public.trade_items;
create policy "trade items proposer insert" on public.trade_items for insert with check(exists(select 1 from public.trade_proposals t where t.id=trade_id and t.proposer_id=auth.uid()) and (from_user_id=auth.uid() or to_user_id=auth.uid()));

-- v0.4 chat + notification foundation
create table if not exists public.trade_messages (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trade_proposals(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists trade_messages_trade_idx on public.trade_messages(trade_id,created_at);
alter table public.trade_messages enable row level security;
drop policy if exists "trade messages participants read" on public.trade_messages;
create policy "trade messages participants read" on public.trade_messages for select using(exists(select 1 from public.trade_proposals t where t.id=trade_id and (t.proposer_id=auth.uid() or t.receiver_id=auth.uid())));
drop policy if exists "trade messages participants insert" on public.trade_messages;
create policy "trade messages participants insert" on public.trade_messages for insert with check(sender_id=auth.uid() and exists(select 1 from public.trade_proposals t where t.id=trade_id and (t.proposer_id=auth.uid() or t.receiver_id=auth.uid())));

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  trade_id uuid references public.trade_proposals(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id,read_at,created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "own notifications read" on public.notifications;
create policy "own notifications read" on public.notifications for select using(user_id=auth.uid());
drop policy if exists "own notifications update" on public.notifications;
create policy "own notifications update" on public.notifications for update using(user_id=auth.uid()) with check(user_id=auth.uid());

create or replace function public.notify_trade_message() returns trigger language plpgsql security definer set search_path=public as $$
declare recipient uuid;
begin
  select case when proposer_id=new.sender_id then receiver_id else proposer_id end into recipient from public.trade_proposals where id=new.trade_id;
  if recipient is not null then insert into public.notifications(user_id,type,title,body,trade_id) values(recipient,'trade_message','Nytt meddelande i ett byte',left(new.body,160),new.trade_id); end if;
  return new;
end; $$;
drop trigger if exists on_trade_message_notify on public.trade_messages;
create trigger on_trade_message_notify after insert on public.trade_messages for each row execute function public.notify_trade_message();

-- v0.5 secure trade completion, card locking and reviews
alter table public.cards add column if not exists locked_trade_id uuid references public.trade_proposals(id) on delete set null;
create index if not exists cards_locked_trade_idx on public.cards(locked_trade_id);

create table if not exists public.trade_fulfillment (
  trade_id uuid primary key references public.trade_proposals(id) on delete cascade,
  proposer_shipped_at timestamptz,
  receiver_shipped_at timestamptz,
  proposer_received_at timestamptz,
  receiver_received_at timestamptz,
  tracking_proposer text,
  tracking_receiver text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trade_reviews (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trade_proposals(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  unique(trade_id,author_id)
);
create index if not exists trade_reviews_subject_idx on public.trade_reviews(subject_id,created_at desc);

alter table public.trade_fulfillment enable row level security;
alter table public.trade_reviews enable row level security;

drop policy if exists "trade fulfillment participants read" on public.trade_fulfillment;
create policy "trade fulfillment participants read" on public.trade_fulfillment for select using(
  exists(select 1 from public.trade_proposals t where t.id=trade_id and (t.proposer_id=auth.uid() or t.receiver_id=auth.uid()))
);

drop policy if exists "trade reviews visible" on public.trade_reviews;
create policy "trade reviews visible" on public.trade_reviews for select using(true);
drop policy if exists "completed trade review insert" on public.trade_reviews;
create policy "completed trade review insert" on public.trade_reviews for insert with check(
  author_id=auth.uid()
  and author_id<>subject_id
  and exists(select 1 from public.trade_proposals t where t.id=trade_id and t.status='completed' and (t.proposer_id=auth.uid() or t.receiver_id=auth.uid()) and subject_id=case when t.proposer_id=auth.uid() then t.receiver_id else t.proposer_id end)
);

-- Direct status updates are intentionally removed in v0.5. State changes go through guarded RPCs.
drop policy if exists "trade participants update" on public.trade_proposals;

create or replace function public.transition_trade(p_trade_id uuid, p_action text)
returns void language plpgsql security definer set search_path=public as $$
declare
  t public.trade_proposals%rowtype;
  locked_conflicts integer;
  shipped_count integer;
begin
  select * into t from public.trade_proposals where id=p_trade_id for update;
  if t.id is null then raise exception 'Bytet finns inte'; end if;
  if auth.uid() is null or auth.uid() not in (t.proposer_id,t.receiver_id) then raise exception 'Du deltar inte i bytet'; end if;

  if p_action='accept' then
    if auth.uid()<>t.receiver_id then raise exception 'Endast mottagaren kan acceptera'; end if;
    if t.status<>'pending' then raise exception 'Endast väntande förslag kan accepteras'; end if;
    select count(*) into locked_conflicts
      from public.trade_items ti join public.cards c on c.id=ti.card_id
      where ti.trade_id=t.id and c.locked_trade_id is not null and c.locked_trade_id<>t.id;
    if locked_conflicts>0 then raise exception 'Ett eller flera kort ingår redan i ett annat accepterat byte'; end if;
    update public.cards c set locked_trade_id=t.id
      where c.id in (select card_id from public.trade_items where trade_id=t.id);
    update public.trade_proposals set status='accepted' where id=t.id;
    insert into public.trade_fulfillment(trade_id) values(t.id) on conflict(trade_id) do nothing;
    -- Other still-pending proposals containing any now-locked card are cancelled.
    update public.trade_proposals p set status='cancelled'
      where p.status='pending' and p.id<>t.id and exists(
        select 1 from public.trade_items ti_other
        where ti_other.trade_id=p.id and ti_other.card_id in (select card_id from public.trade_items where trade_id=t.id)
      );
  elsif p_action='decline' then
    if auth.uid()<>t.receiver_id then raise exception 'Endast mottagaren kan neka'; end if;
    if t.status<>'pending' then raise exception 'Endast väntande förslag kan nekas'; end if;
    update public.trade_proposals set status='declined' where id=t.id;
  elsif p_action='cancel' then
    if t.status='pending' then
      if auth.uid()<>t.proposer_id then raise exception 'Endast avsändaren kan ta tillbaka förslaget'; end if;
      update public.trade_proposals set status='cancelled' where id=t.id;
    elsif t.status='accepted' then
      select (case when proposer_shipped_at is not null then 1 else 0 end)+(case when receiver_shipped_at is not null then 1 else 0 end)
        into shipped_count from public.trade_fulfillment where trade_id=t.id;
      if coalesce(shipped_count,0)>0 then raise exception 'Bytet kan inte avbrytas efter att någon markerat skickat'; end if;
      update public.cards set locked_trade_id=null where locked_trade_id=t.id;
      update public.trade_proposals set status='cancelled' where id=t.id;
    else
      raise exception 'Bytet kan inte avbrytas i nuvarande status';
    end if;
  else
    raise exception 'Okänd åtgärd';
  end if;
end; $$;

create or replace function public.mark_trade_delivery(p_trade_id uuid, p_action text, p_tracking text default null)
returns void language plpgsql security definer set search_path=public as $$
declare
  t public.trade_proposals%rowtype;
  f public.trade_fulfillment%rowtype;
begin
  select * into t from public.trade_proposals where id=p_trade_id for update;
  if t.id is null or t.status<>'accepted' then raise exception 'Bytet är inte aktivt'; end if;
  if auth.uid() is null or auth.uid() not in (t.proposer_id,t.receiver_id) then raise exception 'Du deltar inte i bytet'; end if;
  insert into public.trade_fulfillment(trade_id) values(t.id) on conflict(trade_id) do nothing;
  select * into f from public.trade_fulfillment where trade_id=t.id for update;

  if p_action='shipped' then
    if auth.uid()=t.proposer_id then
      if f.proposer_shipped_at is not null then raise exception 'Redan markerat skickat'; end if;
      update public.trade_fulfillment set proposer_shipped_at=now(),tracking_proposer=nullif(left(trim(coalesce(p_tracking,'')),120),''),updated_at=now() where trade_id=t.id;
    else
      if f.receiver_shipped_at is not null then raise exception 'Redan markerat skickat'; end if;
      update public.trade_fulfillment set receiver_shipped_at=now(),tracking_receiver=nullif(left(trim(coalesce(p_tracking,'')),120),''),updated_at=now() where trade_id=t.id;
    end if;
  elsif p_action='received' then
    if auth.uid()=t.proposer_id then
      if f.receiver_shipped_at is null then raise exception 'Motparten har inte markerat skickat ännu'; end if;
      update public.trade_fulfillment set proposer_received_at=coalesce(proposer_received_at,now()),updated_at=now() where trade_id=t.id;
    else
      if f.proposer_shipped_at is null then raise exception 'Motparten har inte markerat skickat ännu'; end if;
      update public.trade_fulfillment set receiver_received_at=coalesce(receiver_received_at,now()),updated_at=now() where trade_id=t.id;
    end if;
  else
    raise exception 'Okänd leveransåtgärd';
  end if;

  select * into f from public.trade_fulfillment where trade_id=t.id;
  if f.proposer_received_at is not null and f.receiver_received_at is not null then
    update public.trade_proposals set status='completed' where id=t.id;
    update public.cards set is_active=false,locked_trade_id=null where locked_trade_id=t.id;
  end if;
end; $$;

create or replace function public.set_review_subject() returns trigger language plpgsql security definer set search_path=public as $$
declare t public.trade_proposals%rowtype;
begin
  select * into t from public.trade_proposals where id=new.trade_id;
  if t.status<>'completed' then raise exception 'Omdöme kan bara lämnas efter genomfört byte'; end if;
  if new.author_id=t.proposer_id then new.subject_id:=t.receiver_id;
  elsif new.author_id=t.receiver_id then new.subject_id:=t.proposer_id;
  else raise exception 'Du deltar inte i bytet'; end if;
  return new;
end; $$;
drop trigger if exists trade_review_subject on public.trade_reviews;
create trigger trade_review_subject before insert on public.trade_reviews for each row execute function public.set_review_subject();

create or replace function public.notify_trade_status() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status is distinct from old.status then
    insert into public.notifications(user_id,type,title,body,trade_id)
    values(
      case when auth.uid()=new.proposer_id then new.receiver_id else new.proposer_id end,
      'trade_status','Bytet har uppdaterats','Ny status: '||new.status,new.id
    );
  end if;
  return new;
end; $$;
drop trigger if exists on_trade_status_notify on public.trade_proposals;
create trigger on_trade_status_notify after update of status on public.trade_proposals for each row execute function public.notify_trade_status();


-- v0.6 profiles & trust. Trust fields are database-owned, not user-editable.
-- Signed-out users do not need access to personal profile details in the current app.
drop policy if exists "profiles visible" on public.profiles;
create policy "profiles authenticated read" on public.profiles for select to authenticated using (true);
drop policy if exists "profile own update" on public.profiles;

revoke update on table public.profiles from anon, authenticated;
revoke select on table public.profiles from anon;
grant select on table public.profiles to authenticated;

create or replace function public.update_my_profile(p_display_name text, p_city text default null, p_country_code text default 'SE')
returns void language plpgsql security definer set search_path=public as $$
declare uid uuid := auth.uid(); clean_name text; clean_city text; clean_country text;
begin
  if uid is null then raise exception 'Du måste vara inloggad'; end if;
  clean_name := left(trim(coalesce(p_display_name,'')),50);
  if char_length(clean_name) < 2 then raise exception 'Visningsnamnet måste vara minst 2 tecken'; end if;
  clean_city := nullif(left(trim(coalesce(p_city,'')),80),'');
  clean_country := upper(left(trim(coalesce(p_country_code,'SE')),2));
  if char_length(clean_country) <> 2 then raise exception 'Landkod måste bestå av 2 tecken'; end if;
  update public.profiles set display_name=clean_name,city=clean_city,country_code=clean_country where id=uid;
end; $$;
revoke all on function public.update_my_profile(text,text,text) from public, anon;
grant execute on function public.update_my_profile(text,text,text) to authenticated;

create or replace function public.recalculate_profile_trust(p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare completed_count integer; avg_rating numeric(3,2);
begin
  select count(*) into completed_count from public.trade_proposals
    where status='completed' and (proposer_id=p_user_id or receiver_id=p_user_id);
  select round(avg(rating)::numeric,2) into avg_rating from public.trade_reviews where subject_id=p_user_id;
  update public.profiles set trade_count=coalesce(completed_count,0), rating=avg_rating where id=p_user_id;
end; $$;
revoke all on function public.recalculate_profile_trust(uuid) from public, anon, authenticated;

create or replace function public.refresh_trust_after_trade() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status is distinct from old.status and (new.status='completed' or old.status='completed') then
    perform public.recalculate_profile_trust(new.proposer_id);
    perform public.recalculate_profile_trust(new.receiver_id);
  end if;
  return new;
end; $$;
drop trigger if exists refresh_trust_trade on public.trade_proposals;
create trigger refresh_trust_trade after update of status on public.trade_proposals for each row execute function public.refresh_trust_after_trade();

create or replace function public.refresh_trust_after_review() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='DELETE' then
    perform public.recalculate_profile_trust(old.subject_id);
    return old;
  else
    perform public.recalculate_profile_trust(new.subject_id);
    return new;
  end if;
end; $$;
drop trigger if exists refresh_trust_review on public.trade_reviews;
create trigger refresh_trust_review after insert or update or delete on public.trade_reviews for each row execute function public.refresh_trust_after_review();

-- Backfill current trust values when this upgrade is run.
do $$ declare r record; begin
  for r in select id from public.profiles loop perform public.recalculate_profile_trust(r.id); end loop;
end $$;

-- v0.6 hardening of exposed functions and review visibility.
drop policy if exists "trade reviews visible" on public.trade_reviews;
create policy "trade reviews authenticated read" on public.trade_reviews for select to authenticated using(true);
revoke select on table public.trade_reviews from anon;
grant select, insert on table public.trade_reviews to authenticated;

-- SECURITY DEFINER trigger helpers are internal only.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.enforce_free_card_limit() from public, anon, authenticated;
revoke all on function public.notify_trade_message() from public, anon, authenticated;
revoke all on function public.set_review_subject() from public, anon, authenticated;
revoke all on function public.notify_trade_status() from public, anon, authenticated;
revoke all on function public.refresh_trust_after_trade() from public, anon, authenticated;
revoke all on function public.refresh_trust_after_review() from public, anon, authenticated;

-- User-facing state transition RPCs remain available only to signed-in users.
revoke all on function public.transition_trade(uuid,text) from public, anon, authenticated;
grant execute on function public.transition_trade(uuid,text) to authenticated;
revoke all on function public.mark_trade_delivery(uuid,text,text) from public, anon, authenticated;
grant execute on function public.mark_trade_delivery(uuid,text,text) to authenticated;

-- v0.7 notification center
-- Notification payloads are database-owned. The client can only read its own rows
-- and set read_at on its own notifications.
drop policy if exists "own notifications read" on public.notifications;
create policy "own notifications read" on public.notifications for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists "own notifications update" on public.notifications;
drop policy if exists "own notifications mark read" on public.notifications;
create policy "own notifications mark read" on public.notifications for update to authenticated
  using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;
grant update(read_at) on table public.notifications to authenticated;

create or replace function public.notify_new_trade_proposal() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.notifications(user_id,type,title,body,trade_id)
  values(
    new.receiver_id,
    case when new.parent_trade_id is null then 'trade_proposal' else 'trade_counter' end,
    case when new.parent_trade_id is null then 'Nytt bytesförslag' else 'Nytt motbud' end,
    case when new.parent_trade_id is null then 'Du har fått ett nytt bytesförslag.' else 'Du har fått ett motbud på ett byte.' end,
    new.id
  );
  return new;
end; $$;
drop trigger if exists on_trade_proposal_notify on public.trade_proposals;
create trigger on_trade_proposal_notify after insert on public.trade_proposals for each row execute function public.notify_new_trade_proposal();

create or replace function public.notify_trade_delivery() returns trigger
language plpgsql security definer set search_path='' as $$
declare t public.trade_proposals%rowtype; recipient uuid; msg text;
begin
  select * into t from public.trade_proposals where id=new.trade_id;
  if t.id is null then return new; end if;

  if new.proposer_shipped_at is distinct from old.proposer_shipped_at and new.proposer_shipped_at is not null then
    recipient:=t.receiver_id; msg:='Motparten har markerat sina kort som skickade.';
  elsif new.receiver_shipped_at is distinct from old.receiver_shipped_at and new.receiver_shipped_at is not null then
    recipient:=t.proposer_id; msg:='Motparten har markerat sina kort som skickade.';
  elsif new.proposer_received_at is distinct from old.proposer_received_at and new.proposer_received_at is not null then
    recipient:=t.receiver_id; msg:='Motparten har bekräftat att korten är mottagna.';
  elsif new.receiver_received_at is distinct from old.receiver_received_at and new.receiver_received_at is not null then
    recipient:=t.proposer_id; msg:='Motparten har bekräftat att korten är mottagna.';
  end if;

  if recipient is not null then
    insert into public.notifications(user_id,type,title,body,trade_id)
    values(recipient,'trade_delivery','Leveransuppdatering',msg,new.trade_id);
  end if;
  return new;
end; $$;
drop trigger if exists on_trade_delivery_notify on public.trade_fulfillment;
create trigger on_trade_delivery_notify after update on public.trade_fulfillment for each row execute function public.notify_trade_delivery();

-- Replace older notification helper functions with a pinned empty search_path.
create or replace function public.notify_trade_message() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
  select case when t.proposer_id=new.sender_id then t.receiver_id else t.proposer_id end into recipient
  from public.trade_proposals t where t.id=new.trade_id and new.sender_id in (t.proposer_id,t.receiver_id);
  if recipient is not null then
    insert into public.notifications(user_id,type,title,body,trade_id)
    values(recipient,'trade_message','Nytt meddelande i ett byte',left(new.body,160),new.trade_id);
  end if;
  return new;
end; $$;

create or replace function public.notify_trade_status() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); recipient uuid; label text;
begin
  if new.status is distinct from old.status then
    if actor=new.proposer_id then recipient:=new.receiver_id;
    elsif actor=new.receiver_id then recipient:=new.proposer_id;
    else recipient:=null; end if;
    label := case new.status when 'accepted' then 'Accepterat' when 'declined' then 'Nekat' when 'cancelled' then 'Avbrutet' when 'completed' then 'Genomfört' when 'countered' then 'Motbud lämnat' else new.status end;
    if recipient is not null then
      insert into public.notifications(user_id,type,title,body,trade_id)
      values(recipient,'trade_status','Bytet har uppdaterats','Ny status: '||label,new.id);
    end if;
  end if;
  return new;
end; $$;

revoke all on function public.notify_new_trade_proposal() from public, anon, authenticated;
revoke all on function public.notify_trade_delivery() from public, anon, authenticated;
revoke all on function public.notify_trade_message() from public, anon, authenticated;
revoke all on function public.notify_trade_status() from public, anon, authenticated;


-- v0.8: Free/Plus. Själva bytet kostar alltid 0 kr.
alter table public.profiles add column if not exists plan_expires_at timestamptz;
alter table public.profiles add column if not exists billing_customer_id text;
alter table public.profiles add column if not exists billing_subscription_id text;
revoke update(plan, plan_expires_at, billing_customer_id, billing_subscription_id) on table public.profiles from authenticated;

create or replace function public.enforce_card_plan_limit()
returns trigger language plpgsql security invoker set search_path=public as $$
declare v_plan text; v_count integer;
begin
  if new.is_active is not true then return new; end if;
  select case when p.plan='plus' and (p.plan_expires_at is null or p.plan_expires_at>now()) then 'plus' else 'free' end
    into v_plan from public.profiles p where p.id=new.owner_id;
  if coalesce(v_plan,'free')='free' then
    select count(*) into v_count from public.cards c
      where c.owner_id=new.owner_id and c.is_active=true and (tg_op='INSERT' or c.id<>new.id);
    if v_count>=5 then raise exception 'FREE_CARD_LIMIT' using hint='Kortbyte Free tillåter högst 5 aktiva byteskort.'; end if;
  end if;
  return new;
end $$;
drop trigger if exists cards_plan_limit on public.cards;
create trigger cards_plan_limit before insert or update of is_active,owner_id on public.cards
for each row execute function public.enforce_card_plan_limit();

create or replace function public.enforce_wanted_plan_limit()
returns trigger language plpgsql security invoker set search_path=public as $$
declare v_plan text; v_count integer;
begin
  select case when p.plan='plus' and (p.plan_expires_at is null or p.plan_expires_at>now()) then 'plus' else 'free' end
    into v_plan from public.profiles p where p.id=new.user_id;
  if coalesce(v_plan,'free')='free' then
    select count(*) into v_count from public.wanted_cards w where w.user_id=new.user_id;
    if v_count>=10 then raise exception 'FREE_WANTED_LIMIT' using hint='Kortbyte Free tillåter högst 10 sökningar/bevakningar.'; end if;
  end if;
  return new;
end $$;
drop trigger if exists wanted_plan_limit on public.wanted_cards;
create trigger wanted_plan_limit before insert on public.wanted_cards
for each row execute function public.enforce_wanted_plan_limit();

revoke all on function public.enforce_card_plan_limit() from public,anon,authenticated;
revoke all on function public.enforce_wanted_plan_limit() from public,anon,authenticated;
create index if not exists profiles_plan_idx on public.profiles(plan);

-- v0.9 mutual matching
create or replace function public.find_mutual_matches(p_limit integer default 30)
returns table(other_user_id uuid,other_display_name text,their_card_id uuid,their_card_title text,my_card_id uuid,my_card_title text,my_want text,their_want text,mutual_score integer)
language sql security invoker set search_path=public as $$
with me as(select (select auth.uid()) uid),
mw as(select w.* from public.wanted_cards w,me where w.user_id=me.uid),
mc as(select c.* from public.cards c,me where c.owner_id=me.uid and c.is_active=true and c.locked_trade_id is null),
oc as(select c.* from public.cards c,me where c.owner_id<>me.uid and c.is_active=true and c.locked_trade_id is null),
ow as(select w.* from public.wanted_cards w,me where w.user_id<>me.uid)
select oc.owner_id,coalesce(p.display_name,'Samlare'),oc.id,oc.title,mc.id,mc.title,mw.query,ow.query,100
from mw join oc on lower(concat_ws(' ',oc.title,oc.category,oc.card_set,oc.card_year,oc.card_number,oc.variant)) like '%'||lower(mw.query)||'%'
join ow on ow.user_id=oc.owner_id
join mc on lower(concat_ws(' ',mc.title,mc.category,mc.card_set,mc.card_year,mc.card_number,mc.variant)) like '%'||lower(ow.query)||'%'
join public.profiles p on p.id=oc.owner_id
limit greatest(1,least(coalesce(p_limit,30),100)); $$;
revoke all on function public.find_mutual_matches(integer) from public,anon;
grant execute on function public.find_mutual_matches(integer) to authenticated;
