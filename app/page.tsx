'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Bell, CheckCircle2, Crown, Heart, Loader2, LogIn, LogOut, Plus, Search, ShieldCheck, Sparkles, Trash2, UserRound, X } from 'lucide-react';
import { authClient } from '@/lib/auth-client';

type CardItem={id:string;owner_id?:string;title:string;card_set:string|null;card_year:string|null;category:string;estimated_value_sek:number|null;image_url?:string|null;is_active?:boolean;locked_trade_id?:string|null;owner_name?:string;match_score?:number;is_mutual?:boolean;wanted_query?:string};
type WantedItem={id:string;query:string;category:string|null};
type TradeItem={id:string;status:string;other_name:string;created_at:string;note?:string|null};
type Dashboard={profile?:{display_name:string;plan:'free'|'plus'};cards:CardItem[];wanted:WantedItem[];matches:CardItem[];trades:TradeItem[]};

const demo:Dashboard={
 profile:{display_name:'Demo',plan:'free'},
 cards:[
  {id:'d1',title:'Connor Bedard Rookie',card_set:'Upper Deck',card_year:'2023-24',category:'Hockey',estimated_value_sek:450,is_active:true},
  {id:'d2',title:'Pikachu Illustration Rare',card_set:'151',card_year:'2023',category:'Pokémon',estimated_value_sek:240,is_active:true},
  {id:'d3',title:'Dejan Kulusevski Parallel',card_set:'Prizm',card_year:'2024-25',category:'Fotboll',estimated_value_sek:180,is_active:true}
 ],
 wanted:[{id:'w1',query:'Mats Sundin Auto',category:'Hockey'},{id:'w2',query:'Tottenham Auto /99',category:'Fotboll'}],
 matches:[
  {id:'m1',owner_id:'anna',owner_name:'AnnaS',title:'Mats Sundin Auto',card_set:'SP Authentic',card_year:'2023-24',category:'Hockey',estimated_value_sek:425,match_score:99,is_mutual:true,wanted_query:'Mats Sundin Auto'},
  {id:'m2',owner_id:'cc87',owner_name:'CardCollector87',title:'Tottenham Auto /99',card_set:'Select',card_year:'2024-25',category:'Fotboll',estimated_value_sek:360,match_score:88,is_mutual:false,wanted_query:'Tottenham Auto /99'}
 ],trades:[]
};
const categories=['Hockey','Fotboll','Pokémon','One Piece','Magic','Lorcana','Star Wars','Övrigt'];

export default function Home(){
 const {data:session,isPending}=authClient.useSession();
 const live=Boolean(session?.user);
 const [data,setData]=useState<Dashboard>(demo);
 const [tab,setTab]=useState<'match'|'cards'|'wanted'|'trades'>('match');
 const [busy,setBusy]=useState(false); const [notice,setNotice]=useState('');
 const [authOpen,setAuthOpen]=useState(false); const [authMode,setAuthMode]=useState<'signin'|'signup'>('signin');
 const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [name,setName]=useState('');
 const [cardOpen,setCardOpen]=useState(false); const [wantedOpen,setWantedOpen]=useState(false); const [tradeTarget,setTradeTarget]=useState<CardItem|null>(null);
 const [cardForm,setCardForm]=useState({title:'',category:'Hockey',card_set:'',card_year:'',estimated_value_sek:''});
 const [wantedForm,setWantedForm]=useState({query:'',category:'Hockey'}); const [offerIds,setOfferIds]=useState<string[]>([]); const [note,setNote]=useState('');

 async function refresh(){ if(!live)return; setBusy(true); try{const r=await fetch('/api/dashboard',{cache:'no-store'}); if(!r.ok)throw new Error((await r.json()).error||'Kunde inte läsa data'); setData(await r.json());}catch(e){setNotice(e instanceof Error?e.message:'Fel');}finally{setBusy(false);} }
 useEffect(()=>{if(live)void refresh(); else setData(demo);},[live]);
 const plan=data.profile?.plan??'free'; const active=data.cards.filter(c=>c.is_active!==false).length; const freeSlots=Math.max(0,5-active);
 const mutualCount=useMemo(()=>data.matches.filter(m=>m.is_mutual).length,[data.matches]);

 async function doAuth(e:FormEvent){e.preventDefault();setBusy(true);setNotice('');try{
   if(authMode==='signin'){const r=await authClient.signIn.email({email,password}); if(r.error)throw new Error(r.error.message||'Inloggningen misslyckades');}
   else{const r=await authClient.signUp.email({email,password,name:name||email.split('@')[0]}); if(r.error)throw new Error(r.error.message||'Kontot kunde inte skapas');}
   setAuthOpen(false);
 }catch(e){setNotice(e instanceof Error?e.message:'Fel');}finally{setBusy(false);}}
 async function api(url:string,method:string,body?:unknown){setBusy(true);setNotice('');try{const r=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const j=await r.json();if(!r.ok)throw new Error(j.error||'Något gick fel');await refresh();return true;}catch(e){setNotice(e instanceof Error?e.message:'Fel');return false;}finally{setBusy(false);}}
 async function addCard(e:FormEvent){e.preventDefault(); if(!live){setNotice('Logga in för att spara riktiga kort.');return;} if(await api('/api/cards','POST',cardForm)){setCardOpen(false);setCardForm({title:'',category:'Hockey',card_set:'',card_year:'',estimated_value_sek:''});}}
 async function addWanted(e:FormEvent){e.preventDefault(); if(!live){setNotice('Logga in för att spara riktiga sökningar.');return;} if(await api('/api/wanted','POST',wantedForm)){setWantedOpen(false);setWantedForm({query:'',category:'Hockey'});}}
 async function propose(e:FormEvent){e.preventDefault();if(!tradeTarget)return;if(!live){setNotice('Logga in för att skicka ett riktigt bytesförslag.');return;}if(await api('/api/trades','POST',{requested_card_id:tradeTarget.id,offered_card_ids:offerIds,note})){setTradeTarget(null);setOfferIds([]);setNote('');setTab('trades');}}

 return <main className="shell">
  <header><div className="brand"><div className="logo"><ArrowLeftRight size={22}/></div><div><b>Kortbyte</b><small>Byt kort. Inte pengar.</small></div></div><div className="top-actions"><span className={'mode '+(live?'live':'demo')}>{live?'LIVE':'DEMO'}</span><button className="icon"><Bell size={18}/></button>{live?<><button className="ghost"><UserRound size={16}/>{session?.user?.name||'Min profil'}</button><button className="ghost" onClick={()=>authClient.signOut()}><LogOut size={16}/>Logga ut</button></>:<button className="primary small" onClick={()=>setAuthOpen(true)}><LogIn size={16}/>Logga in</button>}</div></header>
  <section className="hero"><div><span className="eyebrow"><Sparkles size={15}/>Smarta bytesmatchningar</span><h1>Byt kort med någon som faktiskt vill ha dina.</h1><p>Kortbyte matchar dina byteskort mot andra samlares söklistor och lyfter ömsesidiga matcher först.</p><div className="hero-actions"><button className="primary" onClick={()=>setCardOpen(true)}><Plus/>Lägg upp kort</button><button className="secondary" onClick={()=>setWantedOpen(true)}><Search/>Lägg till sökning</button></div></div><aside className="plan"><div><span>{plan.toUpperCase()}</span><Crown size={19}/></div><strong>{active} / {plan==='free'?'5':'∞'} aktiva byteskort</strong><small>{plan==='free'?`${freeSlots} gratisplatser kvar`:'Obegränsat med byteskort'}</small><hr/><b>Kortbyte Plus</b><small>29 kr/mån · 249 kr/år · kommer snart</small></aside></section>
  {!live&&<div className="demo-note"><ShieldCheck/><div><b>Demo-läge</b><span>Neon-versionen är redo. Logga in när miljövariablerna är kopplade för riktiga konton och databas.</span></div></div>}
  {notice&&<div className="notice">{notice}<button onClick={()=>setNotice('')}><X size={16}/></button></div>}
  <nav className="tabs"><button className={tab==='match'?'active':''} onClick={()=>setTab('match')}>Matchningar <em>{data.matches.length}</em></button><button className={tab==='cards'?'active':''} onClick={()=>setTab('cards')}>Mina kort <em>{data.cards.length}</em></button><button className={tab==='wanted'?'active':''} onClick={()=>setTab('wanted')}>Jag söker <em>{data.wanted.length}</em></button><button className={tab==='trades'?'active':''} onClick={()=>setTab('trades')}>Mina byten <em>{data.trades.length}</em></button></nav>
  {busy&&<div className="loading"><Loader2 className="spin"/>Uppdaterar…</div>}
  {tab==='match'&&<section><div className="section-title"><div><h2>Matchningar för dig</h2><p>{mutualCount?`${mutualCount} ömsesidig match hittad först.`:'Vi visar de kort som bäst matchar dina sökningar.'}</p></div><span className="badge"><Heart size={15}/>Ömsesidigt först</span></div><div className="grid">{data.matches.map(m=><article className={'match '+(m.is_mutual?'mutual':'')} key={m.id}><div className="card-art">{m.image_url?<img src={m.image_url} alt=""/>:<span>{m.category.slice(0,1)}</span>}</div><div className="match-body"><div className="match-top"><span className="score">{m.match_score??80}% match</span>{m.is_mutual&&<span className="mutual-pill"><CheckCircle2 size={14}/>Ömsesidig</span>}</div><small>{m.owner_name||'Samlare'}</small><h3>{m.title}</h3><p>{[m.card_set,m.card_year].filter(Boolean).join(' · ')}</p>{m.estimated_value_sek&&<b>ca {Number(m.estimated_value_sek).toLocaleString('sv-SE')} kr</b>}<div className="card-actions"><button className="secondary">Visa profil</button><button className="primary" onClick={()=>{setTradeTarget(m);setOfferIds([])}}>Föreslå byte</button></div></div></article>)}</div></section>}
  {tab==='cards'&&<section><div className="section-title"><div><h2>Mina byteskort</h2><p>Korten som andra samlare kan matchas mot.</p></div><button className="primary" onClick={()=>setCardOpen(true)}><Plus/>Lägg upp kort</button></div><div className="list">{data.cards.map(c=><div className="row" key={c.id}><div><b>{c.title}</b><span>{c.category} · {[c.card_set,c.card_year].filter(Boolean).join(' · ')}</span></div><div>{c.estimated_value_sek&&<strong>{Number(c.estimated_value_sek).toLocaleString('sv-SE')} kr</strong>}{live&&<button className="icon danger" onClick={()=>api('/api/cards?id='+c.id,'DELETE')}><Trash2 size={17}/></button>}</div></div>)}</div></section>}
  {tab==='wanted'&&<section><div className="section-title"><div><h2>Jag söker</h2><p>Ju tydligare sökning, desto bättre matchningar.</p></div><button className="primary" onClick={()=>setWantedOpen(true)}><Plus/>Ny sökning</button></div><div className="list">{data.wanted.map(w=><div className="row" key={w.id}><div><b>{w.query}</b><span>{w.category||'Alla kategorier'}</span></div>{live&&<button className="icon danger" onClick={()=>api('/api/wanted?id='+w.id,'DELETE')}><Trash2 size={17}/></button>}</div>)}</div></section>}
  {tab==='trades'&&<section><div className="section-title"><div><h2>Mina byten</h2><p>Bytesförslag och pågående byten.</p></div></div>{data.trades.length?<div className="list">{data.trades.map(t=><div className="row" key={t.id}><div><b>{t.other_name}</b><span>{new Date(t.created_at).toLocaleDateString('sv-SE')}</span></div><span className="status">{t.status}</span></div>)}</div>:<div className="empty"><ArrowLeftRight/><h3>Inga byten ännu</h3><p>När du hittar en match kan du föreslå ett byte direkt.</p></div>}</section>}
  <section className="steps"><h2>Så fungerar Kortbyte</h2><div><span><b>1</b>Lägg upp det du byter bort</span><span><b>2</b>Berätta vad du söker</span><span><b>3</b>Få ömsesidiga matcher</span><span><b>4</b>Kom överens och byt</span></div></section>
  {authOpen&&<Modal title={authMode==='signin'?'Logga in':'Skapa konto'} close={()=>setAuthOpen(false)}><form onSubmit={doAuth}>{authMode==='signup'&&<label>Namn<input value={name} onChange={e=>setName(e.target.value)} required/></label>}<label>E-post<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>Lösenord<input type="password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} required/></label><button className="primary" disabled={busy}>{authMode==='signin'?'Logga in':'Skapa konto'}</button><button type="button" className="textbtn" onClick={()=>setAuthMode(authMode==='signin'?'signup':'signin')}>{authMode==='signin'?'Ny här? Skapa konto':'Har du konto? Logga in'}</button></form></Modal>}
  {cardOpen&&<Modal title="Lägg upp byteskort" close={()=>setCardOpen(false)}><form onSubmit={addCard}><label>Kort / spelare<input value={cardForm.title} onChange={e=>setCardForm({...cardForm,title:e.target.value})} placeholder="t.ex. Connor Bedard Young Guns" required/></label><label>Kategori<select value={cardForm.category} onChange={e=>setCardForm({...cardForm,category:e.target.value})}>{categories.map(c=><option key={c}>{c}</option>)}</select></label><div className="two"><label>Set<input value={cardForm.card_set} onChange={e=>setCardForm({...cardForm,card_set:e.target.value})}/></label><label>År<input value={cardForm.card_year} onChange={e=>setCardForm({...cardForm,card_year:e.target.value})}/></label></div><label>Ungefärligt värde (kr)<input type="number" min="0" value={cardForm.estimated_value_sek} onChange={e=>setCardForm({...cardForm,estimated_value_sek:e.target.value})}/></label><button className="primary">Spara byteskort</button><small className="hint">Bildstöd kopplas separat efter Neon-migreringen.</small></form></Modal>}
  {wantedOpen&&<Modal title="Vad söker du?" close={()=>setWantedOpen(false)}><form onSubmit={addWanted}><label>Sökning<input value={wantedForm.query} onChange={e=>setWantedForm({...wantedForm,query:e.target.value})} placeholder="t.ex. Mats Sundin Auto" required/></label><label>Kategori<select value={wantedForm.category} onChange={e=>setWantedForm({...wantedForm,category:e.target.value})}>{categories.map(c=><option key={c}>{c}</option>)}</select></label><button className="primary">Spara sökning</button></form></Modal>}
  {tradeTarget&&<Modal title={'Föreslå byte för '+tradeTarget.title} close={()=>setTradeTarget(null)}><form onSubmit={propose}><p className="modalcopy">Välj vad du erbjuder.</p><div className="offer-list">{data.cards.filter(c=>c.is_active!==false&&!c.locked_trade_id).map(c=><label className="check" key={c.id}><input type="checkbox" checked={offerIds.includes(c.id)} onChange={e=>setOfferIds(e.target.checked?[...offerIds,c.id]:offerIds.filter(x=>x!==c.id))}/><span><b>{c.title}</b><small>{c.category}</small></span></label>)}</div><label>Meddelande<textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Frivillig kommentar"/></label><button className="primary" disabled={!offerIds.length}>Skicka bytesförslag</button></form></Modal>}
 </main>
}

function Modal({title,close,children}:{title:string;close:()=>void;children:React.ReactNode}){return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><div className="modal"><div className="modalhead"><h2>{title}</h2><button className="icon" onClick={close}><X/></button></div>{children}</div></div>}
