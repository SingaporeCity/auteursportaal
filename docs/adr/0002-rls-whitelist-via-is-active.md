# ADR 0002 — Toegangscontrole via RLS + `is_active` whitelist

**Status**: geaccepteerd, 2026-05-01

## Context

Het portaal heeft één admin (`admin@noordhoff.nl`) en N auteurs (eerst alleen Charlotte Phillips, later meer via onboardingsflow). De admin maakt auteurs aan via de admin-UI; auteurs ontvangen pas een set-password mail (en kunnen pas inloggen) als de admin ze expliciet activeert.

We moeten voorkomen dat:

1. Iemand met een geldig Supabase-auth-account zonder `authors`-record toegang krijgt
2. Een auteur die wel een `authors`-record heeft maar **niet geactiveerd** is, alvast kan inloggen
3. Een auteur de data van een andere auteur kan zien

## Beslissing

**Drielagenmodel:**

1. **Supabase Auth** — wie heeft een geldige sessie?
2. **`authors`-record** — heeft die persoon een profiel? (`auth.uid() = authors.id`)
3. **`is_active` flag** — is dat profiel door admin geactiveerd?

Toegangsregel:

```ts
// src/auth/whitelist.ts
function decideAccess(author: AuthorRow | null): AccessDecision {
  if (author === null) return { granted: false, reason: 'no_profile' };
  if (author.is_admin) return { granted: true, role: 'admin' };
  if (author.is_active) return { granted: true, role: 'author' };
  return { granted: false, reason: 'not_active' };
}
```

RLS-policies op alle tabellen filteren tegelijk op `auth.uid() = author_id` (of `is_admin = true`), zodat ook bij directe Postgres-queries de scheiding gegarandeerd is.

## Onderbouwing

**Waarom `is_active` apart van `auth.users`?**

Een auteur kan technisch een Supabase auth-user hebben (UUID gematched) zonder dat de admin hen heeft geactiveerd. Dat is de tussenstap in de onboardingsflow:

```
Admin maakt authors-record (is_active=false, geen auth-user)
   ↓
Admin uploadt statements (storage geïsoleerd op author-UUID)
   ↓
Admin klikt 'Activeer' → Edge Function maakt auth-user + recovery-mail + is_active=true
   ↓
Auteur klikt mail-link → set password → kan inloggen
```

Tijdens de tussenfase (na auth-user, vóór mail-set) zou de auteur theoretisch kunnen inloggen als ze de password kennen. De `is_active`-check garandeert dat dit niet kan.

**Waarom whitelist client-side EN RLS?**

- Client-side whitelist (in `whitelist.ts`) → UX: nette "geen toegang" pagina + auto-logout
- RLS policies → Security: zelfs als client-side check wordt omzeild (developer tools, custom client), levert Postgres geen rijen voor niet-geactiveerde users

Client-side is UX. RLS is de echte beveiliging.

## Alternatieven afgewezen

**Eén-flag-systeem (`auth.users.email_confirmed_at`)**: Te grof. Het scheidt "email is geverifieerd" van "admin heeft me geactiveerd" niet. Een auteur die zijn eigen mail verifieert is nog niet automatisch toegelaten tot het portaal.

**Aparte `whitelist`-tabel**: Onnodig. `authors.is_active` doet hetzelfde met minder complexiteit.

**Cookie-/JWT-claim-based whitelist**: Vereist custom claims in JWT. Supabase ondersteunt dat, maar geeft geen voordeel — `authors.is_active` is altijd up-to-date (een admin kan iemand ook **de**activeren, dan moet de volgende RLS-check direct werken zonder JWT-refresh).

## Consequenties

**Positief**:

- Eén bron van waarheid: `authors.is_active`
- Admin kan op elk moment in- of uitschakelen via UI
- Werkt voor zowel email+password (auteurs) als SSO (admin) flow

**Negatief**:

- Per request 1 extra query naar `authors` tijdens auth — minimal performance impact (RLS-cached binnen request)

**Edge case**: een auteur die geactiveerd is en daarna gedeactiveerd wordt door admin: bestaande sessie blijft tot token-refresh of sign-out. Acceptabel voor MVP; voor productie kan een `auth.signOut(scope: 'all_sessions')`-call vanuit Edge Function bij deactivatie worden toegevoegd.

## Heroverwegen wanneer

- Onboardingsflow verandert (bijv. zelf-aanmelden door auteurs zonder admin-tussenkomst)
- Multi-tenant scenario waar auteurs onder verschillende uitgevers vallen (`authors.publisher_id`)
- Compliance-eisen vragen om JWT-claim-based access control voor third-party auditing
