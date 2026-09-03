import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';

type FieldKey='player'|'year'|'set'|'card_number'|'numbering'|'category';
type FieldAssessment={value:string|null;confidence:number;evidence:string|null};
type AnalysisResult={
  fields:Record<FieldKey,FieldAssessment>;
  traits:{value:string;confidence:number;evidence:string|null}[];
  overall_confidence:number;
  notes:string|null;
};

function extractJson(text:string){
  const cleaned=text.trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
  const start=cleaned.indexOf('{'); const end=cleaned.lastIndexOf('}');
  if(start<0||end<start) throw new Error('AI-svaret innehöll ingen JSON.');
  return JSON.parse(cleaned.slice(start,end+1));
}
function confidence(v:any){return Math.max(0,Math.min(100,Math.round(Number(v)||0)))}
function field(v:any,max=160):FieldAssessment{
  return {
    value:typeof v?.value==='string'&&v.value.trim()?v.value.trim().slice(0,max):null,
    confidence:confidence(v?.confidence),
    evidence:typeof v?.evidence==='string'&&v.evidence.trim()?v.evidence.trim().slice(0,180):null
  };
}

export async function POST(req:NextRequest){
  const user=await requireUser();
  if(!user) return NextResponse.json({error:'Inte inloggad'},{status:401});
  const body=await req.json().catch(()=>null);
  const imageUrl=String(body?.image_url||'');
  if(!imageUrl.startsWith('https://')) return NextResponse.json({error:'En uppladdad kortbild krävs.'},{status:400});

  const baseUrl=process.env.NEON_AI_GATEWAY_BASE_URL;
  const token=process.env.NEON_AI_GATEWAY_TOKEN;
  const model=process.env.NEON_AI_CARD_MODEL||'gpt-5-mini';
  if(!baseUrl||!token) return NextResponse.json({error:'AI-bildtolkning är inte konfigurerad på servern ännu.'},{status:503});

  const prompt=`Analysera bilden av ett samlarkort. Returnera ENDAST giltig JSON utan markdown.
Var konservativ. Ett osäkert fält ska vara null eller ha låg confidence. Gissa inte från sannolikhet eller allmän kunskap.
Format:
{
  "fields": {
    "player":{"value":string|null,"confidence":0-100,"evidence":string|null},
    "year":{"value":string|null,"confidence":0-100,"evidence":string|null},
    "set":{"value":string|null,"confidence":0-100,"evidence":string|null},
    "card_number":{"value":string|null,"confidence":0-100,"evidence":string|null},
    "numbering":{"value":string|null,"confidence":0-100,"evidence":string|null},
    "category":{"value":"Hockey"|"Fotboll"|"Pokémon"|"Basket"|"Baseball"|"Övrigt"|null,"confidence":0-100,"evidence":string|null}
  },
  "traits":[{"value":string,"confidence":0-100,"evidence":string|null}],
  "overall_confidence":0-100,
  "notes":string|null
}
Evidence ska kort beskriva vad i bilden som stöder just fältet, exempelvis "namnet syns tydligt längst ned". Skriv inte evidence om stöd saknas.
Traits får bara vara sådant som faktiskt syns eller står på kortet, exempelvis Auto, Rookie, Relic, Patch, Refractor, Holo eller Parallel.`;

  const upstream=await fetch(`${baseUrl.replace(/\/$/,'')}/v1/chat/completions`,{
    method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({model,temperature:0.1,messages:[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:imageUrl}}]}]})
  });
  const raw=await upstream.json().catch(()=>null);
  if(!upstream.ok) return NextResponse.json({error:raw?.error?.message||raw?.message||'AI-tjänsten kunde inte analysera bilden.'},{status:502});
  const content=raw?.choices?.[0]?.message?.content;
  if(typeof content!=='string') return NextResponse.json({error:'AI-tjänsten gav inget användbart svar.'},{status:502});

  try{
    const parsed=extractJson(content); const pf=parsed?.fields||{};
    const allowed=new Set(['Hockey','Fotboll','Pokémon','Basket','Baseball','Övrigt']);
    const category=field(pf.category,30); if(category.value&&!allowed.has(category.value)) category.value=null;
    const result:AnalysisResult={
      fields:{player:field(pf.player,120),year:field(pf.year,20),set:field(pf.set,160),card_number:field(pf.card_number,40),numbering:field(pf.numbering,40),category},
      traits:Array.isArray(parsed?.traits)?parsed.traits.slice(0,8).map((t:any)=>({value:String(t?.value||'').trim().slice(0,40),confidence:confidence(t?.confidence),evidence:typeof t?.evidence==='string'?t.evidence.trim().slice(0,180):null})).filter((t:any)=>t.value):[],
      overall_confidence:confidence(parsed?.overall_confidence),
      notes:typeof parsed?.notes==='string'?parsed.notes.slice(0,240):null
    };
    return NextResponse.json({analysis:result});
  }catch{return NextResponse.json({error:'AI-svaret gick inte att tolka. Försök gärna igen.'},{status:502});}
}
