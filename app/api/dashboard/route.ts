import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

type MatchCard = {
  id:string; owner_id:string; title:string; player_name?:string|null; card_set:string|null; card_year:string|null;
  card_number?:string|null; parallel?:string|null; serial_number?:string|null; grading_company?:string|null; grade?:number|null;
  category:string; estimated_value_sek:number|null; image_url?:string|null; is_active?:boolean;
  locked_trade_id?:string|null; owner_name?:string;
  owner_member_since?:string|null; owner_completed_trades?:number;
  owner_rating?:number|null; owner_review_count?:number;
};
type Want = { user_id?:string; query:string; category:string|null; player_name?:string|null; card_year?:string|null; card_set?:string|null; card_number?:string|null; parallel?:string|null };

const SYNONYMS:Record<string,string>={
  autograph:'auto', autograf:'auto', autographed:'auto', signerad:'auto', signature:'auto',
  rookie:'rookie', rc:'rookie', nykomling:'rookie',
  numbered:'numrerad', numrerad:'numrerad', numrerat:'numrerad',
  football:'fotboll', soccer:'fotboll'
};
const STOP=new Set(['kort','card','cards','the','ett','en','med','och','of','fran','from']);

function normalize(value:string){
  return value.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/(\d+)\s*\/\s*(\d+)/g,' $1 $2 ')
    .replace(/[^a-z0-9]+/g,' ')
    .trim().split(/\s+/).filter(Boolean)
    .map(t=>SYNONYMS[t]||t).join(' ');
}
function tokens(value:string){
  return normalize(value).split(' ').filter(t=>t && !STOP.has(t));
}
function tokenMatches(a:string,b:string){
  if(a===b)return true;
  if(a.length>=5&&b.length>=5&&(a.startsWith(b)||b.startsWith(a)))return true;
  return false;
}
function relevance(card:MatchCard,want:Want){
  const cardText=[
    card.title,card.player_name||'',card.card_set||'',card.card_year||'',
    card.card_number||'',card.parallel||'',card.serial_number||''
  ].join(' ');
  const c=tokens(cardText), q=tokens(want.query);
  if(!q.length)return {score:0, matched:[] as string[], reason:''};

  const matched=q.filter(qt=>c.some(ct=>tokenMatches(qt,ct)));
  const coverage=matched.length/q.length;
  const exactPhrase=normalize(cardText).includes(normalize(want.query));
  let score=exactPhrase?82:Math.round(20+coverage*48);

  const structured:{label:string;cardValue:string|null|undefined;wantValue:string|null|undefined;points:number}[]=[
    {label:'spelare',cardValue:card.player_name,wantValue:want.player_name,points:26},
    {label:'år',cardValue:card.card_year,wantValue:want.card_year,points:10},
    {label:'set',cardValue:card.card_set,wantValue:want.card_set,points:12},
    {label:'kortnummer',cardValue:card.card_number,wantValue:want.card_number,points:16},
    {label:'variant',cardValue:card.parallel,wantValue:want.parallel,points:10}
  ];

  const exactFields:string[]=[];
  const conflicts:string[]=[];
  for(const f of structured){
    if(!f.wantValue)continue;
    const wantedValue=normalize(f.wantValue);
    const cardValue=normalize(f.cardValue||'');
    if(cardValue && cardValue===wantedValue){score+=f.points;exactFields.push(f.label);}
    else if(cardValue){score-=Math.max(12,Math.round(f.points*1.4));conflicts.push(f.label);}
  }

  if(want.category){
    if(card.category===want.category)score+=6;
    else score-=18;
  }
  if(q.length>=2 && matched.length===1)score-=8;
  score=Math.max(0,Math.min(99,score));

  const reason=conflicts.length
    ? `Texten liknar sökningen men ${conflicts.join(', ')} skiljer sig`
    : exactFields.length>=2
      ? `Exakt identitet: ${exactFields.join(', ')}`
      : exactPhrase
        ? 'Stark textträff'
        : coverage===1
          ? 'Alla viktiga sökord hittades'
          : `${matched.length} av ${q.length} viktiga sökord hittades`;
  return {score,matched,reason};
}



type BundleSuggestion = {
  strategy:'mutual_fit'|'balanced';
  card_ids:string[];
  card_titles:string[];
  total_value:number|null;
  target_value:number|null;
  difference_pct:number|null;
  label:string;
  explanation:string;
};

function combinations<T>(items:T[], size:number):T[][]{
  const out:T[][]=[];
  function walk(start:number, acc:T[]){
    if(acc.length===size){out.push(acc.slice());return;}
    for(let i=start;i<items.length;i++){
      acc.push(items[i]); walk(i+1,acc); acc.pop();
    }
  }
  walk(0,[]);
  return out;
}

function bundleLabel(total:number,target:number){
  const pct=Math.round(((total-target)/target)*100);
  if(Math.abs(pct)<=10)return {pct,label:'Nära i uppskattat värde'};
  if(pct<0)return {pct,label:`Cirka ${Math.abs(pct)}% lägre uppskattat värde`};
  return {pct,label:`Cirka ${pct}% högre uppskattat värde`};
}

function toSuggestion(
  strategy:BundleSuggestion['strategy'],
  cards:MatchCard[],
  targetValue:number,
  explanation:string
):BundleSuggestion{
  const total=cards.reduce((sum,c)=>sum+(c.estimated_value_sek||0),0);
  const {pct,label}=bundleLabel(total,targetValue);
  return {
    strategy,
    card_ids:cards.map(c=>c.id),
    card_titles:cards.map(c=>c.title),
    total_value:Math.round(total),
    target_value:Math.round(targetValue),
    difference_pct:pct,
    label,
    explanation
  };
}

function buildBundleSuggestions(target:MatchCard, myCards:MatchCard[], counterpartWants:Want[]):BundleSuggestion[]{
  if(!counterpartWants.length)return [];
  const targetValue=target.estimated_value_sek;

  // A smart proposal must first be something the counterpart actually wants.
  const relevant=myCards
    .filter(c=>c.is_active!==false&&!c.locked_trade_id)
    .map(card=>{
      const ranked=counterpartWants.map(w=>relevance(card,w)).sort((a,b)=>b.score-a.score);
      return {card,desirability:ranked[0]?.score||0,reason:ranked[0]?.reason||''};
    })
    .filter(x=>x.desirability>=60)
    .sort((a,b)=>b.desirability-a.desirability)
    .slice(0,18);
  if(!relevant.length)return [];

  const candidateCombos:{cards:MatchCard[];desirability:number;diff:number|null}[]=[];
  for(const size of [1,2,3]){
    for(const combo of combinations(relevant,size)){
      const cards=combo.map(x=>x.card);
      const desirability=Math.round(combo.reduce((s,x)=>s+x.desirability,0)/combo.length);
      const total=cards.reduce((s,c)=>s+Number(c.estimated_value_sek||0),0);
      const allHaveValue=cards.every(c=>Number(c.estimated_value_sek||0)>0)&&Number(targetValue||0)>0;
      const diff=allHaveValue?Math.abs(total-Number(targetValue))/Number(targetValue):null;
      // Don't make obviously extreme value suggestions when both sides have values.
      if(diff!==null&&diff>0.50)continue;
      candidateCombos.push({cards,desirability,diff});
    }
  }
  if(!candidateCombos.length)return [];

  const out:BundleSuggestion[]=[]; const seen=new Set<string>();
  const add=(s:BundleSuggestion)=>{const key=[...s.card_ids].sort().join('|');if(seen.has(key))return;seen.add(key);out.push(s)};

  const mutualFit=[...candidateCombos].sort((a,b)=>b.desirability-a.desirability || (a.diff??9)-(b.diff??9) || a.cards.length-b.cards.length)[0];
  if(mutualFit){
    const s=toSuggestion('mutual_fit',mutualFit.cards,Number(targetValue||0)||mutualFit.cards.reduce((n,c)=>n+Number(c.estimated_value_sek||0),0),
      `Prioriterar kort som matchar vad ${target.owner_name||'motparten'} faktiskt söker.`);
    if(!targetValue){s.target_value=null;s.difference_pct=null;s.label=`${mutualFit.desirability}% relevans för motparten`;}
    else s.label=`${mutualFit.desirability}% relevans för motparten`;
    add(s);
  }

  if(targetValue){
    const balanced=[...candidateCombos].filter(x=>x.diff!==null).sort((a,b)=>(a.diff??9)-(b.diff??9) || b.desirability-a.desirability || a.cards.length-b.cards.length)[0];
    if(balanced){
      add(toSuggestion('balanced',balanced.cards,Number(targetValue),'Närmast i uppskattat värde bland kort som också matchar motpartens sökningar.'));
    }
  }
  return out.slice(0,2);
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Inte inloggad' }, { status: 401 });
  const sql = db();
  await sql`insert into profiles (user_id, display_name) values (${user.id}, ${user.name || user.email || 'Samlare'}) on conflict (user_id) do nothing`;

  const [profile] = await sql`select user_id,display_name,city,country_code,plan,created_at from profiles where user_id=${user.id}`;
  const cards = await sql`select * from cards where owner_id=${user.id} order by created_at desc`;
  const wanted = await sql`select * from wanted_cards where user_id=${user.id} order by created_at desc`;

  const candidates = await sql`
    with completed as (
      select user_id,count(*)::int as completed_trades
      from (
        select proposer_id as user_id from trade_proposals where status='completed'
        union all
        select receiver_id as user_id from trade_proposals where status='completed'
      ) x group by user_id
    ), reviews as (
      select subject_id as user_id,count(*)::int as review_count,round(avg(rating)::numeric,1) as average_rating
      from trade_reviews group by subject_id
    )
    select c.*,p.display_name as owner_name,p.created_at as owner_member_since,
      coalesce(completed.completed_trades,0) as owner_completed_trades,
      reviews.average_rating as owner_rating,
      coalesce(reviews.review_count,0) as owner_review_count
    from cards c
    join profiles p on p.user_id=c.owner_id
    left join completed on completed.user_id=c.owner_id
    left join reviews on reviews.user_id=c.owner_id
    where c.owner_id<>${user.id} and c.is_active=true and c.locked_trade_id is null
    order by c.created_at desc limit 400`;
  const otherWants = await sql`
    select user_id,query,category,player_name,card_year,card_set,card_number,parallel from wanted_cards
    where user_id<>${user.id}
    order by created_at desc limit 1000`;

  const myWants:Want[] = wanted.map((w:any)=>({
    query:w.query,category:w.category,player_name:w.player_name,card_year:w.card_year,
    card_set:w.card_set,card_number:w.card_number,parallel:w.parallel
  }));
  const myAvailable:MatchCard[] = cards.filter((c:any)=>c.is_active!==false&&!c.locked_trade_id) as MatchCard[];
  const wantsByUser=new Map<string,Want[]>();
  for(const w of otherWants as any[]){
    const arr=wantsByUser.get(w.user_id)||[];
    arr.push({
      user_id:w.user_id,query:w.query,category:w.category,player_name:w.player_name,
      card_year:w.card_year,card_set:w.card_set,card_number:w.card_number,parallel:w.parallel
    });
    wantsByUser.set(w.user_id,arr);
  }

  // Rank first. Expensive bundle work happens only for the 30 matches the user can actually see.
  const rankedMatches=(candidates as MatchCard[]).map(card=>{
    const ranked=myWants.map(w=>({w,...relevance(card,w)})).sort((a,b)=>b.score-a.score);
    const best=ranked[0];
    if(!best || best.score<60)return null;

    let mutualScore=0, mutualCardTitle:string|undefined, mutualWantQuery:string|undefined;
    for(const ow of wantsByUser.get(card.owner_id)||[]){
      for(const mine of myAvailable){
        const r=relevance(mine,ow);
        if(r.score>mutualScore){mutualScore=r.score;mutualCardTitle=mine.title;mutualWantQuery=ow.query;}
      }
    }
    const isMutual=mutualScore>=60;
    return {...card,wanted_query:best.w.query,match_score:Math.min(99,best.score+(isMutual?4:0)),is_mutual:isMutual,match_reason:best.reason,matched_terms:best.matched,mutual_card_title:isMutual?mutualCardTitle:null,mutual_want_query:isMutual?mutualWantQuery:null};
  }).filter(Boolean).sort((a:any,b:any)=>Number(b.is_mutual)-Number(a.is_mutual)||b.match_score-a.match_score).slice(0,30);

  const matches=(rankedMatches as any[]).map(card=>({
    ...card,
    bundle_suggestions:buildBundleSuggestions(card,myAvailable,wantsByUser.get(card.owner_id)||[])
  }));

  const trades = await sql`
    select t.*,
      case when t.proposer_id=${user.id} then pr.display_name else pp.display_name end as other_name,
      (select coalesce(json_agg(json_build_object('id',c.id,'title',c.title,'side',ti.side,'owner_id',c.owner_id,'value',c.estimated_value_sek) order by ti.side,c.title),'[]'::json)
       from trade_items ti join cards c on c.id=ti.card_id where ti.trade_id=t.id) as items,
      (select coalesce(json_agg(json_build_object('id',m.id,'sender_id',m.sender_id,'sender_name',mp.display_name,'body',m.body,'created_at',m.created_at) order by m.created_at),'[]'::json)
       from trade_messages m join profiles mp on mp.user_id=m.sender_id where m.trade_id=t.id) as messages,
      (select row_to_json(f) from trade_fulfillment f where f.trade_id=t.id) as fulfillment,
      exists(select 1 from trade_reviews r where r.trade_id=t.id and r.author_id=${user.id}) as reviewed_by_me,
      (
        select coalesce(json_agg(json_build_object(
          'id',oc.id,
          'title',oc.title,
          'card_set',oc.card_set,
          'card_year',oc.card_year,
          'category',oc.category,
          'value',oc.estimated_value_sek,
          'image_url',oc.image_url
        ) order by oc.created_at desc),'[]'::json)
        from cards oc
        where oc.owner_id = case when t.proposer_id=${user.id} then t.receiver_id else t.proposer_id end
          and oc.is_active=true
          and oc.locked_trade_id is null
      ) as other_cards
    from trade_proposals t
    join profiles pp on pp.user_id=t.proposer_id
    join profiles pr on pr.user_id=t.receiver_id
    where t.proposer_id=${user.id} or t.receiver_id=${user.id}
    order by t.created_at desc limit 50`;

  const notifications:any[] = [];

  for(const m of (matches as any[]).slice(0,8)){
    notifications.push({
      id:`match-${m.id}`,
      type:m.is_mutual?'mutual_match':'match',
      title:m.is_mutual?'Ny ömsesidig match':'Ny match',
      body:m.is_mutual
        ? `${m.owner_name||'En samlare'} har ett kort du söker och söker samtidigt något som matchar dina kort.`
        : `${m.title} matchar din sökning "${m.wanted_query||''}".`,
      created_at:m.created_at,
      priority:m.is_mutual?'high':'normal',
      match_id:m.id
    });
  }

  for(const t of (trades as any[]).slice(0,8)){
    if(t.status==='pending'){
      notifications.push({
        id:`trade-${t.id}`,
        type:'trade',
        title:t.proposer_id===user.id?'Bytesförslag skickat':'Nytt bytesförslag',
        body:t.proposer_id===user.id
          ? `Ditt bytesförslag till ${t.other_name||'samlaren'} väntar på svar.`
          : `${t.other_name||'En samlare'} har skickat ett bytesförslag till dig.`,
        created_at:t.created_at,
        priority:t.proposer_id===user.id?'normal':'high',
        trade_id:t.id
      });
    }
    if(t.status==='accepted'){
      notifications.push({
        id:`accepted-${t.id}`,
        type:'trade',
        title:'Byte accepterat',
        body:`Bytet med ${t.other_name||'samlaren'} är accepterat. Nästa steg är leverans.`,
        created_at:t.created_at,
        priority:'high',
        trade_id:t.id
      });
    }
  }

  notifications.sort((a,b)=>new Date(b.created_at||0).getTime()-new Date(a.created_at||0).getTime());

  return NextResponse.json({ profile, cards, wanted, matches, trades, notifications, user_id:user.id });
}
