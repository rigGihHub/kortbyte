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
  const imageUrl = typeof body.image_url==='string' && body.image_url.startsWith('https://') ? body.image_url : null;
  const clean=(value:unknown,max=160)=>{
    const v=typeof value==='string'?value.trim():'';
    return v?v.slice(0,max):null;
  };
  const grade=body.grade===''||body.grade==null?null:Number(body.grade);
  if(grade!==null && (!Number.isFinite(grade)||grade<0||grade>10)){
    return NextResponse.json({error:'Graderingsbetyget måste vara mellan 0 och 10.'},{status:400});
  }
  const [card] = await sql`
    insert into cards(
      owner_id,title,player_name,category,card_set,card_year,card_number,parallel,
      serial_number,grading_company,grade,estimated_value_sek,image_url
    ) values (
      ${user.id},${title},${clean(body.player_name,120)},${String(body.category||'Övrigt')},
      ${clean(body.card_set)},${clean(body.card_year,20)},${clean(body.card_number,40)},
      ${clean(body.parallel,100)},${clean(body.serial_number,40)},${clean(body.grading_company,40)},
      ${grade},${body.estimated_value_sek ? Number(body.estimated_value_sek):null},${imageUrl}
    ) returning *`;
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
