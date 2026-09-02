create extension if not exists pgcrypto;

create table if not exists profiles (
  user_id text primary key,
  display_name text not null,
  city text,
  country_code text not null default 'SE',
  plan text not null default 'free' check (plan in ('free','plus')),
  created_at timestamptz not null default now()
);

create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references profiles(user_id) on delete cascade,
  title text not null,
  card_set text,
  card_year text,
  category text not null default 'Övrigt',
  estimated_value_sek numeric,
  image_url text,
  is_active boolean not null default true,
  locked_trade_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists cards_owner_active_idx on cards(owner_id,is_active,created_at desc);
create index if not exists cards_market_idx on cards(is_active,category,created_at desc);

create table if not exists wanted_cards (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references profiles(user_id) on delete cascade,
  query text not null,
  category text,
  created_at timestamptz not null default now()
);
create index if not exists wanted_user_idx on wanted_cards(user_id,created_at desc);

create table if not exists trade_proposals (
  id uuid primary key default gen_random_uuid(),
  proposer_id text not null references profiles(user_id),
  receiver_id text not null references profiles(user_id),
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled','completed','countered')),
  note text,
  parent_trade_id uuid references trade_proposals(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table cards drop constraint if exists cards_locked_trade_id_fkey;
alter table cards add constraint cards_locked_trade_id_fkey foreign key (locked_trade_id) references trade_proposals(id) on delete set null;

create table if not exists trade_items (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references trade_proposals(id) on delete cascade,
  card_id uuid not null references cards(id),
  side text not null check (side in ('offered','requested')),
  unique(trade_id,card_id)
);
create index if not exists trade_items_trade_idx on trade_items(trade_id);

create table if not exists trade_messages (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references trade_proposals(id) on delete cascade,
  sender_id text not null references profiles(user_id),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table if not exists trade_fulfillment (
  trade_id uuid primary key references trade_proposals(id) on delete cascade,
  proposer_shipped_at timestamptz,
  receiver_shipped_at timestamptz,
  proposer_received_at timestamptz,
  receiver_received_at timestamptz,
  tracking_proposer text,
  tracking_receiver text,
  updated_at timestamptz not null default now()
);

create table if not exists trade_reviews (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references trade_proposals(id) on delete cascade,
  author_id text not null references profiles(user_id),
  subject_id text not null references profiles(user_id),
  rating integer not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  unique(trade_id,author_id)
);

-- v1.0 accesses application tables only from authenticated Next.js server routes.
-- Do not expose DATABASE_URL in browser code.
