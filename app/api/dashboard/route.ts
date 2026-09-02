import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Inte inloggad' }, { status: 401 });
  const sql = db();
  await sql`insert into profiles (user_id, display_name) values (${user.id}, ${user.name || user.email || 'Samlare'}) on conflict (user_id) do nothing`;

  const [profile] = await sql`select user_id,display_name,city,country_code,plan,created_at from profiles where user_id=${user.id}`;
  const cards = await sql`select * from cards where owner_id=${user.id} order by created_at desc`;
  const wanted = await sql`select * from wanted_cards where user_id=${user.id} order by created_at desc`;
  const matches = await sql`
    with my_wants as (
      select id, query, category from wanted_cards where user_id=${user.id}
    ), candidates as (
      select c.*, p.display_name as owner_name, w.id as wanted_id, w.query as wanted_query,
        case when lower(c.title || ' ' || coalesce(c.card_set,'') || ' ' || coalesce(c.card_year,'')) like '%' || lower(w.query) || '%' then 96
             when w.category is not null and w.category=c.category then 72 else 48 end as score
      from cards c join profiles p on p.user_id=c.owner_id cross join my_wants w
      where c.owner_id<>${user.id} and c.is_active=true and c.locked_trade_id is null
        and (lower(c.title || ' ' || coalesce(c.card_set,'') || ' ' || coalesce(c.card_year,'')) like '%' || lower(w.query) || '%' or (w.category is not null and w.category=c.category))
    ), mutual as (
      select cand.*,
        exists(
          select 1 from wanted_cards ow join cards mine on mine.owner_id=${user.id} and mine.is_active=true and mine.locked_trade_id is null
          where ow.user_id=cand.owner_id
            and lower(mine.title || ' ' || coalesce(mine.card_set,'') || ' ' || coalesce(mine.card_year,'')) like '%' || lower(ow.query) || '%'
        ) as is_mutual
      from candidates cand
    )
    select *, least(99, score + case when is_mutual then 3 else 0 end) as match_score
    from mutual order by is_mutual desc, match_score desc limit 30`;
  const trades = await sql`
    select t.*, case when t.proposer_id=${user.id} then pr.display_name else pp.display_name end as other_name
    from trade_proposals t
    join profiles pp on pp.user_id=t.proposer_id
    join profiles pr on pr.user_id=t.receiver_id
    where t.proposer_id=${user.id} or t.receiver_id=${user.id}
    order by t.created_at desc limit 50`;

  return NextResponse.json({ profile, cards, wanted, matches, trades });
}
