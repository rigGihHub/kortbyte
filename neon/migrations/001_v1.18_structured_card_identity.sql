-- Kortbyte v1.18
-- Kör denna migration innan v1.18 används mot Neon.

alter table cards add column if not exists player_name text;
alter table cards add column if not exists card_number text;
alter table cards add column if not exists parallel text;
alter table cards add column if not exists serial_number text;
alter table cards add column if not exists grading_company text;
alter table cards add column if not exists grade numeric;

alter table wanted_cards add column if not exists player_name text;
alter table wanted_cards add column if not exists card_year text;
alter table wanted_cards add column if not exists card_set text;
alter table wanted_cards add column if not exists card_number text;
alter table wanted_cards add column if not exists parallel text;

create index if not exists cards_identity_idx
  on cards(is_active,category,player_name,card_year,card_set,card_number);

create index if not exists wanted_identity_idx
  on wanted_cards(user_id,category,player_name,card_year,card_set,card_number);
