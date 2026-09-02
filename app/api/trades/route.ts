import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';

export async function POST(req: NextRequest) {
  const user=await requireUser();
  if(!user) return NextResponse.json({error:'Inte inloggad'},{status:401});
  const body=await req.json();
  const requestedCardId=String(body.requested_card_id||'');
  const offered=Array.isArray(body.offered_card_ids)?body.offered_card_ids.map(String):[];
  if(!requestedCardId || !offered.length) return NextResponse.json({error:'Välj minst ett eget kort och ett önskat kort.'},{status:400});
  const sql=db();
  const [target]=await sql`select id,owner_id from cards where id=${requestedCardId} and owner_id<>${user.id} and is_active=true and locked_trade_id is null`;
  if(!target) return NextResponse.json({error:'Kortet är inte längre tillgängligt.'},{status:409});
  const valid=await sql`select id from cards where id=any(${offered}::uuid[]) and owner_id=${user.id} and is_active=true and locked_trade_id is null`;
  if(valid.length!==offered.length) return NextResponse.json({error:'Ett av dina valda kort är inte tillgängligt.'},{status:409});
  const [trade]=await sql`insert into trade_proposals(proposer_id,receiver_id,note) values (${user.id},${target.owner_id},${String(body.note||'').slice(0,500)||null}) returning *`;
  for(const row of valid) await sql`insert into trade_items(trade_id,card_id,side) values (${trade.id},${row.id},'offered')`;
  await sql`insert into trade_items(trade_id,card_id,side) values (${trade.id},${requestedCardId},'requested')`;
  return NextResponse.json(trade);
}
