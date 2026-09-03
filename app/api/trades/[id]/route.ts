import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{id:string}> }) {
  const user=await requireUser(); if(!user) return NextResponse.json({error:'Inte inloggad'},{status:401});
  const {id}=await params; const body=await req.json(); const action=String(body.action||''); const sql=db();
  const [trade]=await sql`select * from trade_proposals where id=${id} and (proposer_id=${user.id} or receiver_id=${user.id})`;
  if(!trade) return NextResponse.json({error:'Bytet hittades inte.'},{status:404});

  if(action==='accept'){
    if(trade.receiver_id!==user.id || trade.status!=='pending'){
      return NextResponse.json({error:'Förslaget kan inte accepteras.'},{status:409});
    }

    const accepted=await sql`
      with locked_trade as (
        select tp.id,tp.proposer_id,tp.receiver_id
        from trade_proposals tp
        where tp.id=${id}
          and tp.receiver_id=${user.id}
          and tp.status='pending'
        for update
      ),
      locked_cards as (
        select c.id,c.owner_id,c.is_active,c.locked_trade_id,ti.side
        from trade_items ti
        join cards c on c.id=ti.card_id
        join locked_trade lt on lt.id=ti.trade_id
        where ti.trade_id=${id}
        for update of c
      ),
      validation as (
        select
          count(*)::int as item_count,
          count(*) filter (
            where lc.is_active=true
              and (lc.locked_trade_id is null or lc.locked_trade_id=${id}::uuid)
              and (
                (lc.side='offered' and lc.owner_id=lt.proposer_id)
                or
                (lc.side='requested' and lc.owner_id=lt.receiver_id)
              )
          )::int as valid_count
        from locked_cards lc
        cross join locked_trade lt
      ),
      accepted_trade as (
        update trade_proposals tp
        set status='accepted'
        from locked_trade lt,validation v
        where tp.id=lt.id
          and v.item_count>0
          and v.item_count=v.valid_count
        returning tp.id
      ),
      card_locks as (
        update cards c
        set locked_trade_id=${id}
        where exists (
          select 1
          from trade_items ti
          join accepted_trade at on at.id=ti.trade_id
          where ti.card_id=c.id
        )
        returning c.id
      ),
      fulfillment as (
        insert into trade_fulfillment(trade_id)
        select id from accepted_trade
        on conflict (trade_id) do nothing
        returning trade_id
      ),
      cancelled_competing as (
        update trade_proposals tp
        set status='cancelled'
        where tp.id<>${id}
          and tp.status='pending'
          and exists (
            select 1
            from trade_items other_item
            where other_item.trade_id=tp.id
              and other_item.card_id in (
                select cl.id from card_locks cl
              )
          )
        returning tp.id
      )
      select
        (select count(*)::int from accepted_trade) as accepted_count,
        (select count(*)::int from card_locks) as locked_count,
        (select count(*)::int from locked_cards) as expected_count
    `;

    const result:any=accepted[0];
    if(!result || Number(result.accepted_count)!==1 || Number(result.locked_count)!==Number(result.expected_count)){
      return NextResponse.json({error:'Ett eller flera kort är inte längre tillgängliga eller tillhör inte rätt person.'},{status:409});
    }
  } else if(action==='counter'){
    if(trade.receiver_id!==user.id || trade.status!=='pending'){
      return NextResponse.json({error:'Du kan bara lämna motbud på ett väntande bytesförslag som du har fått.'},{status:400});
    }

    const offeredCardIds = Array.from(new Set(
      Array.isArray(body?.offered_card_ids) ? body.offered_card_ids.filter((x:any)=>typeof x==='string'&&x) : []
    ));
    const requestedCardIds = Array.from(new Set(
      Array.isArray(body?.requested_card_ids) ? body.requested_card_ids.filter((x:any)=>typeof x==='string'&&x) : []
    ));
    const note = typeof body?.note==='string' ? body.note.trim().slice(0,500) : null;

    if(!offeredCardIds.length || !requestedCardIds.length){
      return NextResponse.json({error:'Ett motbud måste innehålla minst ett kort från båda personerna.'},{status:400});
    }

    const requestedSet=new Set(requestedCardIds);
    if(offeredCardIds.some(cardId=>requestedSet.has(cardId))){
      return NextResponse.json({error:'Samma kort kan inte finnas på båda sidor i ett motbud.'},{status:400});
    }

    const countered=await sql`
      with locked_trade as (
        select tp.id,tp.proposer_id,tp.receiver_id
        from trade_proposals tp
        where tp.id=${id}
          and tp.receiver_id=${user.id}
          and tp.status='pending'
        for update
      ),
      selections as (
        select unnest(${offeredCardIds}::uuid[]) as card_id,'offered'::text as side
        union all
        select unnest(${requestedCardIds}::uuid[]) as card_id,'requested'::text as side
      ),
      locked_cards as (
        select c.id,c.owner_id,c.is_active,c.locked_trade_id,s.side
        from selections s
        join cards c on c.id=s.card_id
        for update of c
      ),
      validation as (
        select
          (select count(*)::int from selections) as expected_count,
          count(*)::int as found_count,
          count(*) filter (
            where lc.is_active=true
              and lc.locked_trade_id is null
              and (
                (lc.side='offered' and lc.owner_id=${user.id})
                or
                (lc.side='requested' and lc.owner_id=lt.proposer_id)
              )
          )::int as valid_count
        from locked_cards lc
        cross join locked_trade lt
      ),
      new_trade as (
        insert into trade_proposals(proposer_id,receiver_id,status,note,parent_trade_id)
        select ${user.id},lt.proposer_id,'pending',${note},lt.id
        from locked_trade lt,validation v
        where v.expected_count=v.found_count
          and v.expected_count=v.valid_count
          and v.expected_count>1
        returning id
      ),
      inserted_items as (
        insert into trade_items(trade_id,card_id,side)
        select nt.id,s.card_id,s.side
        from new_trade nt
        cross join selections s
        returning trade_id,card_id
      ),
      original_updated as (
        update trade_proposals tp
        set status='countered'
        from new_trade nt
        where tp.id=${id}
        returning nt.id as new_trade_id
      )
      select
        (select new_trade_id from original_updated limit 1) as new_trade_id,
        (select count(*)::int from inserted_items) as inserted_count,
        (select count(*)::int from selections) as expected_count
    `;

    const result:any=countered[0];
    if(!result?.new_trade_id || Number(result.inserted_count)!==Number(result.expected_count)){
      return NextResponse.json({error:'Motbudet kunde inte skapas eftersom ett eller flera kort inte längre är tillgängliga.'},{status:409});
    }

    return NextResponse.json({ok:true,trade_id:result.new_trade_id});
  }

  if(action==='decline'){
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

    const [before]=await sql`select * from trade_fulfillment where trade_id=${id}`;
    const isProposer=trade.proposer_id===user.id;
    const otherHasShipped=isProposer ? !!before?.receiver_shipped_at : !!before?.proposer_shipped_at;
    if(!otherHasShipped){
      return NextResponse.json({error:'Du kan markera mottaget först när den andra personen har markerat sina kort som skickade.'},{status:409});
    }

    if(isProposer) await sql`update trade_fulfillment set proposer_received_at=coalesce(proposer_received_at,now()),updated_at=now() where trade_id=${id}`;
    else await sql`update trade_fulfillment set receiver_received_at=coalesce(receiver_received_at,now()),updated_at=now() where trade_id=${id}`;
    const [f]=await sql`select * from trade_fulfillment where trade_id=${id}`;
    if(f?.proposer_received_at && f?.receiver_received_at){
      await sql`update trade_proposals set status='completed' where id=${id}`;
      await sql`update cards set is_active=false,locked_trade_id=null where id in (select card_id from trade_items where trade_id=${id})`;
    }
  } else return NextResponse.json({error:'Okänd åtgärd.'},{status:400});
  return NextResponse.json({ok:true});
}
