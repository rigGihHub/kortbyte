# Kortbyte v1.1.0.0 — Neon migration

Kortbyte är en mobilvänlig bytesplattform för samlarkort. v1.1.0 flyttar backend-grunden från Supabase till **Neon Postgres + Neon Auth**.

## Vad som är nytt
- Neon Auth i stället för Supabase Auth.
- Neon Postgres via server-side API-routes; `DATABASE_URL` skickas aldrig till webbläsaren.
- Ny Neon-anpassad datamodell med textbaserade Auth-user IDs.
- Riktiga kort och sökningar för inloggade användare.
- Free-gränser i servern: 5 aktiva byteskort och 10 sökningar.
- Ömsesidig matchning prioriteras i `/api/dashboard`.
- Bytesförslag skapas server-side och validerar ägarskap/tillgänglighet.
- Demo-läge finns kvar när Neon-konfiguration saknas.
- Next.js uppgraderat från osupportade 14.x till 15.5.21 Maintenance LTS.

## Neon som redan är klart
Projekt: **Kortbyte** i AWS Europe Central 1 (Frankfurt). Neon Auth är aktiverat.

## För att koppla lokalt
1. Kör `neon/schema.sql` i Neon SQL Editor.
2. Kopiera `.env.example` till `.env.local`.
3. Fyll i:
   - `DATABASE_URL` från Neon Console → Connect.
   - `NEON_AUTH_BASE_URL` från Auth → Quickstart/Configuration.
   - `NEON_AUTH_COOKIE_SECRET` med en egen slumpmässig hemlighet på minst 32 tecken.
4. Kör:
   ```powershell
   npm install
   npm run dev
   ```
5. Öppna den localhost-adress terminalen visar.

## Viktigt
- Lägg aldrig `.env.local` i Git.
- Kortbilder är inte migrerade i v1.1.0. Neon är databas/Auth, inte objektlagring. Bildlagring kopplas i en separat release.
- Chat, leveransbekräftelser, omdömen och notiser finns i datamodellen men v1.1.0 fokuserar på att få den nya backendkedjan stabil först.


## v1.1.0
- Rättar Neon Auth till aktuell `@neondatabase/auth` 0.5.0-beta.
- Synkar React och React DOM till 19.2.8.
- Vid uppgradering från äldre lokal version: radera `node_modules` och `package-lock.json` före `npm install` för att undvika gamla peer dependencies.


## v1.1 bytesflöde
- Acceptera, avböj och dra tillbaka bytesförslag.
- Motbud skapas som kopplat nytt förslag så historiken finns kvar.
- Kort låses när byte accepteras.
- Inbyggd chat per byte.
- Båda markerar skickat och mottaget.
- Byte slutförs automatiskt när båda mottagit; korten blir då inaktiva.
- Omdöme 1–5 efter slutfört byte.

## v1.2.0 – Kortpärm och bytesbalans
- Visuell kortpärm under Mina kort med bildyta, metadata, värde och låsstatus.
- Kort med `image_url` visar bilden automatiskt; annars visas en tydlig platshållare inför kommande bilduppladdning.
- Matchningar visar tydligare varför kortet matchar användarens sökning.
- Bytesförslag visar sammanlagt angivet värde på erbjudna kort mot kortet användaren vill ha.
- Värdeindikatorn är uttryckligen vägledande och dömer inte om ett byte är rätt/fel.
- Ingen databasändring krävs jämfört med v1.1.

## v1.3.0 – Smartare matchning
- Matchningen normaliserar olika skrivsätt, skiljetecken och vanliga korttermer.
- Exempel: `Mats Sundin auto` kan matcha `Mats Sundin Autograph`.
- Numrering som `23/99` kan matchas mot en sökning som innehåller `/99`.
- Träffar rankas efter hur stor del av de viktiga sökorden som faktiskt hittas.
- Svaga kategori-träffar visas inte längre som om de vore bra kortmatchningar.
- Ömsesidiga matcher får högsta prioritet och visar även varför matchen är ömsesidig.
- Matchkortet visar träfforsak och identifierade sökord.
- Ingen databasändring krävs jämfört med v1.2.
- Matchprocenten är en relevanspoäng, inte en garanti för att två kort är exakt samma variant.

## v1.4.0 – Smarta bytespaket
- Matchningar kan föreslå paket med 2–3 av dina aktiva kort mot ett kort du vill ha.
- Bara kort med angivet uppskattat värde används.
- Låsta och inaktiva kort ignoreras.
- Paket inom ungefär ±40% av målkortets uppskattade värde kan föreslås.
- Kombinationen som ligger närmast i uppskattat värde prioriteras.
- `Använd detta paket` fyller bytesförslaget med de föreslagna korten.
- Värden visas som vägledning, inte som ett facit.
- Ingen databasändring krävs jämfört med v1.3.

## v1.5.0 – Bättre bytesbeslut
- En match kan nu visa upp till tre olika bytesstrategier.
- `Mest jämnt` prioriterar paketet som ligger närmast i uppskattat värde.
- `Färst kort` prioriterar den enklaste affären med så få kort som möjligt.
- `Behåll toppkortet` försöker hitta ett rimligt paket utan ditt högst värderade aktiva kort.
- Dubbletter filtreras bort så användaren inte ser samma paket flera gånger under olika namn.
- Varje strategi förklaras med vanlig svenska.
- Ett klick fyller bytesförslaget med det valda paketet.
- Ingen databasändring krävs jämfört med v1.4.

## v1.6.0 – Smart bevakning och notifieringar
- Klockan i toppfältet används nu som notifieringscenter.
- Relevanta matcher kan visas som notifieringar.
- Ömsesidiga matcher markeras som högprioriterade.
- Inkommande bytesförslag och accepterade byten kan visas i samma center.
- Badge på klockan visar antalet högprioriterade notifieringar.
- Klick på en matchnotis tar användaren till Matchningar.
- Klick på en bytesnotis tar användaren till Mina byten och försöker öppna rätt byte.
- Ingen ny SQL eller Neon-konfiguration krävs i denna version.
- Notiserna härleds från nuvarande appdata. Persistenta läst/oläst-notiser, e-post och push är nästa tekniska nivå.

## v1.7.0 – Förtroendeprofil
- Matchkort visar antal genomförda byten för den andra samlaren.
- Genomsnittligt omdöme och antal omdömen visas när historik finns.
- `Medlem sedan` ger extra sammanhang.
- En mjuk erfarenhetstext används: Ny på Kortbyte, Har genomförda byten, Erfaren bytare eller Mycket erfaren bytare.
- Nivån är vägledning baserad på faktisk Kortbyte-historik, inte en garanti eller officiell verifiering.
- Informationen hämtas ur befintliga profiler, genomförda byten och omdömen. Ingen ny SQL-migration krävs.
- Stabilisering: `Använd detta paket` använder nu rätt state-funktioner och öppnar bytesförslaget med det valda paketet.

## v1.8.0 – Riktiga motbud
- Motbud är nu ett faktiskt nytt bytesförslag i stället för samma kort med ny kommentar.
- Mottagaren kan välja vilka av sina egna aktiva kort som ska erbjudas.
- Mottagaren kan välja vilka kort från det mottagna förslaget som ska efterfrågas tillbaka.
- Motbudet skapas som en ny `trade_proposals`-rad kopplad till originalet via `parent_trade_id`.
- Originalförslaget får status `countered`.
- Servern kontrollerar att alla valda kort fortfarande är aktiva, olåsta och ägs av rätt person.
- Minst ett kort krävs på båda sidor.
- Valfritt meddelande kan följa motbudet.
- Ingen databasändring krävs eftersom befintliga tabeller redan stödjer länkat motbud.
- Begränsning i v1.8: mottagaren ser i motbudsfönstret bara motpartens kort från det aktuella bytesförslaget, inte hela motpartens bytespärm. Det är nästa naturliga förbättring.

## v1.9.0 – Hela bytespärmen i motbud
- Motbud kan nu byggas från båda personernas aktiva och olåsta kort.
- Dashboard hämtar motpartens tillgängliga byteskort för varje pågående byte.
- Motbudsfönstret visar inte längre bara korten från ursprungsförslaget.
- Användaren kan välja fritt bland sina egna tillgängliga kort och motpartens tillgängliga kort.
- Antal valda kort visas i båda kolumnerna.
- Om motpartens fulla bytespärm av någon anledning saknas faller UI:t tillbaka till korten från det befintliga förslaget.
- Ingen ny databasändring krävs.

## v1.10.0 – Robustare bytesflöde
- Vid accept kontrolleras att alla kort fortfarande är aktiva och inte låsta i ett annat byte.
- Korten låses direkt till det accepterade bytet.
- Andra väntande bytesförslag som använder något av samma kort avbryts automatiskt.
- `Jag har fått mitt kort` blir tillgängligt först när motparten markerat sina kort som skickade.
- Samma leveransregel kontrolleras även på servern och kan därför inte kringgås via API:t.
- När båda parter markerat mottaget slutförs bytet och korten tas bort från den aktiva bytespärmen.
- Ingen SQL-migration krävs.

## v1.11.0 – Bilduppladdning
- Användaren kan välja en bild när ett nytt byteskort skapas.
- JPG, PNG och WebP stöds, max 8 MB.
- Bilden förhandsvisas innan kortet sparas och kan tas bort.
- Webbläsaren laddar bilden direkt till Neon Object Storage via en tidsbegränsad presigned URL.
- S3-credentials skickas aldrig till webbläsaren.
- Den publika bildadressen sparas i befintliga `cards.image_url`.
- Kortbyte använder bucketen `card-images`.
- Ingen SQL-migration krävs eftersom `image_url` redan finns i `cards`.
- För lokal körning behöver Neon Storage-miljövariabler senare hämtas till `.env.local`.

## v1.12.0 – Foto först
- Nytt tvåstegsflöde för att lägga upp kort: Bild → Uppgifter.
- På mobil kan bakre kameran öppnas direkt.
- Bilden får större fokus och kan bytas eller tas bort.
- Det går fortfarande att hoppa över bild.
- Steg två prioriterar spelare/kort, kategori och år; set och värde är valfria.
- Vald bild följer med som miniatyr när uppgifterna fylls i.
- Mobilflödet är byggt för snabb enhandsanvändning.
- Strukturen är förberedd för framtida AI-avläsning av spelare, år, set och kortnummer.
- Ingen databasändring krävs.

## v1.13.0 – Smart kortregistrering
- Kortbyte analyserar kortnamnet medan användaren skriver.
- Årtal som 1994 eller 2025 hittas automatiskt och kan fyllas i med ett tryck.
- Numrering som `23/99` identifieras.
- Vanliga egenskaper känns igen: Auto/autograf, Rookie/RC, Relic/Jersey/Patch, parallel/refractor/holo och 1/1.
- Rubriken kan normaliseras, exempelvis `autograph` → `Auto` och mellanslag runt `/` tas bort.
- Förslagen visas som valbara chips. Användaren bestämmer alltid vad som ska användas.
- Accepterade egenskaper följer med i kortets rubrik utan ny databasstruktur.
- All analys sker lokalt och kräver inget externt AI-anrop.
- Det här är ett snabbt mellanläge innan riktig bildtolkning kopplas på.

## v1.14.0 – AI-bildtolkning
- Ett fotograferat eller uppladdat kort kan nu skickas till Kortbytes server för automatisk bildanalys.
- Analysen går via Neon AI Gateway och anropas endast från servern; AI-token exponeras aldrig i webbläsaren.
- AI:n föreslår spelare/person, år, set/serie, kortnummer, serialiserad numrering, kategori och synliga kortegenskaper.
- AI-förslagen fyller bara tomma formulärfält automatiskt; användaren kan alltid ändra allt innan kortet sparas.
- En säkerhetsgrad 0–100 och en kort osäkerhetsnotis visas.
- Bilden laddas upp en gång och samma Storage-URL återanvänds när kortet sparas.
- Om AI saknas eller misslyckas fungerar den vanliga manuella registreringen fortfarande.
- Servern instruerar modellen att inte gissa detaljer som inte går att se.
- Kräver `NEON_AI_GATEWAY_BASE_URL` och `NEON_AI_GATEWAY_TOKEN` i servermiljön.
- Standardmodell är `gpt-5-mini`, men kan bytas med `NEON_AI_CARD_MODEL`.
- Ingen SQL-migration krävs.

## v1.15.0 – AI-kontroll per fält
- AI:n rapporterar nu säkerhetsgrad separat för spelare, år, set, kortnummer, numrering och kategori.
- Varje fält kan även innehålla en kort evidensförklaring om vad i bilden som stöder förslaget.
- Endast fält med minst 85 % säkerhet autofylls.
- Fält på 60–84 % visas som gula förslag som användaren aktivt måste välja.
- Lägre säkerhet visas nedtonat och används aldrig automatiskt.
- Traits och numrering läggs bara till automatiskt vid minst 85 % säkerhet.
- Ingen SQL-migration krävs.

## v1.16.0 – Relevanta bytesförslag
- Bytesförslag bygger inte längre enbart på uppskattat värde.
- Ett föreslaget eget kort måste nu faktiskt matcha något som motparten har lagt i sin söklista.
- Första förslaget prioriterar högst relevans för motparten. Ett andra förslag kan prioritera närmast uppskattat värde, men bara bland kort motparten också söker.
- Godtyckliga värdepaket utan efterfrågan visas inte längre.
- Antalet förslag minskas från upp till tre till högst två för att minska beslutsbrus.
- Bundleberäkning görs först efter att topp 30 matchningar valts, och högst 18 relevanta egna kort används.
- Motpartens sökningar grupperas per användare i minnet i stället för att filtreras om för varje kandidat.
- Förtroendedata hämtas med aggregerade CTE:er i stället för korrelerade subqueries per kandidat.
- Ingen SQL-migration krävs.

## v1.17.0 – Transaktionssäkert bytesflöde
- Accept av bytesförslag är omskrivet till en enda atomisk PostgreSQL-operation.
- Förslagsraden och samtliga ingående kort låses med `FOR UPDATE` innan accept.
- Kortens ägarskap, aktivitet och låsstatus valideras på nytt precis när bytet accepteras.
- Trade-status, kortlåsning, fulfillment och avbokning av konkurrerande pending-förslag sker i samma SQL-operation.
- Ett fel gör att hela SQL-operationen rullas tillbaka av PostgreSQL.
- Motbud är också omskrivna till en enda atomisk PostgreSQL-operation.
- Motbud deduplicerar card IDs och avvisar samma kort på båda sidor.
- Alla valda kort låses och deras ägarskap/tillgänglighet kontrolleras innan motbudet skapas.
- Nytt trade proposal, alla trade items och status `countered` på originalet skapas/ändras atomiskt.
- Ingen SQL-migration krävs.

## v1.18.0 – Strukturerad kortidentitet
- Kort kan nu beskrivas med separata fält för spelare/person, kortnummer, variant/parallel, serialisering, graderingsbolag och betyg.
- Sökningar kan ange spelare, år, set, kortnummer och variant separat.
- Matchmotorn kombinerar fri text med strukturerad identitet.
- Exakta identitetsfält höjer relevansen medan uttryckliga konflikter sänker den.
- Därmed ska exempelvis två olika “Mats Sundin Auto” inte lika lätt behandlas som samma kort.
- AI-bildtolkningen fyller strukturerade spelare-, kortnummer- och serialiseringsfält när den har data.
- De extra fälten ligger bakom “Exakt kortidentitet” så grundflödet förblir enkelt.
- Migration: `neon/migrations/001_v1.18_structured_card_identity.sql`.
- **Migrationen måste köras i Neon innan v1.18 används mot den riktiga databasen.**

## v1.19.0 – Fler kort, fler byten
- Gratisnivån positioneras kring upp till 50 aktiva byteskort i stället för 5.
- Ny onboarding: 3 byteskort → 3 sökningar → ömsesidiga matchningar.
- Plus ska vara ett kraftverktyg för storsamlare, inte blockera kärnflödet.
- Ingen ny SQL-migration i v1.19. v1.18-migrationen krävs fortfarande.

## v1.19.1 – Hotfix
- Fixar `Runtime ReferenceError: user is not defined` i onboarding.
- Onboarding-komponenten ligger nu utanför navigationsfältet i korrekt HTML-struktur.
- Gratisgränsen är konsekvent 50 kort även i `freeSlots` och plan-kortet.
- Ingen SQL-migration tillkommer.
