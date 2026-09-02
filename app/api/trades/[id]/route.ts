import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{id:string}> }) {
  const user=await requireUser(); if(!user) return NextResponse.json({error:'Inte inloggad'},{status:401});
  const {id}=await params; const body=await req.json(); const action=String(body.action||''); const sql=db();
  const [trade]=await sql`select * from trade_proposals where id=${id} and (proposer_id=${user.id} or receiver_id=${user.id})`;
  if(!trade) return NextResponse.json({error:'Bytet hittades inte.'},{status:404});

  if(action==='accept'){
    if(trade.receiver_id!==user.id || trade.status!=='pending') return NextResponse.json({error:'Förslaget kan inte accepteras.'},{status:409});
    const conflicts=await sql`select c.id from trade_items ti join cards c on c.id=ti.card_id where ti.trade_id=${id} and (c.is_active=false or (c.locked_trade_id is not null and c.locked_trade_id<>${id}::uuid))`;
    if(conflicts.length) return NextResponse.json({error:'Ett av korten är inte längre tillgängligt.'},{status:409});
    await sql`update trade_proposals set status='accepted' where id=${id} and status='pending'`;
    await sql`update cards set locked_trade_id=${id} where id in (select card_id from trade_items where trade_id=${id})`;
    await sql`insert into trade_fulfillment(trade_id) values (${id}) on conflict (trade_id) do nothing`;
  } else if(action==='counter'){
    if(trade.receiver_id!==user.id || trade.status!=='pending') return NextResponse.json({error:'Motbud kan inte skickas nu.'},{status:409});
    const items=await sql`select ti.card_id,ti.side,c.owner_id from trade_items ti join cards c on c.id=ti.card_id where ti.trade_id=${id}`;
    const note=String(body.note||'Motbud').trim().slice(0,500);
    const [counter]=await sql`insert into trade_proposals(proposer_id,receiver_id,status,note,parent_trade_id) values (${user.id},${trade.proposer_id},'pending',${note||'Motbud'},${id}) returning id`;
    for(const item of items){ const side=item.side==='offered'?'requested':'offered'; await sql`insert into trade_items(trade_id,card_id,side) values (${counter.id},${item.card_id},${side})`; }
    await sql`update trade_proposals set status='countered' where id=${id}`;
  } else if(action==='decline'){
    if(trade.receiver_id!==user.id || trade.status!=='pending') return NextResponse.json({error:'Förslaget kan inte avböjas.'},{status:409});
    await sql`update trade_proposals set status='declined' where id=${id}`;
  } else if(action==='cancel'){
    if(trade.proposer_id!==user.id || trade.status!=='pending') return NextResponse.json({error:'Förslaget kan inte dras tillbaka.'},{status:409});
    await sql`update trade_proposals set status='cancelled' where id=${id}`;
  } else if(action==='shipped'){
    if(trade.status!=='accepted') return NextResponse.json({error:'Bytet måste vara accepterat först.'},{status:409});
    await sql`insert into trade_fulfillment(trade_id) values (${id}) on conflict (trade_id) do nothing`;
    if(trade.proposer_id===user.id) await sql`update trade_fulfillment set proposer_shipped_at=coalesce(proposer_shipped_at,now()),tracking_proposer=${body.tracking||null},updated_at=now() where trade_id=${id}`;
    else await sql`update trade_fulfillment set receiver_shipped_at=coalesce(receiver_shipped_at,now()),tracking_receiver=${body.tracking||null},updated_at=now() where trade_id=${id}`;
  } else if(action==='received'){
    if(trade.status!=='accepted') return NextResponse.json({error:'Bytet måste vara accepterat först.'},{status:409});
    await sql`insert into trade_fulfillment(trade_id) values (${id}) on conflict (trade_id) do nothing`;
    if(trade.proposer_id===user.id) await sql`update trade_fulfillment set proposer_received_at=coalesce(proposer_received_at,now()),updated_at=now() where trade_id=${id}`;
    else await sql`update trade_fulfillment set receiver_received_at=coalesce(receiver_received_at,now()),updated_at=now() where trade_id=${id}`;
    const [f]=await sql`select * from trade_fulfillment where trade_id=${id}`;
    if(f?.proposer_received_at && f?.receiver_received_at){
      await sql`update trade_proposals set status='completed' where id=${id}`;
      await sql`update cards set is_active=false,locked_trade_id=null where id in (select card_id from trade_items where trade_id=${id})`;
    }
  } else return NextResponse.json({error:'Okänd åtgärd.'},{status:400});
  return NextResponse.json({ok:true});
}
