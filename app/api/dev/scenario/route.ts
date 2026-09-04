import {NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {requireUser} from '@/lib/session';

const DEMO_PREFIX='demo-v1193-';
const TEST_PREFIX='[TEST-DEMO]';

function enabled(){
  return process.env.NODE_ENV!=='production' || process.env.ALLOW_DEV_SEED==='true';
}

export async function POST(){
  if(!enabled()){
    return NextResponse.json({error:'Demoscenariot är avstängt i denna miljö.'},{status:403});
  }

  const user=await requireUser();
  if(!user){
    return NextResponse.json({error:'Inte inloggad'},{status:401});
  }

  const existing=await sql`
    select id from trade_proposals
    where note=${TEST_PREFIX+' scenario'}
    limit 1
  `;
  if(existing.length){
    return NextResponse.json({ok:true,already_seeded:true});
  }

  await sql`
    insert into profiles(user_id,display_name,country_code)
    values (${user.id},${user.name||user.email||'Testanvändare'},'SE')
    on conflict (user_id) do nothing
  `;

  const collectors=[
    {id:DEMO_PREFIX+'anna',name:'AnnaS',city:'Stockholm'},
    {id:DEMO_PREFIX+'collector78',name:'CardCollector78',city:'Göteborg'},
    {id:DEMO_PREFIX+'hockeymax',name:'HockeyMax',city:'Örebro'}
  ];

  for(const c of collectors){
    await sql`
      insert into profiles(user_id,display_name,city,country_code,plan)
      values (${c.id},${c.name},${c.city},'SE','free')
      on conflict (user_id) do update
      set display_name=excluded.display_name,city=excluded.city
    `;
  }

  const [myKlas]=await sql`
    insert into cards(
      owner_id,title,player_name,category,card_set,card_year,card_number,
      estimated_value_sek,is_active
    ) values (
      ${user.id},${TEST_PREFIX+' Klas Ingesson'},'Klas Ingesson','Fotboll',
      'Upper Deck','1994','114',95,true
    ) returning id
  `;

  await sql`
    insert into cards(
      owner_id,title,player_name,category,card_set,card_year,parallel,
      estimated_value_sek,is_active
    ) values (
      ${user.id},${TEST_PREFIX+' Tottenham Legends Auto'},'Teddy Sheringham','Fotboll',
      'Select','2024','Auto /99',360,true
    )
  `;

  await sql`
    insert into wanted_cards(user_id,query,category,player_name,card_year,card_set)
    values
      (${user.id},${TEST_PREFIX+' Mats Sundin Auto'},'Hockey','Mats Sundin','2023','SP Authentic'),
      (${user.id},${TEST_PREFIX+' Peter Forsberg Rookie'},'Hockey','Peter Forsberg','1995','Fleer Ultra')
  `;

  const [annaSundin]=await sql`
    insert into cards(
      owner_id,title,player_name,category,card_set,card_year,card_number,parallel,
      estimated_value_sek,is_active
    ) values (
      ${DEMO_PREFIX+'anna'},${TEST_PREFIX+' Mats Sundin Auto'},'Mats Sundin','Hockey',
      'SP Authentic','2023','MS-A','Autograph',425,true
    ) returning id
  `;
  await sql`
    insert into wanted_cards(user_id,query,category,player_name,card_year)
    values (${DEMO_PREFIX+'anna'},${TEST_PREFIX+' Klas Ingesson'},'Fotboll','Klas Ingesson','1994')
  `;

  await sql`
    insert into cards(
      owner_id,title,player_name,category,card_set,card_year,card_number,
      estimated_value_sek,is_active
    ) values (
      ${DEMO_PREFIX+'collector78'},${TEST_PREFIX+' Peter Forsberg Rookie'},'Peter Forsberg',
      'Hockey','Fleer Ultra','1995','151',220,true
    )
  `;
  await sql`
    insert into wanted_cards(user_id,query,category,player_name,parallel)
    values (
      ${DEMO_PREFIX+'collector78'},${TEST_PREFIX+' Tottenham Auto /99'},'Fotboll',
      'Teddy Sheringham','Auto /99'
    )
  `;

  await sql`
    insert into cards(
      owner_id,title,player_name,category,card_set,card_year,estimated_value_sek,is_active
    ) values
      (${DEMO_PREFIX+'hockeymax'},${TEST_PREFIX+' Connor McDavid'},'Connor McDavid','Hockey','Upper Deck','2021',250,true),
      (${DEMO_PREFIX+'hockeymax'},${TEST_PREFIX+' Wayne Gretzky'},'Wayne Gretzky','Hockey','Upper Deck','1990',180,true)
  `;
  await sql`
    insert into wanted_cards(user_id,query,category,player_name)
    values (${DEMO_PREFIX+'hockeymax'},${TEST_PREFIX+' Zlatan'},'Fotboll','Zlatan Ibrahimović')
  `;

  const [trade]=await sql`
    insert into trade_proposals(proposer_id,receiver_id,status,note)
    values (${DEMO_PREFIX+'anna'},${user.id},'pending',${TEST_PREFIX+' scenario'})
    returning id
  `;
  await sql`
    insert into trade_items(trade_id,card_id,side)
    values
      (${trade.id},${annaSundin.id},'offered'),
      (${trade.id},${myKlas.id},'requested')
  `;

  return NextResponse.json({
    ok:true,
    collectors:collectors.length,
    guaranteed_matches:2,
    pending_trade:true
  });
}

export async function DELETE(){
  if(!enabled()){
    return NextResponse.json({error:'Demoscenariot är avstängt i denna miljö.'},{status:403});
  }

  const user=await requireUser();
  if(!user){
    return NextResponse.json({error:'Inte inloggad'},{status:401});
  }

  const demoTrades=await sql`
    delete from trade_proposals
    where note=${TEST_PREFIX+' scenario'}
       or proposer_id like ${DEMO_PREFIX+'%'}
       or receiver_id like ${DEMO_PREFIX+'%'}
    returning id
  `;

  const myWants=await sql`
    delete from wanted_cards
    where user_id=${user.id} and query like ${TEST_PREFIX+'%'}
    returning id
  `;
  const demoWants=await sql`
    delete from wanted_cards
    where user_id like ${DEMO_PREFIX+'%'}
    returning id
  `;

  await sql`
    update cards
    set locked_trade_id=null
    where owner_id=${user.id} and title like ${TEST_PREFIX+'%'}
  `;

  const myCards=await sql`
    delete from cards
    where owner_id=${user.id} and title like ${TEST_PREFIX+'%'}
    returning id
  `;
  const demoCards=await sql`
    delete from cards
    where owner_id like ${DEMO_PREFIX+'%'}
    returning id
  `;

  const profiles=await sql`
    delete from profiles
    where user_id like ${DEMO_PREFIX+'%'}
    returning user_id
  `;

  return NextResponse.json({
    ok:true,
    trades:demoTrades.length,
    cards:myCards.length+demoCards.length,
    wants:myWants.length+demoWants.length,
    profiles:profiles.length
  });
}
