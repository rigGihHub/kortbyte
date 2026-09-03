import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error:'Inte inloggad' }, { status:401 });
  const body = await req.json();
  const query = String(body.query || '').trim();
  if (!query) return NextResponse.json({ error:'Sökning saknas' }, { status:400 });
  const sql=db();
  const [p]=await sql`select plan from profiles where user_id=${user.id}`;
  const [{count}]=await sql`select count(*)::int as count from wanted_cards where user_id=${user.id}`;
  if ((p?.plan ?? 'free')==='free' && Number(count)>=10) return NextResponse.json({error:'Gratisplanen tillåter 10 sökningar.'},{status:403});
  const clean=(value:unknown,max=160)=>{
    const v=typeof value==='string'?value.trim():'';
    return v?v.slice(0,max):null;
  };
  const [item]=await sql`
    insert into wanted_cards(
      user_id,query,category,player_name,card_year,card_set,card_number,parallel
    ) values (
      ${user.id},${query},${body.category||null},${clean(body.player_name,120)},
      ${clean(body.card_year,20)},${clean(body.card_set)},${clean(body.card_number,40)},
      ${clean(body.parallel,100)}
    ) returning *`;
  return NextResponse.json(item);
}

export async function DELETE(req: NextRequest) {
  const user=await requireUser();
  if(!user) return NextResponse.json({error:'Inte inloggad'},{status:401});
  const id=new URL(req.url).searchParams.get('id');
  if(!id) return NextResponse.json({error:'ID saknas'},{status:400});
  await db()`delete from wanted_cards where id=${id} and user_id=${user.id}`;
  return NextResponse.json({ok:true});
}
