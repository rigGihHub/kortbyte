import {NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {requireUser} from '@/lib/session';

const demoCards=[
  {title:'Wayne Gretzky All-Star',player:'Wayne Gretzky',category:'Hockey',set:'Upper Deck',year:'1990',number:'38',parallel:null,value:180},
  {title:'Peter Forsberg Rookie',player:'Peter Forsberg',category:'Hockey',set:'Fleer Ultra',year:'1995',number:'151',parallel:null,value:220},
  {title:'Zlatan Ibrahimović Milan',player:'Zlatan Ibrahimović',category:'Fotboll',set:'Panini',year:'2011',number:'84',parallel:null,value:140},
  {title:'Erling Haaland Chrome',player:'Erling Haaland',category:'Fotboll',set:'Topps Chrome',year:'2022',number:'27',parallel:'Refractor',value:320},
  {title:'Connor McDavid',player:'Connor McDavid',category:'Hockey',set:'Upper Deck',year:'2021',number:'97',parallel:null,value:250},
  {title:'Lionel Messi Barcelona',player:'Lionel Messi',category:'Fotboll',set:'Panini',year:'2015',number:'10',parallel:null,value:290},
];

const demoWants=[
  {query:'Mats Sundin Auto',player:'Mats Sundin',category:'Hockey'},
  {query:'Tottenham Auto /99',player:null,category:'Fotboll'},
  {query:'Peter Forsberg',player:'Peter Forsberg',category:'Hockey'},
  {query:'Zlatan Ibrahimovic',player:'Zlatan Ibrahimović',category:'Fotboll'},
  {query:'Connor McDavid',player:'Connor McDavid',category:'Hockey'},
];

function enabled(){
  return process.env.NODE_ENV!=='production' || process.env.ALLOW_DEV_SEED==='true';
}

export async function POST(){
  if(!enabled()){
    return NextResponse.json({error:'Testdata är avstängt i denna miljö.'},{status:403});
  }

  const user=await requireUser();

  const existing=await sql`
    select id from cards
    where owner_id=${user.id} and title like '[TEST] %'
    limit 1
  `;
  if(existing.length){
    return NextResponse.json({ok:true,already_seeded:true});
  }

  for(const c of demoCards){
    await sql`
      insert into cards(
        owner_id,title,player_name,category,card_set,card_year,card_number,parallel,
        estimated_value_sek,is_active
      ) values (
        ${user.id},${'[TEST] '+c.title},${c.player},${c.category},${c.set},${c.year},
        ${c.number},${c.parallel},${c.value},true
      )
    `;
  }

  for(const w of demoWants){
    await sql`
      insert into wanted_cards(user_id,query,category,player_name)
      values (${user.id},${'[TEST] '+w.query},${w.category},${w.player})
    `;
  }

  return NextResponse.json({
    ok:true,
    cards:demoCards.length,
    wants:demoWants.length
  });
}

export async function DELETE(){
  if(!enabled()){
    return NextResponse.json({error:'Testdata är avstängt i denna miljö.'},{status:403});
  }

  const user=await requireUser();

  const deletedWants=await sql`
    delete from wanted_cards
    where user_id=${user.id} and query like '[TEST] %'
    returning id
  `;

  const deletedCards=await sql`
    delete from cards
    where owner_id=${user.id}
      and title like '[TEST] %'
      and locked_trade_id is null
    returning id
  `;

  return NextResponse.json({
    ok:true,
    cards:deletedCards.length,
    wants:deletedWants.length
  });
}
