import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error:'Inte inloggad' }, { status:401 });
  const body = await req.json();
  const title = String(body.title || '').trim();
  if (!title) return NextResponse.json({ error:'Kortnamn saknas' }, { status:400 });
  const sql = db();
  const [p] = await sql`select plan from profiles where user_id=${user.id}`;
  const [{ count }] = await sql`select count(*)::int as count from cards where owner_id=${user.id} and is_active=true`;
  if ((p?.plan ?? 'free')==='free' && Number(count)>=5) return NextResponse.json({ error:'Gratisplanen tillåter 5 aktiva kort.' }, {status:403});
  const [card] = await sql`insert into cards(owner_id,title,category,card_set,card_year,estimated_value_sek) values (${user.id},${title},${String(body.category||'Övrigt')},${body.card_set||null},${body.card_year||null},${body.estimated_value_sek ? Number(body.estimated_value_sek):null}) returning *`;
  return NextResponse.json(card);
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error:'Inte inloggad' }, { status:401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error:'ID saknas' }, { status:400 });
  await db()`delete from cards where id=${id} and owner_id=${user.id} and locked_trade_id is null`;
  return NextResponse.json({ ok:true });
}
