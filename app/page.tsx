'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Bell, CheckCircle2, Crown, Heart, ImageIcon, Loader2, LockKeyhole, LogIn, LogOut, Plus, Search, ShieldCheck, Sparkles, Trash2, UserRound, X } from 'lucide-react';
import { authClient } from '@/lib/auth-client';

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
  {id:'m1',owner_id:'anna',owner_name:'AnnaS',owner_member_since:'2026-05-12T00:00:00Z',owner_completed_trades:14,owner_rating:4.9,owner_review_count:11,title:'Mats Sundin Auto',card_set:'SP Authentic',card_year:'2023-24',category:'Hockey',estimated_value_sek:425,match_score:99,is_mutual:true,wanted_query:'Mats Sundin Auto'},
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

 async function refresh(){ if(!live)return; setBusy(true); try{const r=await fetch('/api/dashboard',{cache:'no-store'}); if(!r.ok)throw new Error((await r.json()).error||'Kunde inte läsa data'); setData(await r.json());}catch(e){setNotice(e instanceof Error?e.message:'Fel');}finally{setBusy(false);} }
 useEffect(()=>{if(live)void refresh(); else setData(demo);},[live]);
 const plan=data.profile?.plan??'free'; const active=data.cards.filter(c=>c.is_active!==false).length; const freeSlots=Math.max(0,50-active);
 const mutualCount=useMemo(()=>data.matches.filter(m=>m.is_mutual).length,[data.matches]);
 const selectedOfferCards=useMemo(()=>data.cards.filter(c=>offerIds.includes(c.id)),[data.cards,offerIds]);
 const offeredValue=useMemo(()=>selectedOfferCards.reduce((sum,c)=>sum+Number(c.estimated_value_sek||0),0),[selectedOfferCards]);
 const targetValue=Number(tradeTarget?.estimated_value_sek||0);
 const balancePct=targetValue>0&&offeredValue>0?Math.round((offeredValue/targetValue)*100):null;

 async function doAuth(e:FormEvent){e.preventDefault();setBusy(true);setNotice('');try{
   if(authMode==='signin'){const r=await authClient.signIn.email({email,password}); if(r.error)throw new Error(r.error.message||'Inloggningen misslyckades');}
   else{const r=await authClient.signUp.email({email,password,name:name||email.split('@')[0]}); if(r.error)throw new Error(r.error.message||'Kontot kunde inte skapas');}
   setAuthOpen(false);
 }catch(e){setNotice(e instanceof Error?e.message:'Fel');}finally{setBusy(false);}}
 async function api(url:string,method:string,body?:unknown){setBusy(true);setNotice('');try{const r=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const j=await r.json();if(!r.ok)throw new Error(j.error||'Något gick fel');await refresh();return true;}catch(e){setNotice(e instanceof Error?e.message:'Fel');return false;}finally{setBusy(false);}}
 async function analyzeCardImage(){
  if(!cardImage){setNotice('Välj eller fotografera ett kort först.');return;}
  setAiAnalyzing(true);
  try{
   const image_url=uploadedCardImageUrl||await uploadCardImage(cardImage); setUploadedCardImageUrl(image_url);
   const r=await fetch('/api/ai/card-analysis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image_url})});
   const j=await r.json();
   if(!r.ok) throw new Error(j.error||'Bilden kunde inte analyseras.');
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
   const r=await fetch('/api/uploads/card-image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content_type:file.type,size:file.size})});
   const j=await r.json();
   if(!r.ok) throw new Error(j.error||'Kunde inte förbereda bilduppladdningen.');
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
  const r=await fetch(`/api/trades/${trade.id}`,{
   method:'PATCH',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({
    action:'counter',
    offered_card_ids:counterOfferIds,
    requested_card_ids:counterRequestIds,
    note:counterNote
   })
  });
  const j=await r.json();
  if(!r.ok){alert(j.error||'Motbudet kunde inte skickas.');return;}
  setCounterOpen(false);
  setCounterOfferIds([]);
  setCounterRequestIds([]);
  setCounterNote('');
  setSelectedTrade(null);
  await load();
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
  <section className="hero"><div><span className="eyebrow"><Sparkles size={15}/>Smarta bytesmatchningar</span><h1>Byt kort med någon som faktiskt vill ha dina.</h1><p>Kortbyte matchar dina byteskort mot andra samlares söklistor och lyfter ömsesidiga matcher först.</p><div className="hero-actions"><button className="primary" onClick={()=>setCardOpen(true)}><Plus/>Lägg upp kort</button><button className="secondary" onClick={()=>setWantedOpen(true)}><Search/>Lägg till sökning</button></div></div><aside className="plan"><div><span>{plan.toUpperCase()}</span><Crown size={19}/></div><strong>{active} / {plan==='free'?'50':'∞'} aktiva byteskort</strong><small>{plan==='free'?`${freeSlots} gratisplatser kvar`:'Obegränsat med byteskort'}</small><hr/><b>Kortbyte Plus</b><small>29 kr/mån · 249 kr/år · kommer snart</small></aside></section>
  {!live&&<div className="demo-note"><ShieldCheck/><div><b>Demo-läge</b><span>Neon-versionen är redo. Logga in när miljövariablerna är kopplade för riktiga konton och databas.</span></div></div>}
  {notice&&<div className="notice">{notice}<button onClick={()=>setNotice('')}><X size={16}/></button></div>}
  {!onboardingDone&&session?.user&&<section className="onboarding-card">
   <div className="onboarding-copy"><span className="eyebrow">Kom igång</span><h2>Ge Kortbyte något att matcha</h2><small className="free-network-note">Gratis: upp till 50 aktiva kort</small><p>Lägg upp kort du kan byta bort och berätta vad du söker. Sedan letar Kortbyte efter personer där båda kan få något de vill ha.</p></div>
   <div className="onboarding-steps">
    <button className={onboardingCards>=3?'done':''} onClick={()=>setCardOpen(true)}><b>{onboardingCards>=3?'✓':'1'}</b><span><strong>Lägg upp 3 kort</strong><small>{onboardingCards}/3 klara</small></span></button>
    <button className={onboardingWants>=3?'done':''} onClick={()=>setWantedOpen(true)}><b>{onboardingWants>=3?'✓':'2'}</b><span><strong>Lägg till 3 sökningar</strong><small>{onboardingWants}/3 klara</small></span></button>
    <div><b>3</b><span><strong>Kortbyte börjar leta</strong><small>Efter ömsesidiga matchningar</small></span></div>
   </div>
  </section>}

  <nav className="tabs"><button className={tab==='match'?'active':''} onClick={()=>setTab('match')}>Matchningar <em>{data.matches.length}</em></button><button className={tab==='cards'?'active':''} onClick={()=>setTab('cards')}>Mina kort <em>{data.cards.length}</em></button><button className={tab==='wanted'?'active':''} onClick={()=>setTab('wanted')}>Jag söker <em>{data.wanted.length}</em></button><button className={tab==='trades'?'active':''} onClick={()=>setTab('trades')}>Mina byten <em>{data.trades.length}</em></button></nav>
  {busy&&<div className="loading"><Loader2 className="spin"/>Uppdaterar…</div>}
  {tab==='match'&&<section><div className="section-title"><div><h2>Matchningar för dig</h2><p>{mutualCount?`${mutualCount} ömsesidig match hittad först.`:'Vi visar de kort som bäst matchar dina sökningar.'}</p></div><span className="badge"><Heart size={15}/>Ömsesidigt först</span></div><div className="grid">{data.matches.map(m=><article className={'match '+(m.is_mutual?'mutual':'')} key={m.id}><CardArt card={m}/><div className="match-body"><div className="match-top"><span className="score">{m.match_score??80}% match</span>{m.is_mutual&&<span className="mutual-pill"><CheckCircle2 size={14}/>Ömsesidig</span>}</div><small>{m.owner_name||'Samlare'}</small>
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
<h3>{m.title}</h3><p>{[m.category,m.card_set,m.card_year].filter(Boolean).join(' · ')}</p>{m.wanted_query&&<div className="match-reason"><Sparkles size={14}/><span><b>{m.match_reason||'Relevant träff'}</b> · din sökning: {m.wanted_query}{m.matched_terms?.length?<> · träff på {m.matched_terms.join(', ')}</>:null}</span></div>}{m.is_mutual&&m.mutual_card_title&&<div className="mutual-explain"><Heart size={14}/><span>Ömsesidigt: <b>{m.owner_name||'Samlaren'}</b> söker något som matchar ditt <b>{m.mutual_card_title}</b>{m.mutual_want_query?<> (“{m.mutual_want_query}”)</>:null}.</span></div>}{m.bundle_suggestions?.length?<div className="bundle-options"><div className="bundle-options-title">💡 Relevanta bytesförslag</div>{m.bundle_suggestions.map((b)=><div className="bundle-suggestion" key={b.strategy}><div className="bundle-head"><span>{b.strategy==='mutual_fit'?'Bäst för båda':'Närmast i värde'}</span><b>{b.label}</b></div><div className="bundle-cards">{b.card_titles.join(' + ')}</div><div className="bundle-values">Dina kort ca {b.total_value} kr · kortet du vill ha ca {b.target_value} kr</div><div className="bundle-explanation">{b.explanation}</div><button className="mini-btn" onClick={()=>{setOfferIds(b.card_ids);setTradeTarget(m)}}>Använd detta paket</button></div>)}</div>:null}{m.estimated_value_sek&&<b className="card-value">ca {Number(m.estimated_value_sek).toLocaleString('sv-SE')} kr</b>}<div className="card-actions"><button className="secondary">Visa profil</button><button className="primary" onClick={()=>{setTradeTarget(m);setOfferIds([])}}>Föreslå byte</button></div></div></article>)}</div></section>}
  {tab==='cards'&&<section><div className="section-title"><div><h2>Mina byteskort</h2><p>Din digitala bytespärm. Bildstöd är förberett och visas automatiskt när ett kort har en bild.</p></div><button className="primary" onClick={()=>setCardOpen(true)}><Plus/>Lägg upp kort</button></div><div className="my-card-grid">{data.cards.map(c=><article className={'my-card '+(c.locked_trade_id?'locked':'')} key={c.id}><CardArt card={c}/><div className="my-card-body"><div className="my-card-top"><span className="category-chip">{c.category}</span>{c.locked_trade_id&&<span className="locked-chip"><LockKeyhole size={13}/>I pågående byte</span>}</div><h3>{c.title}</h3><p>{[c.card_set,c.card_year].filter(Boolean).join(' · ')||'Ingen set/år angivet'}</p><div className="my-card-footer"><strong>{c.estimated_value_sek?`${Number(c.estimated_value_sek).toLocaleString('sv-SE')} kr`:'Värde ej angivet'}</strong>{live&&!c.locked_trade_id&&<button className="icon danger" title="Ta bort kort" onClick={()=>api('/api/cards?id='+c.id,'DELETE')}><Trash2 size={17}/></button>}</div></div></article>)}</div></section>}
  {tab==='wanted'&&<section><div className="section-title"><div><h2>Jag söker</h2><p>Ju tydligare sökning, desto bättre matchningar.</p></div><button className="primary" onClick={()=>setWantedOpen(true)}><Plus/>Ny sökning</button></div><div className="list">{data.wanted.map(w=><div className="row" key={w.id}><div><b>{w.query}</b><span>{w.category||'Alla kategorier'}</span></div>{live&&<button className="icon danger" onClick={()=>api('/api/wanted?id='+w.id,'DELETE')}><Trash2 size={17}/></button>}</div>)}</div></section>}
  {tab==='trades'&&<section><div className="section-title"><div><h2>Mina byten</h2><p>Följ varje byte från förslag till mottaget kort och omdöme.</p></div></div>{data.trades.length?<div className="list">{data.trades.map(t=><button className="trade-row" key={t.id} onClick={()=>setSelectedTrade(t.id)}><div><b>{t.other_name}</b><span>{tradeSummary(t,data.user_id)} · {new Date(t.created_at).toLocaleDateString('sv-SE')}</span></div><span className={'status status-'+t.status}>{statusText(t.status)}</span></button>)}</div>:<div className="empty"><ArrowLeftRight/><h3>Inga byten ännu</h3><p>När du hittar en match kan du föreslå ett byte direkt.</p></div>}</section>}
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
  {selectedTrade&&(()=>{const t=data.trades.find(x=>x.id===selectedTrade);if(!t)return null;const me=data.user_id;const receiver=t.receiver_id===me;const proposer=t.proposer_id===me;const f=t.fulfillment||{};const myShipped=proposer?f.proposer_shipped_at:f.receiver_shipped_at;const myReceived=proposer?f.proposer_received_at:f.receiver_received_at;const otherShipped=proposer?f.receiver_shipped_at:f.proposer_shipped_at;const otherReceived=proposer?f.receiver_received_at:f.proposer_received_at;return <Modal title={'Byte med '+t.other_name} close={()=>setSelectedTrade(null)}><div className="trade-detail"><div className="trade-statusline"><span className={'status status-'+t.status}>{statusText(t.status)}</span>{t.parent_trade_id&&<small>Motbud</small>}</div>{t.note&&<div className="trade-note">“{t.note}”</div>}<div className="trade-sides"><div><small>Erbjuds</small>{t.items.filter(i=>i.side==='offered').map(i=><b key={i.id}>{i.title}</b>)}</div><ArrowLeftRight/><div><small>Önskas</small>{t.items.filter(i=>i.side==='requested').map(i=><b key={i.id}>{i.title}</b>)}</div></div>{t.status==='pending'&&receiver&&<div className="actionbar"><button className="primary" onClick={()=>tradeAction(t.id,'accept')}>Acceptera</button><button onClick={()=>{const t=data.trades.find(x=>x.id===selectedTrade);if(!t)return;const mine=t.items.filter(i=>i.owner_id===data.user_id).map(i=>i.id);const theirs=t.items.filter(i=>i.owner_id!==data.user_id).map(i=>i.id);setCounterOfferIds(mine);setCounterRequestIds(theirs);setCounterNote('');setCounterOpen(true)}}>Motbud</button><button className="secondary danger-text" onClick={()=>tradeAction(t.id,'decline')}>Avböj</button></div>}{t.status==='pending'&&proposer&&<button className="secondary danger-text" onClick={()=>tradeAction(t.id,'cancel')}>Dra tillbaka förslag</button>}{t.status==='accepted'&&<div className="fulfillment"><h3>Leverans</h3><div className="delivery-grid"><span className={myShipped?'done':''}>1. Du har skickat {myShipped?'✓':''}</span><span className={otherShipped?'done':''}>2. Den andra har skickat {otherShipped?'✓':''}</span><span className={myReceived?'done':''}>3. Du har mottagit {myReceived?'✓':''}</span><span className={otherReceived?'done':''}>4. Den andra har mottagit {otherReceived?'✓':''}</span></div>{!myShipped&&<div className="tracking-row"><input placeholder="Spårningsnummer (frivilligt)" value={tracking} onChange={e=>setTracking(e.target.value)}/><button className="primary" onClick={()=>tradeAction(t.id,'shipped',{tracking})}>Markera skickat</button></div>}{myShipped&&!myReceived&&<div className="receive-step">{otherShipped?<button className="primary" onClick={()=>tradeAction(t.id,'received')}>Jag har fått mitt kort</button>:<div className="muted">Du kan markera mottaget när {t.other_name} har markerat sina kort som skickade.</div>}</div>}</div>}<div className="chat"><h3>Chat</h3><div className="messages">{t.messages?.length?t.messages.map(m=><div className={'message '+(m.sender_id===me?'mine':'')} key={m.id}><b>{m.sender_name}</b><span>{m.body}</span><small>{new Date(m.created_at).toLocaleString('sv-SE')}</small></div>):<p className="hint">Ingen har skrivit något ännu.</p>}</div>{!['declined','cancelled','completed'].includes(t.status)&&<form onSubmit={e=>sendMessage(t.id,e)} className="chat-form"><input value={chatText} onChange={e=>setChatText(e.target.value)} placeholder="Skriv ett meddelande…"/><button className="primary">Skicka</button></form>}</div>{t.status==='completed'&&!t.reviewed_by_me&&<form onSubmit={e=>sendReview(t.id,e)} className="review-form"><h3>Hur gick bytet?</h3><label>Betyg<select value={reviewRating} onChange={e=>setReviewRating(Number(e.target.value))}>{[5,4,3,2,1].map(n=><option value={n} key={n}>{n} / 5</option>)}</select></label><label>Kommentar<textarea value={reviewComment} onChange={e=>setReviewComment(e.target.value)} placeholder="Frivillig kommentar"/></label><button className="primary">Lämna omdöme</button></form>}{t.status==='completed'&&t.reviewed_by_me&&<div className="successbox"><CheckCircle2/>Tack! Du har lämnat omdöme.</div>}</div></Modal>})()}
  {tradeTarget&&<Modal title={'Föreslå byte för '+tradeTarget.title} close={()=>setTradeTarget(null)}><form onSubmit={propose}><div className="trade-target-summary"><CardArt card={tradeTarget}/><div><small>Du vill ha</small><b>{tradeTarget.title}</b><span>{[tradeTarget.card_set,tradeTarget.card_year].filter(Boolean).join(' · ')}</span>{targetValue>0&&<strong>ca {targetValue.toLocaleString('sv-SE')} kr</strong>}</div></div><p className="modalcopy">Välj ett eller flera kort som du vill erbjuda.</p><div className="offer-list">{data.cards.filter(c=>c.is_active!==false&&!c.locked_trade_id).map(c=><label className="check offer-check" key={c.id}><input type="checkbox" checked={offerIds.includes(c.id)} onChange={e=>setOfferIds(e.target.checked?[...offerIds,c.id]:offerIds.filter(x=>x!==c.id))}/><span><b>{c.title}</b><small>{c.category}{c.estimated_value_sek?` · ca ${Number(c.estimated_value_sek).toLocaleString('sv-SE')} kr`:''}</small></span></label>)}</div>{offerIds.length>0&&<div className={'value-balance '+(balancePct===null?'unknown':balancePct>=80&&balancePct<=120?'balanced':balancePct<80?'low':'high')}><div><small>Ditt erbjudande</small><strong>{offeredValue?`${offeredValue.toLocaleString('sv-SE')} kr`:'Värde saknas'}</strong></div><ArrowLeftRight/><div><small>Kortet du vill ha</small><strong>{targetValue?`${targetValue.toLocaleString('sv-SE')} kr`:'Värde saknas'}</strong></div><p>{balancePct===null?'Värdebalansen kan inte beräknas förrän båda sidor har ungefärliga värden.':balancePct>=80&&balancePct<=120?'Värdena ligger ungefär i samma nivå.':balancePct<80?'Ditt erbjudande har lägre angivet värde. Det kan fortfarande vara ett bra byte om båda vill ha korten.':'Ditt erbjudande har högre angivet värde. Kontrollera att det känns rimligt för dig.'}</p></div>}<label>Meddelande<textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Frivillig kommentar"/></label><button className="primary" disabled={!offerIds.length}>Skicka bytesförslag</button><small className="hint">Värden är bara vägledning. Kortbyte avgör aldrig om ett byte är “rätt” eller “fel”.</small></form></Modal>}
 
{counterOpen&&selectedTrade&&(()=>{const t=data.trades.find(x=>x.id===selectedTrade);if(!t)return null;const myCards=(data.cards||[]).filter(c=>c.is_active!==false&&!c.locked_trade_id);const theirCurrent=t.items.filter(i=>i.owner_id!==data.user_id);const candidateTheirCards=(t.other_cards&&t.other_cards.length?t.other_cards:theirCurrent);return <div className="modal-backdrop"><div className="modal counter-modal">
 <div className="modal-head"><div><small>Motbud till {t.other_name}</small><h2>Bygg ett nytt bytesförslag</h2></div><button className="icon-close" onClick={()=>setCounterOpen(false)}>×</button></div>
 <p className="muted">Du kan ändra vilka av dina kort du erbjuder och vilka kort du vill ha tillbaka. Motbudet blir ett nytt bytesförslag.</p>

 <div className="counter-grid">
  <section>
   <h3>Dina kort att erbjuda <small>({counterOfferIds.length} valda)</small></h3>
   <div className="counter-list">
    {myCards.map(c=><label key={c.id} className={'counter-card '+(counterOfferIds.includes(c.id)?'selected':'')}>
     <input type="checkbox" checked={counterOfferIds.includes(c.id)} onChange={()=>setCounterOfferIds(v=>v.includes(c.id)?v.filter(x=>x!==c.id):[...v,c.id])}/>
     <span><b>{c.title}</b><small>{[c.card_set,c.card_year].filter(Boolean).join(' · ')||c.category}{c.estimated_value_sek?` · ca ${c.estimated_value_sek} kr`:''}</small></span>
    </label>)}
   </div>
  </section>

  <section>
   <h3>Kort du vill ha <small>({counterRequestIds.length} valda)</small></h3>
   <div className="counter-list">
    {candidateTheirCards.map(c=><label key={c.id} className={'counter-card '+(counterRequestIds.includes(c.id)?'selected':'')}>
     <input type="checkbox" checked={counterRequestIds.includes(c.id)} onChange={()=>setCounterRequestIds(v=>v.includes(c.id)?v.filter(x=>x!==c.id):[...v,c.id])}/>
     <span><b>{c.title}</b><small>{'card_set' in c?[c.card_set,c.card_year,c.category].filter(Boolean).join(' · '):''}{c.value?`${'card_set' in c&&[c.card_set,c.card_year,c.category].filter(Boolean).length?' · ':''}ca ${c.value} kr`:' · Värde saknas'}</small></span>
    </label>)}
   </div>
   <p className="counter-note-help">Här visas motpartens aktiva och olåsta byteskort. Du kan alltså bygga om motbudet från grunden på båda sidor.</p>
  </section>
 </div>

 <label className="field"><span>Meddelande till motparten (valfritt)</span><textarea value={counterNote} onChange={e=>setCounterNote(e.target.value)} maxLength={500} placeholder="Exempel: Skulle detta upplägg fungera bättre?"/></label>
 <div className="modal-actions"><button className="secondary" onClick={()=>setCounterOpen(false)}>Avbryt</button><button className="primary" onClick={()=>submitCounter(t)}>Skicka motbud</button></div>
</div></div>})()}

</main>
}

function CardArt({card}:{card:CardItem}){return <div className="card-art">{card.image_url?<img src={card.image_url} alt={card.title}/>:<div className="card-placeholder"><ImageIcon size={27}/><span>{card.category?.slice(0,1)||'K'}</span><small>Bild kommer</small></div>}</div>}

function statusText(status:string){return ({pending:'Väntar på svar',accepted:'Accepterat',declined:'Avböjt',cancelled:'Tillbakadraget',completed:'Klart',countered:'Motbud skickat'} as Record<string,string>)[status]||status}
function tradeSummary(t:TradeItem,me?:string){const offered=t.items?.filter(i=>i.side==='offered').map(i=>i.title).join(', ')||'kort';const requested=t.items?.filter(i=>i.side==='requested').map(i=>i.title).join(', ')||'kort';return t.proposer_id===me?`Du erbjuder ${offered} → ${requested}`:`Du får ${offered} → ger ${requested}`}

function Modal({title,close,children}:{title:string;close:()=>void;children:React.ReactNode}){return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><div className="modal"><div className="modalhead"><h2>{title}</h2><button className="icon" onClick={close}><X/></button></div>{children}</div></div>}
