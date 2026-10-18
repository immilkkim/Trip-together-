-- ISOLATED TEST PROJECT ONLY. Additive, not a migration for the live family app.
begin;
create schema tt_spike;
revoke all on schema tt_spike from public;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'tt_spike_executor') then
    create role tt_spike_executor nologin nosuperuser nocreatedb nocreaterole noinherit;
  end if;
end $$;
grant usage on schema tt_spike, public to tt_spike_executor;
grant create on schema public,tt_spike to tt_spike_executor;

create table tt_spike.trips (
  id uuid primary key default gen_random_uuid(), name text not null,
  start_date date not null, end_date date not null, time_zone text not null,
  change_seq bigint not null default 0, check(end_date >= start_date)
);
create table tt_spike.members (
  id uuid primary key default gen_random_uuid(), trip_id uuid not null references tt_spike.trips,
  name text not null, is_leader boolean not null default false, active boolean not null default true,
  future_user_id uuid, unique(trip_id,id), unique(trip_id,name),
  check(char_length(name) between 1 and 24)
);
create table tt_spike.invites (
  id uuid primary key default gen_random_uuid(), trip_id uuid not null references tt_spike.trips,
  token_hash text not null unique, expires_at timestamptz not null, revoked_at timestamptz,
  unique(trip_id,id)
);
create table tt_spike.sessions (
  id uuid primary key default gen_random_uuid(), trip_id uuid not null,
  member_id uuid not null, invite_id uuid not null, token_hash text not null unique,
  expires_at timestamptz not null, revoked_at timestamptz,
  foreign key(trip_id,member_id) references tt_spike.members(trip_id,id),
  foreign key(trip_id,invite_id) references tt_spike.invites(trip_id,id)
);
create table tt_spike.events (
  id uuid primary key default gen_random_uuid(), trip_id uuid not null references tt_spike.trips,
  title text not null check(char_length(title) between 1 and 200),
  starts_at timestamptz not null, ends_at timestamptz not null,
  time_zone text not null, created_by_member_id uuid not null, version integer not null default 1,
  check(ends_at > starts_at), unique(trip_id,id),
  foreign key(trip_id,created_by_member_id) references tt_spike.members(trip_id,id)
);
create index on tt_spike.events(trip_id, starts_at, ends_at);
create table tt_spike.participants (
  trip_id uuid not null, event_id uuid not null, member_id uuid not null,
  primary key(event_id,member_id),
  foreign key(trip_id,event_id) references tt_spike.events(trip_id,id),
  foreign key(trip_id,member_id) references tt_spike.members(trip_id,id)
);
create table tt_spike.receipts (
  trip_id uuid not null, session_id uuid not null references tt_spike.sessions,
  request_key uuid not null, request_body jsonb not null, event_id uuid not null,
  primary key(trip_id,session_id,request_key),
  foreign key(trip_id,event_id) references tt_spike.events(trip_id,id)
);

grant select,insert,update,delete on all tables in schema tt_spike to tt_spike_executor;
revoke all on all tables in schema tt_spike from public,anon,authenticated;
-- Defense in depth: no public table API; only the narrowly granted guarded RPCs.
alter table tt_spike.trips enable row level security;
alter table tt_spike.members enable row level security;
alter table tt_spike.invites enable row level security;
alter table tt_spike.sessions enable row level security;
alter table tt_spike.events enable row level security;
alter table tt_spike.participants enable row level security;
alter table tt_spike.receipts enable row level security;
create policy executor_only on tt_spike.trips to tt_spike_executor using(true) with check(true);
create policy executor_only on tt_spike.members to tt_spike_executor using(true) with check(true);
create policy executor_only on tt_spike.invites to tt_spike_executor using(true) with check(true);
create policy executor_only on tt_spike.sessions to tt_spike_executor using(true) with check(true);
create policy executor_only on tt_spike.events to tt_spike_executor using(true) with check(true);
create policy executor_only on tt_spike.participants to tt_spike_executor using(true) with check(true);
create policy executor_only on tt_spike.receipts to tt_spike_executor using(true) with check(true);

create function tt_spike.hash_token(p_token text) returns text
language sql immutable set search_path='' as $$
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_token,'UTF8')),'hex')
$$;
create function tt_spike.guard(p_guest_token text) returns tt_spike.sessions
language plpgsql set search_path='' as $$
declare s tt_spike.sessions;
begin
  select x.* into s from tt_spike.sessions x
    join tt_spike.invites i on i.id=x.invite_id and i.trip_id=x.trip_id
    join tt_spike.members m on m.id=x.member_id and m.trip_id=x.trip_id
    where x.token_hash=tt_spike.hash_token(p_guest_token)
    and x.revoked_at is null and x.expires_at>now()
    and i.revoked_at is null and i.expires_at>now() and m.active;
  if not found then raise exception 'SESSION_EXPIRED'; end if;
  return s;
end $$;

create function public.tt_guest_open(p_invite_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t tt_spike.trips; member_list jsonb;
begin
  if length(p_invite_token) not between 32 and 256 then raise exception 'INVALID_INVITE'; end if;
  select tr.* into t from tt_spike.invites i join tt_spike.trips tr on tr.id=i.trip_id
    where i.token_hash=tt_spike.hash_token(p_invite_token) and i.revoked_at is null and i.expires_at>now();
  if not found then raise exception 'INVALID_INVITE'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'isLeader',is_leader) order by name),'[]')
    into member_list from tt_spike.members where trip_id=t.id and active;
  return jsonb_build_object('trip',jsonb_build_object('id',t.id,'name',t.name,'startDate',t.start_date,'endDate',t.end_date,'timeZone',t.time_zone,'changeSeq',t.change_seq),'members',member_list);
end $$;

create function public.tt_guest_join(p_invite_token text,p_member_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i tt_spike.invites; token text; sid uuid; expiry timestamptz;
begin
  if length(p_invite_token) not between 32 and 256 then raise exception 'INVALID_INVITE'; end if;
  select * into i from tt_spike.invites where token_hash=tt_spike.hash_token(p_invite_token);
  if not found then raise exception 'INVALID_INVITE'; end if;
  perform 1 from tt_spike.trips where id=i.trip_id for update;
  -- Re-read revocation/expiry after acquiring the trip write lock.
  select * into i from tt_spike.invites where id=i.id and revoked_at is null and expires_at>now();
  if not found then raise exception 'INVALID_INVITE'; end if;
  if not exists(select 1 from tt_spike.members where trip_id=i.trip_id and id=p_member_id and active) then raise exception 'INVALID_MEMBERS'; end if;
  if (select count(*) from tt_spike.sessions where member_id=p_member_id and revoked_at is null and expires_at>now()) >=10 then raise exception 'TOO_MANY_SESSIONS'; end if;
  token=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  expiry=least(now()+interval '7 days',i.expires_at);
  insert into tt_spike.sessions(trip_id,member_id,invite_id,token_hash,expires_at)
    values(i.trip_id,p_member_id,i.id,tt_spike.hash_token(token),expiry) returning id into sid;
  return jsonb_build_object('guestToken',token,'sessionId',sid,'memberId',p_member_id,'expiresAt',expiry);
end $$;

create function public.tt_guest_snapshot(p_guest_token text,p_date date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s tt_spike.sessions; t tt_spike.trips; event_list jsonb; member_list jsonb;
begin
  s=tt_spike.guard(p_guest_token);
  perform 1 from tt_spike.trips where id=s.trip_id for share;
  s=tt_spike.guard(p_guest_token);
  select * into t from tt_spike.trips where id=s.trip_id;
  if p_date is null or p_date<t.start_date or p_date>t.end_date then raise exception 'OUTSIDE_TRIP_RANGE'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'startsAt',e.starts_at,'endsAt',e.ends_at,'timeZone',e.time_zone,'version',e.version,
    'memberIds',(select coalesce(jsonb_agg(p.member_id order by p.member_id),'[]') from tt_spike.participants p where p.event_id=e.id)) order by e.starts_at,e.id),'[]')
    into event_list from tt_spike.events e where e.trip_id=s.trip_id
    and e.starts_at<((p_date+1)::timestamp at time zone t.time_zone)
    and e.ends_at>(p_date::timestamp at time zone t.time_zone);
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'isLeader',is_leader) order by name),'[]')
    into member_list from tt_spike.members where trip_id=t.id and active;
  return jsonb_build_object('events',event_list,'members',member_list,'changeSeq',t.change_seq);
end $$;

create function public.tt_guest_create_event(p_guest_token text,p_request_key uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s tt_spike.sessions; t tt_spike.trips; old tt_spike.receipts;
  start_at timestamptz; end_at timestamptz; title_value text; zone text; ids uuid[]; eid uuid;
begin
  s=tt_spike.guard(p_guest_token);
  perform 1 from tt_spike.trips where id=s.trip_id for update;
  s=tt_spike.guard(p_guest_token);
  select * into t from tt_spike.trips where id=s.trip_id;
  if p_request_key is null then raise exception 'INVALID_REQUEST_KEY'; end if;
  select * into old from tt_spike.receipts where trip_id=s.trip_id and session_id=s.id and request_key=p_request_key;
  if found then
    if old.request_body is distinct from p_request then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if;
    return jsonb_build_object('eventId',old.event_id,'replayed',true,'changeSeq',t.change_seq);
  end if;
  title_value=btrim(p_request->>'title');
  if title_value is null or char_length(title_value) not between 1 and 200 then raise exception 'INVALID_TITLE'; end if;
  if coalesce(p_request->>'startsAt','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
    or coalesce(p_request->>'endsAt','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'INVALID_RANGE'; end if;
  begin
    start_at=(p_request->>'startsAt')::timestamptz; end_at=(p_request->>'endsAt')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then raise exception 'INVALID_RANGE'; end;
  if start_at is null or end_at is null or not isfinite(start_at) or not isfinite(end_at) or end_at<=start_at then raise exception 'INVALID_RANGE'; end if;
  zone=p_request->>'timeZone';
  if zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) then raise exception 'INVALID_TIME_ZONE'; end if;
  if start_at<(t.start_date::timestamp at time zone t.time_zone) or end_at>= 'infinity'::timestamptz
    or end_at>((t.end_date+1)::timestamp at time zone t.time_zone) then raise exception 'OUTSIDE_TRIP_RANGE'; end if;
  if jsonb_typeof(p_request->'memberIds') is distinct from 'array' or jsonb_array_length(p_request->'memberIds') not between 1 and 100 then raise exception 'INVALID_MEMBERS'; end if;
  begin
    select array_agg(distinct x::uuid) into ids from jsonb_array_elements_text(p_request->'memberIds') x;
  exception when invalid_text_representation then raise exception 'INVALID_MEMBERS'; end;
  if array_length(ids,1) is null or exists(select 1 from unnest(ids) x where x is null) or
    (select count(*) from tt_spike.members where trip_id=s.trip_id and active and id=any(ids))<>array_length(ids,1) then raise exception 'INVALID_MEMBERS'; end if;
  if exists(select 1 from tt_spike.events e join tt_spike.participants p on p.event_id=e.id
    where e.trip_id=s.trip_id and p.member_id=any(ids) and e.starts_at<end_at and e.ends_at>start_at) then raise exception 'SCHEDULE_CONFLICT'; end if;
  insert into tt_spike.events(trip_id,title,starts_at,ends_at,time_zone,created_by_member_id)
    values(s.trip_id,title_value,start_at,end_at,zone,s.member_id) returning id into eid;
  insert into tt_spike.participants(trip_id,event_id,member_id) select s.trip_id,eid,x from unnest(ids) x;
  insert into tt_spike.receipts values(s.trip_id,s.id,p_request_key,p_request,eid);
  update tt_spike.trips set change_seq=change_seq+1 where id=s.trip_id returning change_seq into t.change_seq;
  return jsonb_build_object('eventId',eid,'replayed',false,'changeSeq',t.change_seq);
end $$;

create function public.tt_guest_leave(p_guest_token text) returns void
language plpgsql security definer set search_path='' as $$
declare s tt_spike.sessions;
begin
  s=tt_spike.guard(p_guest_token);
  perform 1 from tt_spike.trips where id=s.trip_id for update;
  update tt_spike.sessions set revoked_at=now() where id=s.id;
end $$;

-- Helpers execute as the already restricted executor, never callable as anon.
alter function tt_spike.hash_token(text) owner to tt_spike_executor;
alter function tt_spike.guard(text) owner to tt_spike_executor;
revoke all on all functions in schema tt_spike from public,anon,authenticated;
alter function public.tt_guest_open(text) owner to tt_spike_executor;
alter function public.tt_guest_join(text,uuid) owner to tt_spike_executor;
alter function public.tt_guest_snapshot(text,date) owner to tt_spike_executor;
alter function public.tt_guest_create_event(text,uuid,jsonb) owner to tt_spike_executor;
alter function public.tt_guest_leave(text) owner to tt_spike_executor;
revoke all on function public.tt_guest_open(text),public.tt_guest_join(text,uuid),public.tt_guest_snapshot(text,date),public.tt_guest_create_event(text,uuid,jsonb),public.tt_guest_leave(text) from public,anon,authenticated;
grant execute on function public.tt_guest_open(text),public.tt_guest_join(text,uuid),public.tt_guest_snapshot(text,date),public.tt_guest_create_event(text,uuid,jsonb),public.tt_guest_leave(text) to anon;
revoke create on schema public,tt_spike from tt_spike_executor;
commit;
