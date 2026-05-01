# ADR 0001 — TypeScript strict + vanilla DOM (geen framework)

**Status**: geaccepteerd, 2026-05-01

## Context

Het auteursportaal moet door Infinitas IT gereviewd worden op security en code-kwaliteit. Eindstaat: TypeScript strict, productie-klaar voor één auteur (Charlotte Phillips) met multi-tenant ondersteuning voor toekomstige uitbreiding.

We hadden de keuze tussen:

1. **Vanilla TypeScript + Vite** — strikte TS, web-standaarden DOM-API
2. **Framework rewrite** — React / Vue / Svelte
3. **Web Components hybrid** — vanilla TS + native Custom Elements

## Beslissing

**Optie 1: vanilla TypeScript strict + Vite + modulaire splitsing.**

## Onderbouwing

| Criterium             | Vanilla TS + Vite                             | Framework rewrite                                        |
| --------------------- | --------------------------------------------- | -------------------------------------------------------- |
| Dependency tree       | ~20 dev deps (Vite + ESLint + Vitest)         | ~200+ deps (framework + ecosystem)                       |
| Attack surface        | Minimaal                                      | Significant — elke transitive dep is supply-chain risico |
| Review-omvang voor IT | Onze code + 5 bekende libs                    | Onze code + framework + ecosystem                        |
| Migratie-risico       | Lijn-voor-lijn port van demo, gedrag testbaar | Hercodering, nieuwe regressies                           |
| IT-vertrouwen         | Hoog (web-standaarden)                        | Medium (vereist framework-expertise bij reviewers)       |
| Onderhoudslast        | Standaard DOM-API blijft eeuwig werken        | Frameworks evolueren (breaking changes)                  |
| Bundle-omvang         | Klein (~50 KB minified)                       | Groter (framework runtime ~50-150 KB extra)              |

**Voor IT-securityreview-context**:

- Minimale attack surface — supply-chain compromises (eslint, polyfill-attack precedenten) hebben minder impact
- Reviewer-vriendelijk — geen framework-magie waar compile-time bindings worden verborgen
- Type-safety zonder framework-koppeling — strict TS catches null/undefined/type errors at build
- Lichtere bundle → snellere portaal-load
- CSP-vriendelijk — geen `eval`, geen inline scripts; strikte CSP haalbaar zonder workarounds

## Alternatieven afgewezen

**Framework rewrite (React/Vue/Svelte)**: Te grote dependency-tree voor security-review zonder concreet voordeel voor deze app-grootte (~10 schermen, geen complex state management nodig).

**Web Components**: Goede standaard, maar minder bekend bij reviewers. Toegevoegde complexiteit zonder duidelijk voordeel voor MVP.

## Consequenties

**Positief**:

- Kleine, leesbare codebase (~3000 regels TS in MVP)
- ESLint kan agressief tunen zonder framework-friction
- Cherry-pick van demo-features mogelijk omdat structuur transparant is

**Negatief**:

- Geen build-time component validation (props/refs)
- Manuele state management (gebruiken event handlers + re-render functies)
- Reaktiviteit zelf bouwen — geen `useState` of vergelijkbaar

**Mitigatie van negatieve punten**: modulaire splitsing per domein (`src/auth`, `src/dashboard`, `src/admin`, `src/lib`) houdt elke module klein genoeg om zonder framework-state te begrijpen.

## Heroverwegen wanneer

- Codebase groeit boven ~10K regels TS
- State-complexiteit groter wordt (bijv. real-time multi-user collaboratie)
- IT-team na review actief framework-keuze gaat ondersteunen
