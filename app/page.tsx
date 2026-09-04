'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Bell, CheckCircle2, Crown, Heart, ImageIcon, Loader2, LockKeyhole, LogIn, LogOut, Plus, Search, ShieldCheck, Sparkles, Trash2, UserRound, X } from 'lucide-react';
import { authClient } from '@/lib/auth-client';


async function readJsonSafe(res:Response){
  const text=await res.text();
  if(!text)return {};
  try{return JSON.parse(text);}
  catch{
    throw new Error(`Ogiltigt svar från servern (${res.status}).`);
  }
}

async function apiJson(input:RequestInfo|URL, init?:RequestInit){
  const res=await fetch(input,init);
  const data:any=await readJsonSafe(res);
  if(!res.ok){
    throw new Error(data?.error || `Serverfel (${res.status})`);
  }
  return data;
}

type CardItem={id:string;owner_id?:string;title:string;player_name?:string|null;card_set:string|null;card_year:string|null;card_number?:string|null;parallel?:string|null;serial_number?:string|null;grading_company?:string|null;grade?:number|null;category:string;estimated_value_sek:number|null;image_url?:string|null;is_active?:boolean;locked_trade_id?:string|null;owner_name?:string;match_score?:number;is_mutual?:boolean;wanted_query?:string;match_reason?:string;matched_terms?:string[];mutual_card_title?:string|null;mutual_want_query?:string|null;bundle_suggestions?:{strategy:'mutual_fit'|'balanced';card_ids:string[];card_titles:string[];total_value:number|null;target_value:number|null;difference_pct:number|null;label:string;explanation:string}[];owner_member_since?:string|null;owner_completed_trades?:number;owner_rating?:number|null;owner_review_count?:number};
type WantedItem={id:string;query:string;category:string|null;player_name?:string|null;card_year?:string|null;card_set?:string|null;card_number?:string|null;parallel?:string|null};
type TradeCard={id:string;title:string;side:'offered'|'requested';owner_id:string;value?:number|null};
type TradeMessage={id:string;sender_id:string;sender_name:string;body:string;created_at:string};
type Fulfillment={proposer_shipped_at?:string|null;receiver_shipped_at?:string|null;proposer_received_at?:string|null;receiver_received_at?:string|null;tracking_proposer?:string|null;tracking_receiver?:string|null};
type TradeItem={id:string;status:string;other_name:string;created_at:string;note?:string|null;proposer_id:string;receiver_id:string;items:TradeCard[];messages:TradeMessage[];fulfillment?:Fulfillment|null;reviewed_by_me?:boolean;parent_trade_id?:string|null;other_cards?:{id:string;title:string;card_set?:string|null;card_year?:string|null;category?:string|null;value?:number|null;image_url?:string|null}[]};
type AppNotification={id:string;type:'mutual_match'|'match'|'trade';title:string;body:string;created_at?:string;priority?:'high'|'normal';match_id?:string;trade_id?:string};
type Dashboard={profile?:{display_name:string;plan:'free'|'plus'};cards:CardItem[];wanted:WantedItem[];matches:CardItem[];trades:TradeItem[];notifications?:AppNotification[];user_id?:string};

const demo:Dashboard={
 profile:{display_name:'Demo',plan:'free'},
 cards:[
  {id:'d1',title:'Connor Bedard Rookie',card_set:'Upper Deck',card_year:'2023-24',category:'Hockey',estimated_value_sek:450,is_active:true},
  {id:'d2',title:'Pikachu Illustration Rare',card_set:'151',card_year:'2023',category:'Pokémon',estimated_value_sek:240,is_active:true},
  {id:'d3',title:'Dejan Kulusevski Parallel',card_set:'Prizm',card_year:'2024-25',category:'Fotboll',estimated_value_sek:180,is_active:true}
 ],
 wanted:[{id:'w1',query:'Mats Sundin Auto',category:'Hockey'},{id:'w2',query:'Tottenham Auto /99',category:'Fotboll'}],
 matches:[
  {id:'m1',owner_id:'anna',owner_name:'AnnaS',owner_member_since:'2026-05-12T00:00:00Z',owner_completed_trades:14,owner_rating:4.9,owner_review_count:11,title:'Mats Sundin Auto',card_set:'SP Authentic',card_year:'2023-24',category:'Hockey',estimated_value_sek:425,match_score:99,is_mutual:true,wanted_query:'Mats Sundin Auto',mutual_card_title:'Connor Bedard Rookie',mutual_want_query:'Connor Bedard Rookie',bundle_suggestions:[{strategy:'mutual_fit',card_ids:['d1'],card_titles:['Connor Bedard Rookie'],total_value:450,target_value:425,difference_pct:6,label:'Direkt ömsesidigt',explanation:'AnnaS söker ett kort som matchar ditt Connor Bedard Rookie.'}]},
  {id:'m2',owner_id:'cc87',owner_name:'CardCollector87',owner_member_since:'2026-08-25T00:00:00Z',owner_completed_trades:1,owner_rating:5,owner_review_count:1,title:'Tottenham Auto /99',card_set:'Select',card_year:'2024-25',category:'Fotboll',estimated_value_sek:360,match_score:88,is_mutual:false,wanted_query:'Tottenham Auto /99'}
 ],trades:[],notifications:[
  {id:'demo-mutual',type:'mutual_match',title:'Ny ömsesidig match',body:'AnnaS har ett Mats Sundin Auto du söker och söker samtidigt något som matchar dina kort.',priority:'high',match_id:'m1'},
  {id:'demo-match',type:'match',title:'Ny match',body:'Tottenham Auto /99 matchar din sökning.',priority:'normal',match_id:'m2'}
 ]
};
const categories=['Hockey','Fotboll','Pokémon','One Piece','Magic','Lorcana','Star Wars','Övrigt'];

function memberSinceLabel(value?:string|null){
 if(!value)return 'Ny medlem';
 const d=new Date(value);
 if(Number.isNaN(d.getTime()))return 'Ny medlem';
 return `Medlem sedan ${d.toLocaleDateString('sv-SE',{year:'numeric',month:'short'})}`;
}

type SmartCardHints={
 year?:string;
 numbering?:string;
 traits:string[];
 normalizedTitle?:string;
};

function smartCardHints(raw:string):SmartCardHints{
 const text=raw.trim();
 const year=(text.match(/\b(19\d{2}|20\d{2})\b/)||[])[1];
 const numbering=(text.match(/(?:^|\s)(\d{1,5}\s*\/\s*\d{1,5})(?:\s|$)/)||[])[1]?.replace(/\s/g,'');
 const traits:string[]=[];
 const add=(label:string)=>{if(!traits.includes(label))traits.push(label)};
 if(/\b(auto|autograph|autograf|autographed|signerad|signature)\b/i.test(text)) add('Autograf');
 if(/\b(rc|rookie|nykomling)\b/i.test(text)) add('Rookie');
 if(/\b(relic|jersey|patch|memorabilia|game[- ]?used)\b/i.test(text)) add('Relic / patch');
 if(/\b(prizm|refractor|parallel|holo|foil|chrome)\b/i.test(text)) add('Parallel / special');
 if(/\b(1\/1|one of one)\b/i.test(text)) add('1/1');
 else if(numbering) add('Numrerat');

 let normalized=text.replace(/\s+/g,' ').replace(/\s*\/\s*/g,'/').trim();
 normalized=normalized
  .replace(/\bautograph(ed)?\b/ig,'Auto')
  .replace(/\bautograf\b/ig,'Auto')
  .replace(/\bsignerad\b/ig,'Auto')
  .replace(/\bnykomling\b/ig,'Rookie');

 return {year,numbering,traits,normalizedTitle:normalized||undefined};
}

function trustLabel(completed=0,rating?:number|null,reviews=0){
 if(completed>=10 && reviews>=5 && (rating||0)>=4.5)return 'Mycket erfaren bytare';
 if(completed>=3 && reviews>=2 && (rating||0)>=4)return 'Erfaren bytare';
 if(completed>0)return 'Har genomförda byten';
 return 'Ny på Kortbyte';
}

function matchStrength(score?:number){
 const value=Number(score||0);
 if(value>=90)return 'Mycket stark match';
 if(value>=75)return 'Stark match';
 return 'Möjlig match';
}

function tradeNextStep(t:TradeItem,me?:string){
 const proposer=t.proposer_id===me;
 const receiver=t.receiver_id===me;
 const f=t.fulfillment||{};
 const myShipped=proposer?f.proposer_shipped_at:f.receiver_shipped_at;
 const myReceived=proposer?f.proposer_received_at:f.receiver_received_at;
 const otherShipped=proposer?f.receiver_shipped_at:f.proposer_shipped_at;
 const otherReceived=proposer?f.receiver_received_at:f.proposer_received_at;
 if(t.status==='pending') return receiver?{tone:'action',title:'Din tur: ta ställning',body:'Acceptera, gör ett motbud eller avböj förslaget.'}:{tone:'wait',title:'Väntar på svar',body:`${t.other_name} behöver ta ställning till ditt förslag.`};
 if(t.status==='accepted'){
  if(!myShipped)return {tone:'action',title:'Din tur: skicka dina kort',body:'Skicka korten och markera sedan som skickat. Spårningsnummer är frivilligt.'};
  if(!otherShipped)return {tone:'wait',title:`Väntar på att ${t.other_name} skickar`,body:'Du har markerat dina kort som skickade. Nästa steg öppnas när motparten också har skickat.'};
  if(!myReceived)return {tone:'action',title:'Din tur: bekräfta mottaget',body:'Båda har skickat. Markera mottaget först när korten faktiskt har kommit fram.'};
  if(!otherReceived)return {tone:'wait',title:`Väntar på att ${t.other_name} bekräftar mottaget`,body:'Du har fått dina kort. Bytet avslutas när motparten också bekräftar mottaget.'};
  return {tone:'wait',title:'Avslutar bytet',body:'Båda har bekräftat mottaget. Status bör strax bli klar.'};
 }
 if(t.status==='completed')return {tone:'done',title:'Bytet är klart',body:t.reviewed_by_me?'Du har också lämnat omdöme.':'Lämna gärna ett omdöme när du har kontrollerat korten.'};
 if(t.status==='countered')return {tone:'wait',title:'Ersatt av motbud',body:'Det här förslaget är avslutat eftersom ett nytt motbud skapades.'};
 if(t.status==='declined')return {tone:'closed',title:'Förslaget avböjdes',body:'Inga kort är låsta till detta förslag.'};
 if(t.status==='cancelled')return {tone:'closed',title:'Förslaget drogs tillbaka',body:'Inga fler åtgärder behövs.'};
 return {tone:'wait',title:statusText(t.status),body:''};
}


function tradeListBucket(t:TradeItem,me?:string){
 const next=tradeNextStep(t,me);
 if(next.tone==='action')return {group:'action' as const,priority:0};
 if(['pending','accepted'].includes(t.status))return {group:'active' as const,priority:1};
 if(t.status==='completed'&&!t.reviewed_by_me)return {group:'action' as const,priority:2};
 return {group:'history' as const,priority:3};
}

function tradeListSort(a:TradeItem,b:TradeItem,me?:string){
 const pa=tradeListBucket(a,me).priority; const pb=tradeListBucket(b,me).priority;
 if(pa!==pb)return pa-pb;
 return new Date(b.created_at).getTime()-new Date(a.created_at).getTime();
}

export default function Home(){
 const {data:session,isPending}=authClient.useSession();
 const live=Boolean(session?.user);
 const [data,setData]=useState<Dashboard>(demo);
 const [tab,setTab]=useState<'match'|'cards'|'wanted'|'trades'>('match');
 const [busy,setBusy]=useState(false); const [notice,setNotice]=useState('');
 const [authOpen,setAuthOpen]=useState(false); const [authMode,setAuthMode]=useState<'signin'|'signup'>('signin');
 const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [name,setName]=useState('');
 const [cardOpen,setCardOpen]=useState(false); const [wantedOpen,setWantedOpen]=useState(false); const [tradeTarget,setTradeTarget]=useState<CardItem|null>(null);
 const emptyCardForm={title:'',player_name:'',category:'Hockey',card_set:'',card_year:'',card_number:'',parallel:'',serial_number:'',grading_company:'',grade:'',estimated_value_sek:''};
 const [cardForm,setCardForm]=useState(emptyCardForm);
 const [cardImage,setCardImage]=useState<File|null>(null); const [cardImagePreview,setCardImagePreview]=useState(''); const [imageUploading,setImageUploading]=useState(false);
 const [uploadedCardImageUrl,setUploadedCardImageUrl]=useState('');
 const [cardStep,setCardStep]=useState<'photo'|'details'>('photo');
 const [acceptedHints,setAcceptedHints]=useState<string[]>([]);
 const [aiAnalyzing,setAiAnalyzing]=useState(false); const [aiAnalysis,setAiAnalysis]=useState<any>(null);
 const emptyWantedForm={query:'',category:'Hockey',player_name:'',card_year:'',card_set:'',card_number:'',parallel:''};
 const [wantedForm,setWantedForm]=useState(emptyWantedForm); const [offerIds,setOfferIds]=useState<string[]>([]); const [note,setNote]=useState('');
 const [selectedTrade,setSelectedTrade]=useState<string|null>(null); const [chatText,setChatText]=useState(''); const [tracking,setTracking]=useState(''); const [reviewRating,setReviewRating]=useState(5); const [reviewComment,setReviewComment]=useState('');
 const [counterOfferIds,setCounterOfferIds]=useState<string[]>([]); const [counterRequestIds,setCounterRequestIds]=useState<string[]>([]); const [counterNote,setCounterNote]=useState(''); const [counterOpen,setCounterOpen]=useState(false);
 const [showNotifications,setShowNotifications]=useState(false);

 async function refresh(){ if(!live)return; setBusy(true); try{const j=await apiJson('/api/dashboard',{cache:'no-store'}); setData(j);}catch(e){setNotice(e instanceof Error?e.message:'Fel');}finally{setBusy(false);} }
 useEffect(()=>{if(live)void refresh(); else setData(demo);},[live]);
 const plan=data.profile?.plan??'free'; const active=data.cards.filter(c=>c.is_active!==false).length; const freeSlots=Math.max(0,50-active);
 const mutualCount=useMemo(()=>data.matches.filter(m=>m.is_mutual).length,[data.matches]);
 const actionTradeCount=useMemo(()=>data.trades.filter(t=>tradeListBucket(t,data.user_id).group==='action').length,[data.trades,data.user_id]);
 const matchingReady=active>=3 && data.wanted.length>=3;
 const selectedOfferCards=useMemo(()=>data.cards.filter(c=>offerIds.includes(c.id)),[data.cards,offerIds]);
 const offeredValue=useMemo(()=>selectedOfferCards.reduce((sum,c)=>sum+Number(c.estimated_value_sek||0),0),[selectedOfferCards]);
 const targetValue=Number(tradeTarget?.estimated_value_sek||0);
 const balancePct=targetValue>0&&offeredValue>0?Math.round((offeredValue/targetValue)*100):null;
 const suggestedOfferIds=useMemo(()=>{
  if(!tradeTarget)return new Set<string>();
  const bundle=tradeTarget.bundle_suggestions?.find(b=>b.strategy==='mutual_fit');
  if(bundle?.card_ids?.length)return new Set(bundle.card_ids);
  if(tradeTarget.mutual_card_title){
   const wanted=tradeTarget.mutual_card_title.trim().toLowerCase();
   return new Set(data.cards.filter(c=>c.title.trim().toLowerCase()===wanted).map(c=>c.id));
  }
  return new Set<string>();
 },[tradeTarget,data.cards]);

 async function doAuth(e:FormEvent){e.preventDefault();setBusy(true);setNotice('');try{
   if(authMode==='signin'){const r=await authClient.signIn.email({email,password}); if(r.error)throw new Error(r.error.message||'Inloggningen misslyckades');}
   else{const r=await authClient.signUp.email({email,password,name:name||email.split('@')[0]}); if(r.error)throw new Error(r.error.message||'Kontot kunde inte skapas');}
   setAuthOpen(false);
 }catch(e){setNotice(e instanceof Error?e.message:'Fel');}finally{setBusy(false);}}
 async function api(url:string,method:string,body?:unknown){setBusy(true);setNotice('');try{await apiJson(url,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});await refresh();return true;}catch(e){setNotice(e instanceof Error?e.message:'Fel');return false;}finally{setBusy(false);}}
 async function analyzeCardImage(){
  if(!cardImage){setNotice('Välj eller fotografera ett kort först.');return;}
  setAiAnalyzing(true);
  try{
   const image_url=uploadedCardImageUrl||await uploadCardImage(cardImage); setUploadedCardImageUrl(image_url);
   const j=await apiJson('/api/ai/card-analysis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image_url})});
   const a=j.analysis||{};
   setAiAnalysis(a);
   const f=a.fields||{};
   const next:any={...cardForm};
   // Autofyll bara hög säkerhet. Medel/låg säkerhet visas som förslag nedan.
   if(f.player?.value&&f.player.confidence>=85&&!next.title) next.title=f.player.value;
   if(f.year?.value&&f.year.confidence>=85&&!next.card_year) next.card_year=f.year.value;
   if(f.set?.value&&f.set.confidence>=85&&!next.card_set) next.card_set=f.set.value;
   if(f.category?.value&&f.category.confidence>=85&&categories.includes(f.category.value)) next.category=f.category.value;
   setCardForm(next);
   const safeTraits=(Array.isArray(a.traits)?a.traits:[]).filter((t:any)=>t?.value&&Number(t.confidence)>=85).map((t:any)=>t.value);
   if(f.numbering?.value&&f.numbering.confidence>=85) safeTraits.push(`Numrerat ${f.numbering.value}`);
   setAcceptedHints(v=>Array.from(new Set([...v,...safeTraits])));
   setCardStep('details');
  }catch(err:any){setNotice(err?.message||'Bilden kunde inte analyseras.');}
  finally{setAiAnalyzing(false);}
 }

 async function uploadCardImage(file:File){
  setImageUploading(true);
  try{
   const j=await apiJson('/api/uploads/card-image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content_type:file.type,size:file.size})});
   const put=await fetch(j.upload_url,{method:'PUT',headers:{'Content-Type':file.type},body:file});
   if(!put.ok) throw new Error('Bilden kunde inte laddas upp.');
   return String(j.public_url);
  } finally { setImageUploading(false); }
 }
 async function addCard(e:FormEvent){
  e.preventDefault();
  if(!live){setNotice('Logga in för att spara riktiga kort.');return;}
  try{
   const image_url=cardImage?(uploadedCardImageUrl||await uploadCardImage(cardImage)):null;
   const traitSuffix=acceptedHints.filter(t=>!cardForm.title.toLowerCase().includes(t.toLowerCase().split(' ')[0])).join(' · ');
   const finalTitle=traitSuffix?`${cardForm.title} · ${traitSuffix}`:cardForm.title;
   if(await api('/api/cards','POST',{...cardForm,title:finalTitle,image_url})){
    setCardOpen(false);
    setCardForm(emptyCardForm);
    setCardImage(null); setCardImagePreview(''); setCardStep('photo'); setAcceptedHints([]); setUploadedCardImageUrl(''); setAiAnalysis(null);
   }
  }catch(err:any){setNotice(err?.message||'Bilden kunde inte laddas upp.');}
 }
 async function addWanted(e:FormEvent){e.preventDefault(); if(!live){setNotice('Logga in för att spara riktiga sökningar.');return;} if(await api('/api/wanted','POST',wantedForm)){setWantedOpen(false);setWantedForm(emptyWantedForm);}}
 async function propose(e:FormEvent){e.preventDefault();if(!tradeTarget)return;if(!live){setNotice('Logga in för att skicka ett riktigt bytesförslag.');return;}if(await api('/api/trades','POST',{requested_card_id:tradeTarget.id,offered_card_ids:offerIds,note})){setTradeTarget(null);setOfferIds([]);setNote('');setTab('trades');}}
 async function tradeAction(id:string,action:string,extra:Record<string,unknown>={}){if(await api('/api/trades/'+id,'PATCH',{action,...extra}))setSelectedTrade(id);}
 async function sendMessage(id:string,e:FormEvent){e.preventDefault();if(!chatText.trim())return;if(await api('/api/trades/'+id+'/messages','POST',{body:chatText})){setChatText('');setSelectedTrade(id);}}
 async function sendReview(id:string,e:FormEvent){e.preventDefault();if(await api('/api/trades/'+id+'/reviews','POST',{rating:reviewRating,comment:reviewComment})){setReviewComment('');setSelectedTrade(id);}}

 async function submitCounter(trade:TradeItem){
  if(!counterOfferIds.length || !counterRequestIds.length){
   alert('Välj minst ett kort från båda personerna.');
   return;
  }
  const j=await apiJson(`/api/trades/${trade.id}`,{
   method:'PATCH',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({
    action:'counter',
    offered_card_ids:counterOfferIds,
    requested_card_ids:counterRequestIds,
    note:counterNote
   })
  });
  setCounterOpen(false);
  setCounterOfferIds([]);
  setCounterRequestIds([]);
  setCounterNote('');
  setSelectedTrade(null);
  await refresh();
  setTab('trades');
 }

 const cardHints=smartCardHints(cardForm.title);
 const smartTraits=cardHints.traits.filter(x=>!acceptedHints.includes(x));
 const onboardingDone=(data.cards?.length||0)>=3 && (data.wanted?.length||0)>=3;
 const onboardingCards=Math.min(3,data.cards?.length||0);
 const onboardingWants=Math.min(3,data.wanted?.length||0);
 const notifications=data.notifications||[];
 const importantNotifications=notifications.filter(n=>n.priority==='high').length;

 return <main className="shell">
  <header><div className="brand"><div className="logo"><ArrowLeftRight size={22}/></div><div><b>Kortbyte</b><small>Byt kort. Inte pengar.</small></div></div><div className="top-actions"><span className={'mode '+(live?'live':'demo')}>{live?'LIVE':'DEMO'}</span><button className="icon notification-button" onClick={()=>setShowNotifications(v=>!v)} aria-label="Notifieringar"><Bell size={18}/>{importantNotifications>0&&<span className="notification-badge">{importantNotifications>9?"9+":importantNotifications}</span>}</button>{live?<><button className="ghost"><UserRound size={16}/>{session?.user?.name||'Min profil'}</button><button className="ghost" onClick={()=>authClient.signOut()}><LogOut size={16}/>Logga ut</button></>:<button className="primary small" onClick={()=>setAuthOpen(true)}><LogIn size={16}/>Logga in</button>}</div></header>
  {showNotifications&&<div className="notification-popover">
   <div className="notification-popover-head">
    <div><b>Notifieringar</b><span>{notifications.length?`${notifications.length} aktuella`:'Inget nytt just nu'}</span></div>
    <button className="icon-close" onClick={()=>setShowNotifications(false)} aria-label="Stäng">×</button>
   </div>
   <div className="notification-list">
    {notifications.length===0?<div className="notification-empty">När nya kort matchar dina sökningar eller någon skickar ett bytesförslag syns det här.</div>:
    notifications.map(n=><button key={n.id} className={'notification-row '+(n.priority==='high'?'important':'')} onClick={()=>{
      if(n.trade_id){setTab('trades');setSelectedTrade(n.trade_id)}
      else if(n.match_id){setTab('match')}
      setShowNotifications(false)
    }}>
     <span className="notification-dot">{n.type==='mutual_match'?'♥':n.type==='trade'?'↔':'●'}</span>
     <span className="notification-copy"><b>{n.title}</b><small>{n.body}</small></span>
    </button>)}
   </div>
  </div>}
  <section className="hero"><div><span className="eyebrow"><Sparkles size={15}/>Smarta bytesmatchningar</span><h1>Byt kort med någon som faktiskt vill ha dina.</h1><p>Kortbyte matchar dina byteskort mot andra samlares söklistor och lyfter ömsesidiga matcher först.</p><div className="hero-actions"><button className="primary" onClick={()=>setCardOpen(true)}><Plus/>Lägg upp kort</button><button className="secondary" onClick={()=>setWantedOpen(true)}><Search/>Lägg till sökning</button></div></div><aside className="match-readiness"><span className="eyebrow">Din matchgrund</span><strong>{matchingReady?'Bra grund för matchning':'Fyll på för bättre träffar'}</strong><div className="readiness-row"><span>Byteskort</span><b>{active}</b></div><div className="readiness-row"><span>Sökningar</span><b>{data.wanted.length}</b></div><small>{matchingReady?'Du har både HAVE och WANT. Kortbyte kan leta efter ömsesidiga möjligheter.':'Sikta först på minst 3 byteskort och 3 tydliga sökningar.'}</small>{!matchingReady&&<button className="secondary" onClick={()=>active<3?setCardOpen(true):setWantedOpen(true)}>{active<3?'Lägg upp nästa kort':'Lägg till nästa sökning'}</button>}<div className="plan-footnote"><span>{plan.toUpperCase()}</span><small>{plan==='free'?`${active}/50 aktiva kort`:'Obegränsade byteskort'}</small></div></aside></section>
  {!live&&<div className="demo-note"><ShieldCheck/><div><b>Demo-läge</b><span>Neon-versionen är redo. Logga in när miljövariablerna är kopplade för riktiga konton och databas.</span></div></div>}
  {notice&&<div className="notice">{notice}<button onClick={()=>setNotice('')}><X size={16}/></button></div>}
  {!onboardingDone&&session?.user&&<section className="onboarding-card">
   <div className="onboarding-copy"><span className="eyebrow">Kom igång</span><h2>Ge Kortbyte något att matcha</h2><small className="free-network-note">Gratis: upp till 50 aktiva kort</small>
    {process.env.NODE_ENV!=='production'&&<div className="dev-seed-actions">
      <button type="button" onClick={async()=>{try{setNotice('');await apiJson('/api/dev/seed',{method:'POST'});await refresh();}catch(e:any){setNotice(e.message)}}}>+ Lägg in testdata</button>
      <button type="button" onClick={async()=>{try{setNotice('');await apiJson('/api/dev/seed',{method:'DELETE'});await refresh();}catch(e:any){setNotice(e.message)}}}>Rensa testdata</button>
      <button type="button" onClick={async()=>{try{setNotice('');await apiJson('/api/dev/scenario',{method:'POST'});await refresh();}catch(e:any){setNotice(e.message)}}}>Skapa demoscenario</button>
      <button type="button" onClick={async()=>{try{setNotice('');await apiJson('/api/dev/scenario',{method:'DELETE'});await refresh();}catch(e:any){setNotice(e.message)}}}>Rensa demoscenario</button>
    </div>}<p>Lägg upp kort du kan byta bort och berätta vad du söker. Sedan letar Kortbyte efter personer där båda kan få något de vill ha.</p></div>
   <div className="onboarding-steps">
    <button className={onboardingCards>=3?'done':''} onClick={()=>setCardOpen(true)}><b>{onboardingCards>=3?'✓':'1'}</b><span><strong>Lägg upp 3 kort</strong><small>{onboardingCards}/3 klara</small></span></button>
    <button className={onboardingWants>=3?'done':''} onClick={()=>setWantedOpen(true)}><b>{onboardingWants>=3?'✓':'2'}</b><span><strong>Lägg till 3 sökningar</strong><small>{onboardingWants}/3 klara</small></span></button>
    <div><b>3</b><span><strong>Kortbyte börjar leta</strong><small>Efter ömsesidiga matchningar</small></span></div>
   </div>
  </section>}

  <section className="dashboard-pulse" aria-label="Din överblick">
   <button className={'pulse-card '+(actionTradeCount>0?'pulse-action':'')} onClick={()=>setTab('trades')}>
    <span>Att göra nu</span><strong>{actionTradeCount}</strong><p>{actionTradeCount>0?`${actionTradeCount} ${actionTradeCount===1?'byte behöver':'byten behöver'} din uppmärksamhet.`:'Inget byte väntar på dig just nu.'}</p><b>{actionTradeCount>0?'Öppna Mina byten →':'Se pågående byten →'}</b>
   </button>
   <button className={'pulse-card '+(mutualCount>0?'pulse-mutual':'')} onClick={()=>setTab('match')}>
    <span>Ömsesidiga matcher</span><strong>{mutualCount}</strong><p>{mutualCount>0?`${mutualCount} ${mutualCount===1?'match där intresset går':'matcher där intresset går'} åt båda håll.`:'Ingen ömsesidig match ännu. Fler relevanta HAVE/WANT-data ökar chansen.'}</p><b>{mutualCount>0?'Se bästa matcherna →':'Se alla matchningar →'}</b>
   </button>
   <button className={'pulse-card '+(matchingReady?'pulse-ready':'pulse-needs-data')} onClick={()=>{if(active<3)setTab('cards');else if(data.wanted.length<3)setTab('wanted');else setTab('match')}}>
    <span>Matchberedskap</span><strong>{matchingReady?'Redo':'Behöver data'}</strong><p>{active} byteskort · {data.wanted.length} sökningar</p><b>{matchingReady?'Matchmotorn har en bra grund →':active<3?'Fyll på Mina kort →':'Fyll på Jag söker →'}</b>
   </button>
  </section>

  <nav className="tabs"><button className={tab==='match'?'active':''} onClick={()=>setTab('match')}>Matchningar <em>{data.matches.length}</em></button><button className={tab==='cards'?'active':''} onClick={()=>setTab('cards')}>Mina kort <em>{data.cards.length}</em></button><button className={tab==='wanted'?'active':''} onClick={()=>setTab('wanted')}>Jag söker <em>{data.wanted.length}</em></button><button className={tab==='trades'?'active':''} onClick={()=>setTab('trades')}>Mina byten <em>{data.trades.length}</em></button></nav>
  {busy&&<div className="loading"><Loader2 className="spin"/>Uppdaterar…</div>}
  {tab==='match'&&<section><div className="section-title"><div><h2>Matchningar</h2><p>Ömsesidiga möjligheter först. Ensidiga träffar visas separat så att de inte döljer byten som faktiskt kan hända.</p></div></div>{data.matches.length===0?<div className="empty action-empty"><Search/><h3>Ingen relevant match ännu</h3><p>Matchningen blir bättre när du både har byteskort och tydliga sökningar. Lägg hellre till fler relevanta kort och önskemål än breda sökord.</p><div className="empty-actions"><button className="secondary" onClick={()=>setCardOpen(true)}>Lägg upp byteskort</button><button className="primary" onClick={()=>setWantedOpen(true)}>Lägg till sökning</button></div></div>:(()=>{
    const mutual=data.matches.filter(m=>m.is_mutual);
    const oneWay=data.matches.filter(m=>!m.is_mutual);
    const renderMatch=(m:CardItem)=><article className={'match '+(m.is_mutual?'mutual':'one-way')} key={m.id}><CardArt card={m}/><div className="match-body"><div className="match-top"><span className="score">{matchStrength(m.match_score)}</span>{m.is_mutual&&<span className="mutual-pill"><CheckCircle2 size={14}/>Ömsesidig</span>}</div><small>{m.owner_name||'Samlare'}</small>
<div className="trust-profile">
 <div className="trust-top">
  <b>{trustLabel(m.owner_completed_trades||0,m.owner_rating,m.owner_review_count||0)}</b>
  {m.owner_rating?<span>★ {Number(m.owner_rating).toFixed(1)} <small>({m.owner_review_count||0})</small></span>:<span>Inga omdömen än</span>}
 </div>
 <div className="trust-meta">
  <span>{m.owner_completed_trades||0} genomförda byten</span>
  <span>{memberSinceLabel(m.owner_member_since)}</span>
 </div>
</div>
<h3>{m.title}</h3><p>{[m.category,m.card_set,m.card_year].filter(Boolean).join(' · ')}</p>{m.is_mutual&&m.mutual_card_title?<div className="exchange-fit"><div><small>Du vill ha</small><b>{m.title}</b></div><ArrowLeftRight size={18}/><div><small>{m.owner_name||'Samlaren'} vill ha</small><b>{m.mutual_card_title}</b></div><p><Heart size={13}/> Intresset går åt båda håll — det här är den typ av match Kortbyte prioriterar.</p></div>:<div className="one-way-fit"><small>Du söker detta kort</small><p>Vi hittar ännu inget av dina byteskort som den andra samlaren tydligt söker. Därför visas träffen längre ned.</p></div>}{m.wanted_query&&<div className="match-reason"><Sparkles size={14}/><span><b>{m.match_reason||'Relevant träff'}</b> · din sökning: {m.wanted_query}{m.matched_terms?.length?<> · träff på {m.matched_terms.join(', ')}</>:null}</span></div>}{m.bundle_suggestions?.length?<div className="bundle-options"><div className="bundle-options-title">💡 Relevanta bytesförslag</div>{m.bundle_suggestions.map((b)=><div className={'bundle-suggestion '+(b.strategy==='balanced'?'secondary-bundle':'')} key={b.strategy}><div className="bundle-head"><span>{b.strategy==='mutual_fit'?'Bäst för båda':'Alternativ: närmast i värde'}</span><b>{b.label}</b></div><div className="bundle-cards">{b.card_titles.join(' + ')}</div>{b.total_value!==null&&b.target_value!==null&&<div className="bundle-values">Dina kort ca {b.total_value} kr · kortet du vill ha ca {b.target_value} kr</div>}<div className="bundle-explanation">{b.explanation}</div><button className="mini-btn" onClick={()=>{setOfferIds(b.card_ids);setTradeTarget(m)}}>Använd detta paket</button></div>)}</div>:null}{m.estimated_value_sek&&<b className="card-value">ca {Number(m.estimated_value_sek).toLocaleString('sv-SE')} kr</b>}<div className="card-actions"><button className={m.is_mutual?'primary':'secondary'} onClick={()=>{setTradeTarget(m);setOfferIds(m.bundle_suggestions?.find(b=>b.strategy==='mutual_fit')?.card_ids||[])}}>{m.is_mutual?'Skapa bytesförslag':'Föreslå ändå'}</button></div></div></article>;
    return <div className="match-groups">{mutual.length>0&&<div className="match-group mutual-group"><div className="match-group-head"><div><b>Ömsesidiga matcher</b><span>{mutual.length} {mutual.length===1?'möjlighet':'möjligheter'} där båda söker något hos den andra</span></div><small>Prioriteras först</small></div><div className="grid">{mutual.map(renderMatch)}</div></div>}{oneWay.length>0&&<div className="match-group one-way-group"><div className="match-group-head"><div><b>Andra möjliga träffar</b><span>{oneWay.length} utvalda träffar där intresset ännu inte går åt båda håll</span></div><small>Mer osäkra</small></div><div className="grid">{oneWay.map(renderMatch)}</div></div>}</div>
   })()}</section>}
  {tab==='cards'&&<section><div className="section-title"><div><h2>Mina byteskort</h2><p>Kort du kan tänka dig att byta bort. Fler relevanta kort ökar chansen till en ömsesidig match.</p></div><button className="primary" onClick={()=>setCardOpen(true)}><Plus/>Lägg upp kort</button></div>{data.cards.length===0?<div className="empty action-empty"><ImageIcon/><h3>Din bytespärm är tom</h3><p>Lägg upp några kort du faktiskt kan tänka dig att byta bort. Du behöver inte katalogisera hela samlingen.</p><button className="primary" onClick={()=>setCardOpen(true)}>Lägg upp första kortet</button></div>:<div className="my-card-grid">{data.cards.map(c=><article className={'my-card '+(c.locked_trade_id?'locked':'')} key={c.id}><CardArt card={c}/><div className="my-card-body"><div className="my-card-top"><span className="category-chip">{c.category}</span>{c.locked_trade_id&&<span className="locked-chip"><LockKeyhole size={13}/>I pågående byte</span>}</div><h3>{c.title}</h3><p>{[c.card_set,c.card_year].filter(Boolean).join(' · ')||'Ingen set/år angivet'}</p><div className="my-card-footer"><strong>{c.estimated_value_sek?`${Number(c.estimated_value_sek).toLocaleString('sv-SE')} kr`:'Värde ej angivet'}</strong>{live&&!c.locked_trade_id&&<button className="icon danger" title="Ta bort kort" onClick={()=>api('/api/cards?id='+c.id,'DELETE')}><Trash2 size={17}/></button>}</div></div></article>)}</div>}</section>}
  {tab==='wanted'&&<section><div className="section-title"><div><h2>Jag söker</h2><p>Beskriv kort du faktiskt vill byta till dig. Exakta uppgifter minskar felträffar.</p></div><button className="primary" onClick={()=>setWantedOpen(true)}><Plus/>Ny sökning</button></div>{data.wanted.length===0?<div className="empty action-empty"><Search/><h3>Du söker inget ännu</h3><p>Lägg till några kort du verkligen vill ha. Kortbyte använder dem för att hitta samlare där intresset kan gå åt båda håll.</p><button className="primary" onClick={()=>setWantedOpen(true)}>Lägg till första sökningen</button></div>:<div className="list">{data.wanted.map(w=><div className="row" key={w.id}><div><b>{w.query}</b><span>{w.category||'Alla kategorier'}</span></div>{live&&<button className="icon danger" onClick={()=>api('/api/wanted?id='+w.id,'DELETE')}><Trash2 size={17}/></button>}</div>)}</div>}</section>}
  {tab==='trades'&&<section><div className="section-title"><div><h2>Mina byten</h2><p>Det viktigaste först: byten där du behöver göra något visas överst.</p></div></div>{data.trades.length?(()=>{const sorted=[...data.trades].sort((a,b)=>tradeListSort(a,b,data.user_id));const action=sorted.filter(t=>tradeListBucket(t,data.user_id).group==='action');const active=sorted.filter(t=>tradeListBucket(t,data.user_id).group==='active');const history=sorted.filter(t=>tradeListBucket(t,data.user_id).group==='history');const renderTrade=(t:TradeItem)=><button className={'trade-row '+(tradeListBucket(t,data.user_id).group==='action'?'trade-row-action':tradeListBucket(t,data.user_id).group==='history'?'trade-row-history':'')} key={t.id} onClick={()=>setSelectedTrade(t.id)}><div><b>{t.other_name}</b><span>{tradeSummary(t,data.user_id)} · {new Date(t.created_at).toLocaleDateString('sv-SE')}</span><small className={'trade-next trade-next-'+tradeNextStep(t,data.user_id).tone}>{tradeNextStep(t,data.user_id).title}</small></div><span className={'status status-'+t.status}>{statusText(t.status)}</span></button>;return <div className="trade-groups">{action.length>0&&<div className="trade-group"><div className="trade-group-head"><div><b>Behöver din uppmärksamhet</b><span>{action.length} {action.length===1?'byte':'byten'}</span></div><small>Din nästa åtgärd</small></div><div className="list">{action.map(renderTrade)}</div></div>}{active.length>0&&<div className="trade-group"><div className="trade-group-head"><div><b>Pågående</b><span>{active.length} {active.length===1?'byte':'byten'}</span></div><small>Väntar på motparten eller leverans</small></div><div className="list">{active.map(renderTrade)}</div></div>}{history.length>0&&<details className="trade-history"><summary><span>Historik</span><small>{history.length} avslutade eller ersatta</small></summary><div className="list">{history.map(renderTrade)}</div></details>}</div>})():<div className="empty"><ArrowLeftRight/><h3>Inga byten ännu</h3><p>När du hittar en match kan du föreslå ett byte direkt.</p></div>}</section>}
  <section className="steps"><h2>Så fungerar Kortbyte</h2><div><span><b>1</b>Lägg upp det du byter bort</span><span><b>2</b>Berätta vad du söker</span><span><b>3</b>Få ömsesidiga matcher</span><span><b>4</b>Kom överens och byt</span></div></section>
  {authOpen&&<Modal title={authMode==='signin'?'Logga in':'Skapa konto'} close={()=>setAuthOpen(false)}><form onSubmit={doAuth}>{authMode==='signup'&&<label>Namn<input value={name} onChange={e=>setName(e.target.value)} required/></label>}<label>E-post<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>Lösenord<input type="password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} required/></label><button className="primary" disabled={busy}>{authMode==='signin'?'Logga in':'Skapa konto'}</button><button type="button" className="textbtn" onClick={()=>setAuthMode(authMode==='signin'?'signup':'signin')}>{authMode==='signin'?'Ny här? Skapa konto':'Har du konto? Logga in'}</button></form></Modal>}
  {cardOpen&&<Modal title={cardStep==='photo'?'Fotografera kortet':'Beskriv kortet'} close={()=>{setCardOpen(false);setCardStep('photo')}}>
<form onSubmit={addCard} className="card-wizard">
 <div className="wizard-progress">
  <span className={cardStep==='photo'?'active done':'done'}>1. Bild</span>
  <span className={cardStep==='details'?'active':''}>2. Uppgifter</span>
 </div>

 {cardStep==='photo'?<>
  <div className="photo-first">
   <p className="wizard-lead">Börja med en bild. På mobilen kan du ta ett foto direkt med kameran.</p>
   <div className="image-upload-box">
    {cardImagePreview?
     <div className="image-preview-wrap large">
      <img src={cardImagePreview} alt="Förhandsvisning av kort"/>
      <div className="image-preview-actions">
       <label className="secondary image-replace">Byt bild<input type="file" capture="environment" accept="image/jpeg,image/png,image/webp" onChange={e=>{const f=e.target.files?.[0]||null;if(!f)return;if(f.size>8*1024*1024){setNotice('Bilden får vara högst 8 MB.');return;}setCardImage(f);setCardImagePreview(URL.createObjectURL(f));setUploadedCardImageUrl('');setAiAnalysis(null)}}/></label>
       <button type="button" className="image-remove" onClick={()=>{setCardImage(null);setCardImagePreview('');setUploadedCardImageUrl('');setAiAnalysis(null)}}>Ta bort</button>
      </div>
     </div>:
     <label className="image-drop image-drop-large">
      <span className="image-drop-icon">📷</span>
      <b>Ta foto eller välj bild</b>
      <small>JPG, PNG eller WebP · max 8 MB</small>
      <input type="file" capture="environment" accept="image/jpeg,image/png,image/webp" onChange={e=>{const f=e.target.files?.[0]||null;if(!f)return;if(f.size>8*1024*1024){setNotice('Bilden får vara högst 8 MB.');return;}setCardImage(f);setCardImagePreview(URL.createObjectURL(f));setUploadedCardImageUrl('');setAiAnalysis(null)}}/>
     </label>}
   </div>
   <div className="ai-photo-actions">
    {cardImage&&<button type="button" className="primary ai-analyze-btn" disabled={aiAnalyzing||imageUploading} onClick={analyzeCardImage}>
      {aiAnalyzing?'Analyserar kortet…':'✨ Läs av kortet automatiskt'}
    </button>}
    <div className="wizard-actions">
     <button type="button" className="secondary" onClick={()=>setCardStep('details')}>Hoppa över bild</button>
     <button type="button" className="secondary" onClick={()=>setCardStep('details')}>{cardImage?'Fyll i själv':'Fortsätt'}</button>
    </div>
   </div>
   <small className="hint">AI:n ger bara förslag. Kontrollera alltid uppgifterna innan du sparar kortet.</small>
  </div>
 </>:<>
  <div className="details-first">
   {cardImagePreview&&<div className="wizard-thumb"><img src={cardImagePreview} alt="Valt kort"/><button type="button" onClick={()=>setCardStep('photo')}>Byt bild</button></div>}
   {aiAnalysis&&<div className="ai-result-card">
    <div><b>✨ AI-kontroll</b><span>{Math.round(Number(aiAnalysis.overall_confidence)||0)}% totalt</span></div>
    <p className="ai-rule">Grönt = hög säkerhet och kan fyllas automatiskt. Gult = kontrollera. Grått = för osäkert för att använda automatiskt.</p>
    <div className="ai-fields">
     {Object.entries(aiAnalysis.fields||{}).map(([key,raw]:any)=>{const f:any=raw;if(!f?.value)return null;const c=Number(f.confidence)||0;const label:any={player:'Spelare',year:'År',set:'Set',card_number:'Kortnr',numbering:'Numrering',category:'Kategori'};return <div className={'ai-field '+(c>=85?'high':c>=60?'medium':'low')} key={key}><div><b>{label[key]||key}</b><strong>{f.value}</strong><span>{c}%</span></div>{f.evidence&&<small>{f.evidence}</small>}{c<85&&c>=60&&<button type="button" onClick={()=>{if(key==='player')setCardForm({...cardForm,title:f.value});if(key==='year')setCardForm({...cardForm,card_year:f.value});if(key==='set')setCardForm({...cardForm,card_set:f.value});if(key==='category'&&categories.includes(f.value))setCardForm({...cardForm,category:f.value});if(key==='numbering')setAcceptedHints(v=>Array.from(new Set([...v,`Numrerat ${f.value}`])))}}>Använd förslaget</button>}</div>})}
    </div>
    {aiAnalysis.notes&&<small className="ai-notes">{aiAnalysis.notes}</small>}
    <button type="button" onClick={()=>setCardStep('photo')}>Analysera igen</button>
   </div>}

   <label className="focus-field">Kort / spelare<input autoFocus value={cardForm.title} onChange={e=>setCardForm({...cardForm,title:e.target.value})} placeholder="t.ex. Mats Sundin Auto /99" required/></label>
   {(cardHints.year||cardHints.numbering||smartTraits.length>0||cardHints.normalizedTitle!==cardForm.title)&&cardForm.title.trim().length>=3&&
    <div className="smart-card-box">
     <div className="smart-card-head"><span>✨ Smart hjälp</span><small>Förslag från det du skrev</small></div>
     {cardHints.normalizedTitle&&cardHints.normalizedTitle!==cardForm.title&&
      <button type="button" className="smart-suggestion wide" onClick={()=>setCardForm({...cardForm,title:cardHints.normalizedTitle||cardForm.title})}>
       <span>Städa rubriken</span><b>{cardHints.normalizedTitle}</b>
      </button>}
     <div className="smart-chip-row">
      {cardHints.year&&cardHints.year!==cardForm.card_year&&
       <button type="button" className="smart-chip" onClick={()=>setCardForm({...cardForm,card_year:cardHints.year||''})}>År {cardHints.year} <b>+</b></button>}
      {cardHints.numbering&&<span className="smart-chip info">Numrerat {cardHints.numbering}</span>}
      {smartTraits.map(t=><button key={t} type="button" className="smart-chip" onClick={()=>setAcceptedHints(v=>[...v,t])}>{t} <b>+</b></button>)}
     </div>
     {acceptedHints.length>0&&<div className="accepted-hints">{acceptedHints.map(t=><span key={t}>{t}<button type="button" onClick={()=>setAcceptedHints(v=>v.filter(x=>x!==t))}>×</button></span>)}</div>}
    </div>}

   <div className="quick-fields">
    <label>Kategori<select value={cardForm.category} onChange={e=>setCardForm({...cardForm,category:e.target.value})}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
    <label>År<input inputMode="numeric" value={cardForm.card_year} onChange={e=>setCardForm({...cardForm,card_year:e.target.value})} placeholder="1994"/></label>
   </div>
   <label>Set / serie <span className="optional">valfritt</span><input value={cardForm.card_set} onChange={e=>setCardForm({...cardForm,card_set:e.target.value})} placeholder="t.ex. Upper Deck"/></label>
   <details className="identity-details">
    <summary>Exakt kortidentitet <span>för bättre matchningar</span></summary>
    <div className="identity-grid">
     <label>Spelare/person<input value={cardForm.player_name} onChange={e=>setCardForm({...cardForm,player_name:e.target.value})} placeholder="Mats Sundin"/></label>
     <label>Kortnummer<input value={cardForm.card_number} onChange={e=>setCardForm({...cardForm,card_number:e.target.value})} placeholder="123"/></label>
     <label>Variant / parallel<input value={cardForm.parallel} onChange={e=>setCardForm({...cardForm,parallel:e.target.value})} placeholder="Refractor, Gold, Holo…"/></label>
     <label>Serialisering<input value={cardForm.serial_number} onChange={e=>setCardForm({...cardForm,serial_number:e.target.value})} placeholder="23/99"/></label>
     <label>Gradering<input value={cardForm.grading_company} onChange={e=>setCardForm({...cardForm,grading_company:e.target.value})} placeholder="PSA, BGS…"/></label>
     <label>Betyg<input type="number" min="0" max="10" step="0.5" value={cardForm.grade} onChange={e=>setCardForm({...cardForm,grade:e.target.value})} placeholder="10"/></label>
    </div>
    <small>Fyll bara i det du vet. Uppgifterna hjälper Kortbyte skilja liknande kort åt.</small>
   </details>
   <label>Ungefärligt värde <span className="optional">valfritt</span><div className="money-field"><input type="number" min="0" inputMode="numeric" value={cardForm.estimated_value_sek} onChange={e=>setCardForm({...cardForm,estimated_value_sek:e.target.value})} placeholder="0"/><span>kr</span></div></label>
   <div className="wizard-save">
    <button type="button" className="secondary" onClick={()=>setCardStep('photo')}>Tillbaka</button>
    <button className="primary" disabled={imageUploading}>{imageUploading?'Laddar upp bild…':'Lägg upp kort'}</button>
   </div>
   <small className="hint">Du kan ändra uppgifterna senare. Det viktigaste nu är att få upp kortet snabbt.</small>
  </div>
 </>}
</form></Modal>}
  {wantedOpen&&<Modal title="Vad söker du?" close={()=>setWantedOpen(false)}><form onSubmit={addWanted}>
   <label>Sökning<input value={wantedForm.query} onChange={e=>setWantedForm({...wantedForm,query:e.target.value})} placeholder="t.ex. Mats Sundin Auto" required/></label>
   <label>Kategori<select value={wantedForm.category} onChange={e=>setWantedForm({...wantedForm,category:e.target.value})}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
   <details className="identity-details wanted-identity">
    <summary>Gör sökningen exakt <span>valfritt</span></summary>
    <div className="identity-grid">
     <label>Spelare/person<input value={wantedForm.player_name} onChange={e=>setWantedForm({...wantedForm,player_name:e.target.value})} placeholder="Mats Sundin"/></label>
     <label>År<input value={wantedForm.card_year} onChange={e=>setWantedForm({...wantedForm,card_year:e.target.value})} placeholder="1994"/></label>
     <label>Set / serie<input value={wantedForm.card_set} onChange={e=>setWantedForm({...wantedForm,card_set:e.target.value})} placeholder="Upper Deck"/></label>
     <label>Kortnummer<input value={wantedForm.card_number} onChange={e=>setWantedForm({...wantedForm,card_number:e.target.value})} placeholder="123"/></label>
     <label>Variant / parallel<input value={wantedForm.parallel} onChange={e=>setWantedForm({...wantedForm,parallel:e.target.value})} placeholder="Refractor, Gold…"/></label>
    </div>
    <small>Ju mer exakt du är, desto färre felaktiga matcher får du.</small>
   </details>
   <button className="primary">Spara sökning</button>
  </form></Modal>}
  {selectedTrade&&(()=>{const t=data.trades.find(x=>x.id===selectedTrade);if(!t)return null;const me=data.user_id;const receiver=t.receiver_id===me;const proposer=t.proposer_id===me;const f=t.fulfillment||{};const myShipped=proposer?f.proposer_shipped_at:f.receiver_shipped_at;const myReceived=proposer?f.proposer_received_at:f.receiver_received_at;const otherShipped=proposer?f.receiver_shipped_at:f.proposer_shipped_at;const otherReceived=proposer?f.receiver_received_at:f.proposer_received_at;const otherTracking=proposer?f.tracking_receiver:f.tracking_proposer;const nextStep=tradeNextStep(t,me);const offered=t.items.filter(i=>i.side==='offered');const requested=t.items.filter(i=>i.side==='requested');const cardsIGet=receiver?offered:requested;const cardsIGive=receiver?requested:offered;const directionTitle=receiver?`Förslag från ${t.other_name}`:`Ditt förslag till ${t.other_name}`;return <Modal title={'Byte med '+t.other_name} close={()=>setSelectedTrade(null)}><div className="trade-detail"><div className="trade-statusline"><div><small>{directionTitle}</small><div><span className={'status status-'+t.status}>{statusText(t.status)}</span>{t.parent_trade_id&&<small className="counter-label">Motbud</small>}</div></div></div><div className={'next-step-panel next-step-'+nextStep.tone}><div><small>Nästa steg</small><b>{nextStep.title}</b><span>{nextStep.body}</span></div></div>{t.note&&<div className="trade-note"><small>Meddelande i förslaget</small><span>“{t.note}”</span></div>}<div className="trade-decision"><div className="trade-side receive-side"><small>Du får</small>{cardsIGet.map(i=><b key={i.id}>{i.title}</b>)}{!cardsIGet.length&&<span>Inga kort</span>}</div><ArrowLeftRight/><div className="trade-side give-side"><small>Du ger</small>{cardsIGive.map(i=><b key={i.id}>{i.title}</b>)}{!cardsIGive.length&&<span>Inga kort</span>}</div></div>{t.status==='pending'&&receiver&&<div className="decision-panel"><div><b>Är det här ett byte du vill göra?</b><p>Kontrollera korten ovan. Acceptera låser korten till bytet. Motbud låter dig ändra vad du får eller ger.</p></div><div className="actionbar"><button className="primary" onClick={()=>tradeAction(t.id,'accept')}>Acceptera bytet</button><button onClick={()=>{const t=data.trades.find(x=>x.id===selectedTrade);if(!t)return;const mine=t.items.filter(i=>i.owner_id===data.user_id).map(i=>i.id);const theirs=t.items.filter(i=>i.owner_id!==data.user_id).map(i=>i.id);setCounterOfferIds(mine);setCounterRequestIds(theirs);setCounterNote('');setCounterOpen(true)}}>Gör motbud</button><button className="secondary danger-text" onClick={()=>tradeAction(t.id,'decline')}>Avböj</button></div></div>}{t.status==='pending'&&proposer&&<div className="pending-proposal-info"><p>Förslaget väntar på svar från {t.other_name}. Du kan dra tillbaka det så länge det inte har accepterats.</p><button className="secondary danger-text" onClick={()=>tradeAction(t.id,'cancel')}>Dra tillbaka förslaget</button></div>}{t.status==='accepted'&&<div className="fulfillment"><h3>Leverans</h3><div className="delivery-parties"><div className="delivery-party"><b>Du</b><span className={myShipped?'done':''}>{myShipped?'✓ Skickat':'Inte skickat ännu'}</span><span className={myReceived?'done':''}>{myReceived?'✓ Mottaget':'Inte mottaget ännu'}</span></div><div className="delivery-party"><b>{t.other_name}</b><span className={otherShipped?'done':''}>{otherShipped?'✓ Skickat':'Inte skickat ännu'}</span><span className={otherReceived?'done':''}>{otherReceived?'✓ Mottaget':'Inte mottaget ännu'}</span>{otherTracking&&<small>Spårning: {otherTracking}</small>}</div></div>{!myShipped&&<div className="tracking-row"><input placeholder="Spårningsnummer (frivilligt)" value={tracking} onChange={e=>setTracking(e.target.value)} maxLength={200}/><button className="primary" onClick={()=>tradeAction(t.id,'shipped',{tracking})}>Jag har skickat</button></div>}{myShipped&&!myReceived&&<div className="receive-step">{otherShipped?<button className="primary" onClick={()=>tradeAction(t.id,'received')}>Jag har fått mina kort</button>:<div className="muted">Mottaget-knappen blir tillgänglig när {t.other_name} också har markerat som skickat.</div>}</div>}</div>}<div className="chat"><h3>Meddelanden</h3><div className="messages">{t.messages?.length?t.messages.map(m=><div className={'message '+(m.sender_id===me?'mine':'')} key={m.id}><b>{m.sender_name}</b><span>{m.body}</span><small>{new Date(m.created_at).toLocaleString('sv-SE')}</small></div>):<p className="hint">Ingen har skrivit något ännu.</p>}</div>{!['declined','cancelled','completed'].includes(t.status)&&<form onSubmit={e=>sendMessage(t.id,e)} className="chat-form"><input value={chatText} onChange={e=>setChatText(e.target.value)} placeholder="Skriv till motparten…"/><button className="primary">Skicka</button></form>}</div>{t.status==='completed'&&!t.reviewed_by_me&&<form onSubmit={e=>sendReview(t.id,e)} className="review-form"><h3>Hur gick bytet?</h3><label>Betyg<select value={reviewRating} onChange={e=>setReviewRating(Number(e.target.value))}>{[5,4,3,2,1].map(n=><option value={n} key={n}>{n} / 5</option>)}</select></label><label>Kommentar<textarea value={reviewComment} onChange={e=>setReviewComment(e.target.value)} placeholder="Frivillig kommentar"/></label><button className="primary">Lämna omdöme</button></form>}{t.status==='completed'&&t.reviewed_by_me&&<div className="successbox"><CheckCircle2/>Tack! Du har lämnat omdöme.</div>}</div></Modal>})()}
  {tradeTarget&&<Modal title={'Föreslå byte för '+tradeTarget.title} close={()=>setTradeTarget(null)}><form onSubmit={propose}><div className="trade-target-summary"><CardArt card={tradeTarget}/><div><small>Du vill ha</small><b>{tradeTarget.title}</b><span>{[tradeTarget.card_set,tradeTarget.card_year].filter(Boolean).join(' · ')}</span>{targetValue>0&&<strong>ca {targetValue.toLocaleString('sv-SE')} kr</strong>}</div></div>{tradeTarget.is_mutual&&tradeTarget.mutual_card_title?<div className="proposal-fit"><Heart size={16}/><div><b>Bra utgångsläge</b><span>{tradeTarget.owner_name||'Samlaren'} söker något som matchar ditt <strong>{tradeTarget.mutual_card_title}</strong>. Vi markerar relevanta kort nedan.</span></div></div>:<div className="proposal-caution"><b>Ingen ömsesidig träff ännu</b><span>Välj bara kort som du tror att {tradeTarget.owner_name||'samlaren'} faktiskt kan vilja ha. Färre relevanta förslag är bättre än många chansningar.</span></div>}<p className="modalcopy">Välj ett eller flera kort som du vill erbjuda. Motparten ser bara de kort du faktiskt väljer.</p>{data.cards.filter(c=>c.is_active!==false&&!c.locked_trade_id).length===0?<div className="empty compact-empty"><p>Du har inga tillgängliga byteskort just nu.</p><button type="button" className="primary" onClick={()=>{setTradeTarget(null);setCardOpen(true)}}>Lägg upp ett kort</button></div>:<div className="offer-list">{data.cards.filter(c=>c.is_active!==false&&!c.locked_trade_id).map(c=><label className="check offer-check" key={c.id}><input type="checkbox" checked={offerIds.includes(c.id)} onChange={e=>setOfferIds(e.target.checked?[...offerIds,c.id]:offerIds.filter(x=>x!==c.id))}/><span><b>{c.title}{suggestedOfferIds.has(c.id)&&<em className="recommended-chip">Rekommenderad</em>}</b><small>{c.category}{c.estimated_value_sek?` · ca ${Number(c.estimated_value_sek).toLocaleString('sv-SE')} kr`:''}</small></span></label>)}</div>}{offerIds.length>0&&<div className={'value-balance '+(balancePct===null?'unknown':balancePct>=80&&balancePct<=120?'balanced':balancePct<80?'low':'high')}><div><small>Ditt erbjudande</small><strong>{offeredValue?`${offeredValue.toLocaleString('sv-SE')} kr`:'Värde saknas'}</strong></div><ArrowLeftRight/><div><small>Kortet du vill ha</small><strong>{targetValue?`${targetValue.toLocaleString('sv-SE')} kr`:'Värde saknas'}</strong></div><p>{balancePct===null?'Värdebalansen kan inte beräknas förrän båda sidor har ungefärliga värden.':balancePct>=80&&balancePct<=120?'Värdena ligger ungefär i samma nivå.':balancePct<80?'Ditt erbjudande har lägre angivet värde. Det kan fortfarande vara ett bra byte om båda vill ha korten.':'Ditt erbjudande har högre angivet värde. Kontrollera att det känns rimligt för dig.'}</p></div>}{offerIds.length>0&&<div className="proposal-summary"><small>Du erbjuder {offerIds.length} {offerIds.length===1?'kort':'kort'}</small><b>{selectedOfferCards.map(c=>c.title).join(' + ')}</b><ArrowLeftRight size={15}/><small>Du vill ha</small><b>{tradeTarget.title}</b></div>}<label>Meddelande<textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Frivillig kommentar, t.ex. om frakt eller varför du föreslår bytet"/></label><button className="primary" disabled={!offerIds.length}>Skicka bytesförslag</button><small className="hint">Värden är bara vägledning. Kortbyte avgör aldrig om ett byte är “rätt” eller “fel”.</small></form></Modal>}
 
{counterOpen&&selectedTrade&&(()=>{const t=data.trades.find(x=>x.id===selectedTrade);if(!t)return null;const myCards=(data.cards||[]).filter(c=>c.is_active!==false&&!c.locked_trade_id);const theirCurrent=t.items.filter(i=>i.owner_id!==data.user_id);const myCurrent=t.items.filter(i=>i.owner_id===data.user_id);const candidateTheirCards=(t.other_cards&&t.other_cards.length?t.other_cards:theirCurrent);const currentGiveIds=myCurrent.map(i=>i.id).sort();const currentGetIds=theirCurrent.map(i=>i.id).sort();const nextGiveIds=[...counterOfferIds].sort();const nextGetIds=[...counterRequestIds].sort();const unchanged=currentGiveIds.join('|')===nextGiveIds.join('|')&&currentGetIds.join('|')===nextGetIds.join('|');const selectedMine=myCards.filter(c=>counterOfferIds.includes(c.id));const selectedTheirs=candidateTheirCards.filter(c=>counterRequestIds.includes(c.id));return <div className="modal-backdrop"><div className="modal counter-modal">
 <div className="modal-head"><div><small>Motbud till {t.other_name}</small><h2>Ändra förslaget</h2></div><button className="icon-close" onClick={()=>setCounterOpen(false)}>×</button></div>
 <p className="muted">Börja med att jämföra nuvarande förslag med det du vill skicka tillbaka. Motbudet ersätter inte det gamla i smyg – det blir ett nytt förslag som motparten måste ta ställning till.</p>
 <div className="counter-current"><small>Nuvarande förslag</small><div className="counter-summary"><div><span>Du får</span><b>{theirCurrent.map(c=>c.title).join(' + ')||'Inga kort'}</b></div><ArrowLeftRight size={16}/><div><span>Du ger</span><b>{myCurrent.map(c=>c.title).join(' + ')||'Inga kort'}</b></div></div></div>

 <div className="counter-grid">
  <section>
   <h3>Du ger i motbudet <small>({counterOfferIds.length} valda)</small></h3>
   <div className="counter-list">
    {myCards.map(c=><label key={c.id} className={'counter-card '+(counterOfferIds.includes(c.id)?'selected':'')}>
     <input type="checkbox" checked={counterOfferIds.includes(c.id)} onChange={()=>setCounterOfferIds(v=>v.includes(c.id)?v.filter(x=>x!==c.id):[...v,c.id])}/>
     <span><b>{c.title}{myCurrent.some(x=>x.id===c.id)&&<em className="current-chip">Ingår nu</em>}</b><small>{[c.card_set,c.card_year].filter(Boolean).join(' · ')||c.category}{c.estimated_value_sek?` · ca ${c.estimated_value_sek} kr`:''}</small></span>
    </label>)}
   </div>
  </section>

  <section>
   <h3>Du får i motbudet <small>({counterRequestIds.length} valda)</small></h3>
   <div className="counter-list">
    {candidateTheirCards.map(c=><label key={c.id} className={'counter-card '+(counterRequestIds.includes(c.id)?'selected':'')}>
     <input type="checkbox" checked={counterRequestIds.includes(c.id)} onChange={()=>setCounterRequestIds(v=>v.includes(c.id)?v.filter(x=>x!==c.id):[...v,c.id])}/>
     <span><b>{c.title}{theirCurrent.some(x=>x.id===c.id)&&<em className="current-chip">Ingår nu</em>}</b><small>{'card_set' in c?[c.card_set,c.card_year,c.category].filter(Boolean).join(' · '):''}{c.value?`${'card_set' in c&&[c.card_set,c.card_year,c.category].filter(Boolean).length?' · ':''}ca ${c.value} kr`:' · Värde saknas'}</small></span>
    </label>)}
   </div>
   <p className="counter-note-help">Här visas motpartens aktiva och olåsta byteskort. Välj bara de kort du faktiskt vill få i det nya förslaget.</p>
  </section>
 </div>

 {(counterOfferIds.length>0||counterRequestIds.length>0)&&<div className={'counter-preview '+(unchanged?'unchanged':'changed')}><small>Ditt motbud</small><div className="counter-summary"><div><span>Du får</span><b>{selectedTheirs.map(c=>c.title).join(' + ')||'Välj minst ett kort'}</b></div><ArrowLeftRight size={16}/><div><span>Du ger</span><b>{selectedMine.map(c=>c.title).join(' + ')||'Välj minst ett kort'}</b></div></div><p>{unchanged?'Du har inte ändrat något ännu. Ändra minst ett kort innan du skickar motbudet.':'Kontrollera båda sidorna innan du skickar. Det här är exakt vad motparten kommer att få ta ställning till.'}</p></div>}
 <label className="field"><span>Meddelande till motparten (valfritt)</span><textarea value={counterNote} onChange={e=>setCounterNote(e.target.value)} maxLength={500} placeholder="Exempel: Skulle detta upplägg fungera bättre?"/></label>
 <div className="modal-actions"><button className="secondary" onClick={()=>setCounterOpen(false)}>Avbryt</button><button className="primary" disabled={!counterOfferIds.length||!counterRequestIds.length||unchanged} onClick={()=>submitCounter(t)}>Skicka motbud</button></div>
</div></div>})()}

</main>
}

function CardArt({card}:{card:CardItem}){return <div className="card-art">{card.image_url?<img src={card.image_url} alt={card.title}/>:<div className="card-placeholder"><ImageIcon size={27}/><span>{card.category?.slice(0,1)||'K'}</span><small>Bild kommer</small></div>}</div>}

function statusText(status:string){return ({pending:'Väntar på svar',accepted:'Accepterat',declined:'Avböjt',cancelled:'Tillbakadraget',completed:'Klart',countered:'Motbud skickat'} as Record<string,string>)[status]||status}
function tradeSummary(t:TradeItem,me?:string){const offered=t.items?.filter(i=>i.side==='offered').map(i=>i.title).join(', ')||'kort';const requested=t.items?.filter(i=>i.side==='requested').map(i=>i.title).join(', ')||'kort';return t.proposer_id===me?`Du erbjuder ${offered} → ${requested}`:`Du får ${offered} → ger ${requested}`}

function Modal({title,close,children}:{title:string;close:()=>void;children:React.ReactNode}){return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><div className="modal"><div className="modalhead"><h2>{title}</h2><button className="icon" onClick={close}><X/></button></div>{children}</div></div>}
