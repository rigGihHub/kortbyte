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
      with relevant_trade_ids as materialized (
        select ${id}::uuid as id
        union
        select distinct ti2.trade_id
        from trade_items ti1
        join trade_items ti2 on ti2.card_id=ti1.card_id
        join trade_proposals tp2 on tp2.id=ti2.trade_id
        where ti1.trade_id=${id}
          and tp2.status='pending'
      ),
      proposal_locks as materialized (
        select tp.id,tp.proposer_id,tp.receiver_id,tp.status
        from trade_proposals tp
        join relevant_trade_ids rti on rti.id=tp.id
        order by tp.id
        for update of tp
      ),
      locked_trade as (
        select pl.id,pl.proposer_id,pl.receiver_id
        from proposal_locks pl
        where pl.id=${id}
          and pl.receiver_id=${user.id}
          and pl.status='pending'
      ),
      locked_cards as (
        select c.id,c.owner_id,c.is_active,c.locked_trade_id,ti.side
        from trade_items ti
        join cards c on c.id=ti.card_id
        join locked_trade lt on lt.id=ti.trade_id
        where ti.trade_id=${id}
        order by c.id
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
    // Do not trust the earlier trade snapshot for a terminal state transition.
    // The conditional UPDATE is the authority, so a concurrent accept/counter/cancel
    // cannot be overwritten by a stale decline request.
    const declined=await sql`
      update trade_proposals
      set status='declined'
      where id=${id}
        and receiver_id=${user.id}
        and status='pending'
      returning id
    `;
    if(declined.length!==1) return NextResponse.json({error:'Förslaget kan inte avböjas eftersom dess status har ändrats.'},{status:409});
  } else if(action==='cancel'){
    // Same compare-and-set rule as decline. A stale proposer request must never
    // overwrite an accept/counter/other terminal transition that won the race.
    const cancelled=await sql`
      update trade_proposals
      set status='cancelled'
      where id=${id}
        and proposer_id=${user.id}
        and status='pending'
      returning id
    `;
    if(cancelled.length!==1) return NextResponse.json({error:'Förslaget kan inte dras tillbaka eftersom dess status har ändrats.'},{status:409});
  } else if(action==='shipped'){
    if(trade.status!=='accepted') return NextResponse.json({error:'Bytet måste vara accepterat först.'},{status:409});

    const tracking = typeof body?.tracking==='string' ? body.tracking.trim().slice(0,200) : '';

    // Serialize shipped/received transitions on the same trade + fulfillment rows.
    // This makes duplicate shipped requests idempotent and prevents an empty retry
    // from erasing tracking information that was already stored.
    await sql`insert into trade_fulfillment(trade_id) values (${id}) on conflict (trade_id) do nothing`;
    const shippedResult=await sql`
      with locked_trade as materialized (
        select tp.id,tp.proposer_id,tp.receiver_id,tp.status
        from trade_proposals tp
        where tp.id=${id}
          and (tp.proposer_id=${user.id} or tp.receiver_id=${user.id})
        for update of tp
      ),
      locked_fulfillment as materialized (
        select f.*
        from trade_fulfillment f
        join locked_trade lt on lt.id=f.trade_id
        where f.trade_id=${id}
        for update of f
      ),
      marked_shipped as (
        update trade_fulfillment f
        set
          proposer_shipped_at=case
            when lt.proposer_id=${user.id} then coalesce(f.proposer_shipped_at,now())
            else f.proposer_shipped_at
          end,
          receiver_shipped_at=case
            when lt.receiver_id=${user.id} then coalesce(f.receiver_shipped_at,now())
            else f.receiver_shipped_at
          end,
          tracking_proposer=case
            when lt.proposer_id=${user.id} and ${tracking}<>'' then ${tracking}
            else f.tracking_proposer
          end,
          tracking_receiver=case
            when lt.receiver_id=${user.id} and ${tracking}<>'' then ${tracking}
            else f.tracking_receiver
          end,
          updated_at=now()
        from locked_trade lt,locked_fulfillment lf
        where f.trade_id=lt.id
          and lf.trade_id=f.trade_id
          and lt.status='accepted'
        returning f.trade_id
      )
      select (select count(*)::int from marked_shipped) as shipped_count
    `;

    const shipped:any=shippedResult[0];
    if(!shipped || Number(shipped.shipped_count)!==1){
      return NextResponse.json({error:'Bytet är inte längre i ett läge där leveransen kan markeras som skickad.'},{status:409});
    }
  } else if(action==='received'){
    if(trade.status!=='accepted') return NextResponse.json({error:'Bytet måste vara accepterat först.'},{status:409});

    // Accepted trades normally already have a fulfillment row. Keep this idempotent
    // insert for older/incomplete data, then perform the state transition atomically.
    await sql`insert into trade_fulfillment(trade_id) values (${id}) on conflict (trade_id) do nothing`;

    const receivedResult=await sql`
      with locked_trade as materialized (
        select tp.id,tp.proposer_id,tp.receiver_id,tp.status
        from trade_proposals tp
        where tp.id=${id}
          and (tp.proposer_id=${user.id} or tp.receiver_id=${user.id})
        for update of tp
      ),
      locked_fulfillment as materialized (
        select f.*
        from trade_fulfillment f
        join locked_trade lt on lt.id=f.trade_id
        where f.trade_id=${id}
        for update of f
      ),
      selected_trade_cards as materialized (
        select distinct ti.card_id
        from trade_items ti
        join locked_trade lt on lt.id=ti.trade_id
      ),
      locked_trade_cards as materialized (
        select c.id,c.is_active,c.locked_trade_id
        from cards c
        join selected_trade_cards stc on stc.card_id=c.id
        order by c.id
        for update of c
      ),
      card_validation as (
        select
          (select count(*)::int from selected_trade_cards) as expected_count,
          (select count(*)::int from locked_trade_cards lc
            where lc.is_active=true and lc.locked_trade_id=${id}::uuid) as valid_count
      ),
      marked_received as (
        update trade_fulfillment f
        set
          proposer_received_at=case
            when lt.proposer_id=${user.id} then coalesce(f.proposer_received_at,now())
            else f.proposer_received_at
          end,
          receiver_received_at=case
            when lt.receiver_id=${user.id} then coalesce(f.receiver_received_at,now())
            else f.receiver_received_at
          end,
          updated_at=now()
        from locked_trade lt,locked_fulfillment lf,card_validation cv
        where f.trade_id=lt.id
          and lf.trade_id=f.trade_id
          and lt.status='accepted'
          and lf.proposer_shipped_at is not null
          and lf.receiver_shipped_at is not null
          and cv.expected_count>0
          and cv.expected_count=cv.valid_count
        returning f.trade_id,f.proposer_received_at,f.receiver_received_at
      ),
      completed_trade as (
        update trade_proposals tp
        set status='completed'
        from marked_received mr,card_validation cv
        where tp.id=mr.trade_id
          and mr.proposer_received_at is not null
          and mr.receiver_received_at is not null
          and cv.expected_count>0
          and cv.expected_count=cv.valid_count
          and tp.status='accepted'
        returning tp.id
      ),
      completed_cards as (
        update cards c
        set is_active=false,locked_trade_id=null
        where exists (
          select 1
          from completed_trade ct
          join trade_items ti on ti.trade_id=ct.id
          where ti.card_id=c.id
        )
        returning c.id
      )
      select
        (select count(*)::int from marked_received) as received_count,
        (select count(*)::int from completed_trade) as completed_count,
        (select count(*)::int from completed_cards) as completed_card_count
    `;

    const received:any=receivedResult[0];
    if(!received || Number(received.received_count)!==1){
      return NextResponse.json({error:'Bytet kan inte markeras som mottaget eftersom leveransläget eller kortens status har ändrats. Uppdatera sidan och kontrollera bytet.'},{status:409});
    }
  } else return NextResponse.json({error:'Okänd åtgärd.'},{status:400});
  return NextResponse.json({ok:true});
}
