import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const sourceRoots=['app','lib'];
const extensions=['.ts','.tsx','.js','.jsx','.mjs'];
let failures=[];
let checked=0;

function walk(dir){
  if(!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
}
function resolvesAlias(spec){
  const rel=spec.slice(2);
  const base=path.join(root,rel);
  return fs.existsSync(base) || extensions.some(ext=>fs.existsSync(base+ext)) || extensions.some(ext=>fs.existsSync(path.join(base,'index'+ext)));
}
for(const srcRoot of sourceRoots){
  for(const file of walk(path.join(root,srcRoot)).filter(f=>extensions.includes(path.extname(f)))){
    const text=fs.readFileSync(file,'utf8');
    const imports=[...text.matchAll(/(?:from\s+|import\s*\()(['"])(@\/[^'"]+)\1/g)].map(m=>m[2]);
    for(const spec of imports){checked++; if(!resolvesAlias(spec)) failures.push(`${path.relative(root,file)}: unresolved import ${spec}`);}
  }
}


const page=fs.readFileSync(path.join(root,'app/page.tsx'),'utf8');
const frontendRegressions=[
  ['stale Response.ok check after apiJson migration',/if\(!r\.ok\)/],
  ['stale Response.json call after apiJson migration',/await r\.json\(\)/],
  ['removed load helper still referenced',/await load\(\)/],
  ['match score exposed as false probability',/\{m\.match_score\?\?80\}% match/],
  ['dead profile action still rendered',/>Visa profil<\/button>/],
  ['removed setError state still referenced',/\bsetError\(/]
];
for(const [name,re] of frontendRegressions){if(re.test(page)) failures.push(`frontend regression present: ${name}`);}
if(!/const j=await apiJson\('\/api\/dashboard'[\s\S]*?setData\(j\)/.test(page)) failures.push('frontend invariant missing: dashboard refresh uses apiJson result');
if(!/async function api\([\s\S]*?await apiJson\(url/.test(page)) failures.push('frontend invariant missing: mutation helper uses apiJson safely');
if(!/const cardsIGet=receiver\?offered:requested;const cardsIGive=receiver\?requested:offered/.test(page)) failures.push('trade UX invariant missing: viewer-relative get/give mapping');
if(!/<small>Du får<\/small>[\s\S]*?<small>Du ger<\/small>/.test(page)) failures.push('trade UX invariant missing: explicit get/give labels');
if(!/>Acceptera bytet<\/button>[\s\S]*?>Gör motbud<\/button>[\s\S]*?>Avböj<\/button>/.test(page)) failures.push('trade UX invariant missing: clear receiver decision actions');

const tradeRoute=fs.readFileSync(path.join(root,'app/api/trades/[id]/route.ts'),'utf8');
const requiredTradeGuards=[
  ['trade row lock',/for update/i],
  ['card lock validation',/locked_trade_id/],
  ['competing trade cancellation',/cancelled_competing/],
  ['counter duplicate protection',/new Set/],
  ['completion deactivates cards',/set is_active=false,locked_trade_id=null/]
];
for(const [name,re] of requiredTradeGuards){if(!re.test(tradeRoute)) failures.push(`critical trade invariant missing: ${name}`);}

const scenario=fs.readFileSync(path.join(root,'app/api/dev/scenario/route.ts'),'utf8');
for(const marker of ['ALLOW_DEV_SEED','[TEST-DEMO]','delete from trade_proposals','delete from wanted_cards','delete from cards','delete from profiles']){
  if(!scenario.includes(marker)) failures.push(`demo scenario invariant missing: ${marker}`);
}

if(failures.length){
  console.error(`QA FAILED (${failures.length} issue${failures.length===1?'':'s'})`);
  for(const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`QA OK: ${checked} alias imports resolved; critical trade/demo invariants present.`);
