import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';

export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const user=await requireUser();
  if(!user) return NextResponse.json({error:'Inte inloggad'},{status:401});

  const {id}=await params;
  const body=await req.json();
  const text=String(body.body||'').trim().slice(0,1000);
  if(!text) return NextResponse.json({error:'Skriv ett meddelande.'},{status:400});

  const sql=db();
  // Serialize message creation with trade state changes. Messages may be sent
  // while a proposal is active/accepted and after a completed exchange, but not
  // to declined, cancelled or superseded (countered) proposals.
  const inserted=await sql`
    with locked_trade as materialized (
      select tp.id
      from trade_proposals tp
      where tp.id=${id}
        and (tp.proposer_id=${user.id} or tp.receiver_id=${user.id})
        and tp.status in ('pending','accepted','completed')
      for update of tp
    ),
    message as (
      insert into trade_messages(trade_id,sender_id,body)
      select lt.id,${user.id},${text}
      from locked_trade lt
      returning *
    )
    select * from message
  `;

  const message:any=inserted[0];
  if(!message) return NextResponse.json({error:'Det går inte att skicka meddelanden i det här bytesförslagets nuvarande status.'},{status:409});
  return NextResponse.json(message);
}
