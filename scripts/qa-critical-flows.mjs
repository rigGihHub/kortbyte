import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const trade=read('app/api/trades/[id]/route.ts');
const scenario=read('app/api/dev/scenario/route.ts');
const tradesCreate=read('app/api/trades/route.ts');
const messages=read('app/api/trades/[id]/messages/route.ts');
const reviews=read('app/api/trades/[id]/reviews/route.ts');
const schema=read('neon/schema.sql');
const page=read('app/page.tsx');
const failures=[];
const checks=[];
function expect(name, condition){checks.push(name); if(!condition) failures.push(name);}
function has(text,re){return re.test(text);}

// Accept must serialize both the proposal and all included cards, then revalidate.
expect('accept locks all related proposal rows', has(trade,/proposal_locks[\s\S]*?join relevant_trade_ids[\s\S]*?for update of tp/i));
expect('accept uses deterministic proposal lock order', has(trade,/proposal_locks[\s\S]*?order by tp\.id[\s\S]*?for update of tp/i));
expect('accept rechecks target trade pending after proposal locks', has(trade,/locked_trade[\s\S]*?from proposal_locks[\s\S]*?pl\.status='pending'/i));
expect('accept locks included card rows', has(trade,/locked_cards[\s\S]*?for update of c/i));
expect('accept uses deterministic card lock order', has(trade,/locked_cards[\s\S]*?order by c\.id[\s\S]*?for update of c/i));
expect('accept rechecks card active state', has(trade,/lc\.is_active=true/));
expect('accept rechecks card ownership by side', has(trade,/lc\.side='offered'[\s\S]*?lc\.owner_id=lt\.proposer_id[\s\S]*?lc\.side='requested'[\s\S]*?lc\.owner_id=lt\.receiver_id/i));
expect('accept rejects cards locked by another trade', has(trade,/lc\.locked_trade_id is null or lc\.locked_trade_id=\$\{id\}::uuid/i));
expect('accept requires every item to validate', has(trade,/v\.item_count=v\.valid_count/));
expect('accept locks cards only after accepted_trade exists', has(trade,/card_locks[\s\S]*?join accepted_trade/i));
expect('accept cancels competing pending trades sharing a locked card', has(trade,/cancelled_competing[\s\S]*?tp\.status='pending'[\s\S]*?other_item\.card_id in/i));
expect('accept verifies expected lock count before success', has(trade,/locked_count[\s\S]*?expected_count[\s\S]*?status:409/i));

// Counteroffer input and transaction invariants.
expect('counter deduplicates offered ids', (trade.match(/new Set\(/g)||[]).length>=2);
expect('counter rejects same card on both sides', has(trade,/Same|Samma kort kan inte finnas på båda sidor/i));
expect('counter requires at least one card per side', has(trade,/offeredCardIds\.length[\s\S]*?requestedCardIds\.length/));
expect('counter locks original pending proposal', has(trade,/action==='counter'[\s\S]*?tp\.status='pending'[\s\S]*?for update/i));
expect('counter locks selected cards', has(trade,/selections[\s\S]*?locked_cards[\s\S]*?for update of c/i));
expect('counter rejects any locked selected card', has(trade,/lc\.locked_trade_id is null/));
expect('counter verifies side ownership', has(trade,/lc\.side='offered'[\s\S]*?lc\.owner_id=\$\{user\.id\}[\s\S]*?lc\.side='requested'[\s\S]*?lc\.owner_id=lt\.proposer_id/i));
expect('counter creates new proposal before marking original countered', has(trade,/new_trade[\s\S]*?original_updated[\s\S]*?set status='countered'/i));


// Terminal proposal-state transitions must be compare-and-set operations.
expect('decline transition is conditional on receiver and pending status', has(trade,/action==='decline'[\s\S]*?update trade_proposals[\s\S]*?receiver_id=\$\{user\.id\}[\s\S]*?status='pending'[\s\S]*?returning id/i));
expect('decline rejects stale concurrent transition', has(trade,/declined\.length!==1[\s\S]*?status:409/i));
expect('cancel transition is conditional on proposer and pending status', has(trade,/action==='cancel'[\s\S]*?update trade_proposals[\s\S]*?proposer_id=\$\{user\.id\}[\s\S]*?status='pending'[\s\S]*?returning id/i));
expect('cancel rejects stale concurrent transition', has(trade,/cancelled\.length!==1[\s\S]*?status:409/i));

// Messaging must honor the trade state machine even for direct API calls.
expect('message creation locks trade row', has(messages,/locked_trade as materialized[\s\S]*?for update of tp/i));
expect('messages only allowed for pending accepted or completed trades', has(messages,/tp\.status in \('pending','accepted','completed'\)/i));
expect('message sender must be a trade participant', has(messages,/tp\.proposer_id=\$\{user\.id\}[\s\S]*?tp\.receiver_id=\$\{user\.id\}/i));
expect('message insert derives trade from locked eligible state', has(messages,/insert into trade_messages[\s\S]*?select lt\.id,\$\{user\.id\},\$\{text\}[\s\S]*?from locked_trade lt/i));
expect('message rejects ineligible trade state', has(messages,/if\(!message\)[\s\S]*?status:409/i));
expect('message body is trimmed and capped at 1000', has(messages,/trim\(\)\.slice\(0,1000\)/));

// Reviews must only target the counterparty in a completed trade.
expect('review requires completed trade inside insert', has(reviews,/from trade_proposals tp[\s\S]*?tp\.status='completed'/i));
expect('review subject is derived from trade participants', has(reviews,/case when tp\.proposer_id=\$\{user\.id\} then tp\.receiver_id else tp\.proposer_id end/i));
expect('review author must be a trade participant', has(reviews,/tp\.proposer_id=\$\{user\.id\}[\s\S]*?tp\.receiver_id=\$\{user\.id\}/i));
expect('review rating is restricted to integer 1 through 5', has(reviews,/Number\.isInteger\(rating\)[\s\S]*?rating<1[\s\S]*?rating>5/));
expect('review comment is trimmed and capped at 500', has(reviews,/body\.comment[\s\S]*?trim\(\)\.slice\(0,500\)/));
expect('review upsert remains one review per author per trade', has(reviews,/on conflict \(trade_id,author_id\)[\s\S]*?do update/i));
expect('review rejects non-completed or unrelated trade', has(reviews,/saved\.length!==1[\s\S]*?status:409/i));

// Fulfillment/completion invariants.
expect('shipping requires accepted trade', has(trade,/action==='shipped'[\s\S]*?trade\.status!=='accepted'/));
expect('shipping locks trade row before state transition', has(trade,/action==='shipped'[\s\S]*?locked_trade as materialized[\s\S]*?for update of tp/i));
expect('shipping locks fulfillment row before state transition', has(trade,/action==='shipped'[\s\S]*?locked_fulfillment as materialized[\s\S]*?for update of f/i));
expect('shipping rechecks accepted status inside atomic statement', has(trade,/marked_shipped[\s\S]*?lt\.status='accepted'/i));
expect('shipping timestamp write is idempotent', (trade.match(/coalesce\(f\.(?:proposer|receiver)_shipped_at,now\(\)\)/g)||[]).length>=2);
expect('shipping empty tracking retry preserves stored tracking', has(trade,/tracking_proposer=case[\s\S]*?\$\{tracking\}<>''[\s\S]*?else f\.tracking_proposer[\s\S]*?tracking_receiver=case[\s\S]*?else f\.tracking_receiver/i));
expect('shipping tracking length is bounded', has(trade,/body\?\.tracking[\s\S]*?trim\(\)\.slice\(0,200\)/));
expect('shipping rejects failed atomic transition', has(trade,/shipped_count[\s\S]*?status:409/i));
expect('received requires accepted trade', has(trade,/action==='received'[\s\S]*?trade\.status!=='accepted'/));
expect('received locks trade row before state transition', has(trade,/action==='received'[\s\S]*?locked_trade as materialized[\s\S]*?for update of tp/i));
expect('received locks fulfillment row before state transition', has(trade,/locked_fulfillment as materialized[\s\S]*?for update of f/i));
expect('received rechecks accepted status inside atomic statement', has(trade,/marked_received[\s\S]*?lt\.status='accepted'/i));
expect('received requires both parties shipped before receipt', has(trade,/marked_received[\s\S]*?lf\.proposer_shipped_at is not null[\s\S]*?lf\.receiver_shipped_at is not null/i));
expect('completion selects all trade cards before completion', has(trade,/selected_trade_cards as materialized[\s\S]*?trade_items ti[\s\S]*?join locked_trade/i));
expect('completion locks all trade cards deterministically', has(trade,/locked_trade_cards as materialized[\s\S]*?order by c\.id[\s\S]*?for update of c/i));
expect('completion validates cards still active', has(trade,/card_validation[\s\S]*?lc\.is_active=true/i));
expect('completion validates cards still locked to this trade', has(trade,/card_validation[\s\S]*?lc\.locked_trade_id=\$\{id\}::uuid/i));
expect('completion requires every expected card to remain valid', has(trade,/cv\.expected_count>0[\s\S]*?cv\.expected_count=cv\.valid_count/i));
expect('receipt validates all trade cards before marking received', trade.indexOf('card_validation as (', trade.indexOf("action==='received'")) < trade.indexOf('marked_received as (', trade.indexOf("action==='received'")));
expect('receipt transition is gated by valid card count', has(trade,/marked_received[\s\S]*?from locked_trade lt,locked_fulfillment lf,card_validation cv[\s\S]*?cv\.expected_count>0[\s\S]*?cv\.expected_count=cv\.valid_count/i));
expect('received timestamp write is idempotent', (trade.match(/coalesce\(f\.(?:proposer|receiver)_received_at,now\(\)\)/g)||[]).length>=2);
expect('completion requires both received timestamps atomically', has(trade,/completed_trade[\s\S]*?mr\.proposer_received_at is not null[\s\S]*?mr\.receiver_received_at is not null/i));
expect('completion only transitions an accepted trade', has(trade,/completed_trade[\s\S]*?tp\.status='accepted'/i));
expect('completion deactivates cards in same SQL statement', has(trade,/completed_cards[\s\S]*?set is_active=false,locked_trade_id=null/i));
expect('completion card update depends on completed_trade', has(trade,/completed_cards[\s\S]*?from completed_trade ct[\s\S]*?trade_items ti/i));
expect('received rejects failed atomic transition', has(trade,/received_count[\s\S]*?status:409/i));

// Trade creation must only use available cards owned by the right side.
expect('new trade target must be active and unlocked', has(tradesCreate,/is_active=true and locked_trade_id is null/));
expect('new trade offered cards must belong to proposer', has(tradesCreate,/owner_id=\$\{user\.id\}[\s\S]*?is_active=true and locked_trade_id is null/i));

// Fulfillment UX must expose the real next action instead of a misleading fixed sequence.
expect('trade UI derives next step from fulfillment state', has(page,/function tradeNextStep\([\s\S]*?if\(t\.status==='accepted'\)/));
expect('accepted trade prompts user to ship when needed', has(page,/Din tur: skicka dina kort/));
expect('accepted trade distinguishes waiting for counterpart shipment', has(page,/Väntar på att .* skickar/));
expect('accepted trade prompts receipt only after both shipped', has(page,/Din tur: bekräfta mottaget/));
expect('trade list surfaces next action', has(page,/trade-next-[\s\S]*?tradeNextStep\(t,data\.user_id\)\.title/));
expect('delivery UI shows parties separately rather than fake step order', has(page,/delivery-parties[\s\S]*?delivery-party[\s\S]*?>Du<[\s\S]*?t\.other_name/));
expect('counterparty tracking is shown when available', has(page,/otherTracking&&[\s\S]*?Spårning:/));

// DB-level constraints that make API mistakes fail safely.
expect('trade item unique per trade/card', has(schema,/unique\(trade_id,card_id\)/i));
expect('trade item side constrained', has(schema,/side text not null check \(side in \('offered','requested'\)\)/i));
expect('fulfillment one row per trade', has(schema,/trade_id uuid primary key references trade_proposals/i));
expect('review one per author per trade', has(schema,/unique\(trade_id,author_id\)/i));

// Demo endpoints must not expose writes to anonymous users or production by default.
expect('demo endpoint production gate exists', has(scenario,/NODE_ENV!==['"]production['"] \|\| process\.env\.ALLOW_DEV_SEED===['"]true['"]/));
expect('demo POST returns 401 when unauthenticated', has(scenario,/export async function POST[\s\S]*?const user=await requireUser\(\);[\s\S]*?if\(!user\)[\s\S]*?status:401/));
expect('demo DELETE returns 401 when unauthenticated', has(scenario,/export async function DELETE[\s\S]*?const user=await requireUser\(\);[\s\S]*?if\(!user\)[\s\S]*?status:401/));
expect('demo cleanup removes proposals before profiles', scenario.indexOf('delete from trade_proposals') < scenario.indexOf('delete from profiles'));
expect('demo cleanup clears user test-card locks before deleting cards', scenario.indexOf('set locked_trade_id=null') < scenario.indexOf('delete from cards'));

// Match quality must preserve Kortbyte's mutual-first product promise.
const dashboardRoute=read('app/api/dashboard/route.ts');
expect('mutual ranking uses the weaker direction as mutual strength', has(dashboardRoute,/mutualStrength=isMutual\?Math\.min\(best\.score,mutualScore\):0/));
expect('mutual matches sort by two-way strength before combined score', has(dashboardRoute,/filter\(m=>m\.is_mutual\)[\s\S]*?sort\(\(a,b\)=>b\.mutual_strength-a\.mutual_strength \|\| b\.match_score-a\.match_score\)/));
expect('one-way matches are capped when mutual matches exist', has(dashboardRoute,/const oneWayLimit=mutualMatches\.length\?6:12/));
expect('match UI separates mutual and one-way groups', has(page,/Ömsesidiga matcher[\s\S]*?Andra möjliga träffar/));
expect('balanced bundle is explicitly secondary in UI', has(page,/Alternativ: närmast i värde/));

if(failures.length){
  console.error(`CRITICAL FLOW QA FAILED (${failures.length}/${checks.length})`);
  for(const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`Critical-flow QA OK: ${checks.length} trade, schema and demo-safety invariants checked.`);
