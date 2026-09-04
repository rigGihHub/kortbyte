import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';

export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const user=await requireUser();
  if(!user) return NextResponse.json({error:'Inte inloggad'},{status:401});

  const {id}=await params;
  const body=await req.json();
  const rating=Number(body.rating);
  if(!Number.isInteger(rating)||rating<1||rating>5) return NextResponse.json({error:'Välj 1–5 stjärnor.'},{status:400});
  const comment=typeof body.comment==='string' ? body.comment.trim().slice(0,500) : '';

  const sql=db();
  // Derive the reviewed person from the completed trade inside the INSERT.
  // This keeps direct API callers from supplying or manipulating subject_id.
  const saved=await sql`
    insert into trade_reviews(trade_id,author_id,subject_id,rating,comment)
    select
      tp.id,
      ${user.id},
      case when tp.proposer_id=${user.id} then tp.receiver_id else tp.proposer_id end,
      ${rating},
      ${comment || null}
    from trade_proposals tp
    where tp.id=${id}
      and tp.status='completed'
      and (tp.proposer_id=${user.id} or tp.receiver_id=${user.id})
    on conflict (trade_id,author_id)
    do update set rating=excluded.rating,comment=excluded.comment
    returning id
  `;

  if(saved.length!==1) return NextResponse.json({error:'Bytet måste vara slutfört innan du kan lämna ett betyg.'},{status:409});
  return NextResponse.json({ok:true});
}
