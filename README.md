# Kortbyte v1.0.1.0 — Neon migration

Kortbyte är en mobilvänlig bytesplattform för samlarkort. v1.0.1 flyttar backend-grunden från Supabase till **Neon Postgres + Neon Auth**.

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
- Kortbilder är inte migrerade i v1.0.1. Neon är databas/Auth, inte objektlagring. Bildlagring kopplas i en separat release.
- Chat, leveransbekräftelser, omdömen och notiser finns i datamodellen men v1.0.1 fokuserar på att få den nya backendkedjan stabil först.


## v1.0.1
- Rättar Neon Auth till aktuell `@neondatabase/auth` 0.5.0-beta.
- Synkar React och React DOM till 19.2.8.
- Vid uppgradering från äldre lokal version: radera `node_modules` och `package-lock.json` före `npm install` för att undvika gamla peer dependencies.
