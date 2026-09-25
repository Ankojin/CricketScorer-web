# CricScore Pro UI v2

**Document:** CricScore Pro UI v2  
**Purpose:** UI/UX modernization and refactoring specification  
**Application:** CricScore Pro Web (PWA)  
**Repository:** https://github.com/Ankojin/CricketScorer-web  
**Status:** Implementation specification (repo-reviewed)  
**Date:** 2026-09-25  
**App version reviewed:** 2.33.28 (main branch)

---

## 1. Executive Summary

CricScore Pro UI v2 is a **UI/UX modernization** of the existing CricScore Pro Web progressive web application.

The goal is to make the application:

- Clean
- Simple
- Fast
- Mobile-first
- Touch-friendly
- Professional
- Easy to understand
- Easy to operate during live scoring

This is a **UI refactoring project, not a rewrite** of the application.

The existing application already separates UI, persistence, and a pure event-sourced scoring engine. UI v2 must preserve those boundaries.

### Universal Prompt Directive

> **PRESERVE FUNCTIONALITY FIRST.**
>
> UI changes must not alter cricket scoring behavior, persisted data, authentication, synchronization, or the scoring-engine source of truth.
>
> - Do not rewrite the scoring engine.
> - Do not hand-edit generated scoring-engine bundles.
> - Do not remove existing application capabilities.
> - Do not change existing data structures unless absolutely necessary and explicitly approved.
>
> Refactor presentation, navigation, layout, styling, and interaction patterns while keeping existing application behavior intact.

---

## 2. Repository Review (Phase 1 Analysis — Completed)

Reviewed from live GitHub `main` (Ankojin/CricketScorer-web) on 2026-09-25.

### 2.1 Actual Project Structure

```
CricketScorer-web/
├── public/                          ← Deployed static assets (S3 + CloudFront)
│   ├── index.html                   (~36 KB) SPA shell — screens + modals
│   ├── css/styles.css               (~14 KB) Dark mobile-first theme
│   ├── js/
│   │   ├── app.js                   (~163 KB, ~4292 lines) UI controller
│   │   ├── storage.js               (~16 KB) Local-first + AWS sync
│   │   └── scoring-engine.js        Generated browser bundle
│   ├── img/coin_heads.png, coin_tails.png
│   ├── manifest.json
│   └── sw.js                        Network-first service worker
├── src/
│   ├── engine/ScoringEngine.ts      (~42 KB) Single source of truth
│   └── models/types.ts              Match, Ball, PendingAction, stats types
├── scripts/build-engine.js          Builds public/js/scoring-engine.js
├── aws/
│   ├── template.yaml                SAM stack
│   ├── samconfig.toml
│   └── lambda/index.mjs             Auth, matches, tournaments, cascade delete
├── test/
│   ├── ScoringEngine.test.ts
│   └── e2e/ (Playwright: auth-guest, spectator, …)
├── ARCHITECTURE.md
├── ANDROID_WEB_PARITY_CHECKLIST.md
├── AWS_SETUP.md
├── package.json                     v2.33.28 — build / test / e2e scripts
└── playwright.config.ts
```

**Deploy path:** `public/` → S3 → CloudFront.  
**Build:** `npm run build` = `tsc` + `scripts/build-engine.js` (do not hand-edit generated JS).

### 2.2 Screens (confirmed in `public/index.html`)

| Screen ID | Role |
|-----------|------|
| `screenLanding` | Register / Sign In / Continue as Guest |
| `screenMatchList` | Match Center — list, filter, + Create Match |
| `screenNewMatch` | Team A/B builders, player directory, overs, save teams |
| `screenLiveScoring` | Live score, keypad, share, completed summary |
| `screenScorecard` | Full scorecard (+ Innings 1 / 2 tabs in app logic) |
| `screenOvers` | Over-by-over timeline |
| `screenTournaments` | Series list + standings |
| `screenPlayers` | Shared player directory |
| `screenStats` | Leaderboards |

Navigation is driven by `showScreen('screen…')` in `app.js` (~205 named functions).

### 2.3 Bottom Navigation (current)

Always visible during app use:

```
Matches · Live · Scorecard · Overs · Series · Players · Stats
```

IDs: `navMatches`, `navLive`, `navScorecard`, `navOvers`, `navTournaments`, `navPlayers`, `navStats`.

**UI v2 change:** reduce general nav to `Home · Matches · Teams · Stats · More`, and during live match use `Live · Scorecard · Overs · More`.

### 2.4 Modals (confirmed)

| Modal ID | Purpose |
|----------|---------|
| `authModal` | Register / Login |
| `tossModal` | Coin flip, winner, bat/bowl |
| `matchSettingsModal` | Overs, max bowler overs, Gully Rules, WK, powerplay, device sync |
| `wicketModal` | Dismissal type + next batter |
| `fielderModal` | Caught / stumped fielder |
| `runOutModal` | Run-out batter, runs, fielder |
| `droppedCatchFielderModal` / `droppedCatchRunsModal` | Dropped-catch flow |
| `extraRunsModal` | WD / NB / BYE / LEG_BYE additional runs |
| `otherRunsModal` | Overthrow / special runs |
| `editBallModal` | Historical ball edit from Overs/Scorecard |
| `selectionModal` | Generic player/bowler selection (striker, bowler, etc.) |
| `tournamentModal` | Create/edit series + default settings |
| `teamModal` | Team create/edit (incl. series team player pick) |
| `playerModal` | Player create/edit |

Many of these are **required by scoring parity** with Android (pending-action state machine). UI v2 may restyle them; do not remove flows.

### 2.5 Live Scoring Keypad (current)

```html
0  1  2  3
4  6  WD NB
1G  SWAP
WICKET / RETIRE
UNDO BALL
```

Handlers: `addBall(n)`, `addExtra('WIDE'|'NO_BALL')`, `addGrantedRun()`, `swapBatsmen()`, `openWicketModal()`, `undoLastBall()`.

Share and Delete currently sit on the live score card (not only under a menu).

### 2.6 New Match Screen Complexity (confirmed)

Single screen currently exposes simultaneously:

- Team A: saved-team select, name, colour, squad list, global search, checklist multi-select, quick-add
- Team B: same
- Overs per innings, max overs per bowler
- Save teams for reuse
- Proceed to Toss / Cancel

This is the main “admin console” density problem UI v2 targets with a step wizard.

### 2.7 Theme (current)

Dark-first CSS variables in `public/css/styles.css`:

```css
--bg-color: #121826;
--card-bg: #1e2640;
--card-border: #323d5e;
--primary-color: #818cf8;
--primary-dark: #6366f1;
--accent-color: #fbbf24;
--text-color: #f8fafc;
--text-muted: #94a3b8;
--danger-color: #f87171;
--success-color: #34d399;
--chip-4 / --chip-6 / --chip-w / --chip-extra
```

One mobile media query at `max-width: 480px`. Header uses a purple gradient.

**UI v2 target:** light default theme with design tokens (see §19); optional dark mode later.

### 2.8 Persistence (`public/js/storage.js`)

**localStorage keys (do not rename without migration):**

| Key | Content |
|-----|---------|
| `cric_matches` | Match list |
| `cric_teams` | Saved teams |
| `cric_global_players` | Shared player directory |
| `cric_tournaments` | Series |
| `cric_active_match_id` | Current match |
| `cric_auth_token` / `cric_auth_user` / `cric_user_mode` | Auth session |

**API surface:** `/auth/register`, `/auth/login`, `/matches`, `/matches/{id}`, `/players`, `/tournaments` (with cascade delete on tournament).

Local-first: every scoring action writes localStorage immediately; cloud sync is background best-effort.

### 2.9 Scoring Engine (protected)

- Source: `src/engine/ScoringEngine.ts` (class `ScoringEngine`)
- Types: `src/models/types.ts` — `Match`, `Ball`, `PendingAction`, `WicketType`, extras, stats
- Generated: `public/js/scoring-engine.js` via `npm run build` / `build:engine`
- Browser API includes: `recalculateMatch`, over summaries, partnerships, MotM, forecaster, points table, `isPhysicalBall`

**PendingAction values in use** (must keep UI gates working):

`SELECT_STRIKER`, `SELECT_NON_STRIKER`, `SELECT_BOWLER`, `TOSS_REQUIRED`, `SELECT_WK_A/B`, `SELECT_FIELDER`, `START_SECOND_INNINGS`, dropped-catch steps, `REPLACE_*`, `SELECT_RUNS_WICKET`, `SELECT_MATCH_SETTINGS`, etc.

### 2.10 Auth Model

- Demo-grade: hashed users in DynamoDB via Lambda; JWT in `cric_auth_token`
- Guest: `cric_user_mode = GUEST`, local-only
- Production path documented as Cognito later — frontend modal + token flow already isolated

### 2.11 Tests & Parity

- Unit: `test/ScoringEngine.test.ts`
- E2E: Playwright (`auth-guest-isolation`, `spectator`, QA suite scripts)
- `ANDROID_WEB_PARITY_CHECKLIST.md` — web is strong on core scoring; remaining gaps are mostly UX polish and a few advanced tournament settings

### 2.12 Problems Found (UI-relevant)

1. **Density on New Match** — team builders + full directory + overs on one screen.
2. **Bottom nav always shows 7 items** — Series / Players / Stats compete with Live during a match.
3. **Live screen mixes primary scoring with Share / Delete / secondary actions.**
4. **Dark heavy dashboard aesthetic** — fine for night use; light mode better for daytime outdoor scoring.
5. **Many modals** — necessary for parity; need clearer hierarchy and single primary modal rule (already partially enforced).
6. **CSS** — limited design tokens; many inline styles in HTML; only one breakpoint.
7. **Duplicate asset roots** — historical `js/` / `css/` at repo root vs authoritative `public/`; only `public/` is deployed.

### 2.13 Files to Modify vs Protect

| Path | Treatment |
|------|-----------|
| `public/index.html` | Refactor structure / progressive disclosure; keep IDs where handlers depend on them |
| `public/css/styles.css` | Major design-system rewrite (tokens, light theme, components) |
| `public/js/app.js` | Careful presentation/navigation changes only; keep handler contracts |
| `public/js/storage.js` | **Preserve** |
| `src/engine/ScoringEngine.ts` | **Do not modify for UI work** |
| `public/js/scoring-engine.js` | **Never hand-edit** |
| `src/models/types.ts` | Preserve unless explicit data model change approved |
| `public/sw.js` | Preserve (update cache names only if asset hashing requires it) |
| `aws/**`, Lambda, DynamoDB schema | **Out of scope** for UI v2 |
| `test/**` | Keep green; extend only if UI breaks selectors |

### 2.14 Risky Areas

- `onclick="…"` wiring and global functions in `app.js` — renaming buttons without updating handlers breaks scoring.
- `pendingAction` overlays — UI must not hide required selection gates.
- End-of-over bowler list + quota validation.
- Spectator mode (`?matchId=`) — hide keypad; keep poll behaviour.
- Guest vs registered isolation (covered by e2e).
- Tournament cascade delete messaging (toast only; no schema change).

---

## 3. Core Architectural Principle

```
┌──────────────────────────────────────────────┐
│              UI / Presentation               │
│  Screens · Components · Navigation · Forms   │
│  Modals · Responsive CSS · Accessibility     │
└──────────────────────┬───────────────────────┘
                       │ existing APIs / state
                       ▼
┌──────────────────────────────────────────────┐
│             Application Controller            │
│  Navigation · UI state · Handlers · Workflow │
│  (public/js/app.js)                          │
└──────────────┬─────────────────┬─────────────┘
               │                 │
               ▼                 ▼
┌──────────────────────┐  ┌──────────────────────┐
│  Scoring Engine      │  │  Persistence Core    │
│  ScoringEngine.ts    │  │  storage.js          │
│  (UNCHANGED)         │  │  (PRESERVED)         │
└──────────────────────┘  └──────────────────────┘
```

---

## 4. Non-Negotiable Preservation Rules

### 4.1 Scoring Engine

- Authoritative source: `src/engine/ScoringEngine.ts`
- Generated bundle: `public/js/scoring-engine.js` — never hand-edit
- Engine defects → separate PR via normal `npm run build` path

### 4.2 Persistence

Preserve localStorage keys, match/team/player/tournament shapes, auth session keys, offline-first behaviour, AWS API contracts.

### 4.3 Authentication

Preserve Register, Sign in, Guest, token storage, and modal entry points (`openAuthModal`, `continueAsGuest`).

### 4.4 Features that must remain available

Match creation, teams, players, overs, max bowler overs, powerplay fields, Gully Rules, toss, full live scoring set (0–6, WD, NB, 1G, SWAP, WICKET, RETIRE, UNDO), fielder/run-out/dropped-catch/extra-runs flows, edit ball, scorecard tabs, overs timeline, tournaments, stats, share/spectator, delete match/series, Reset App Data.

**Simplification = progressive disclosure, not deletion.**

---

## 5. Product Design Goals

1. Scorer always knows: where they are, what matters now, what to do next.
2. Feel like **a cricket scorer with a web UI**, not an admin dashboard with a scorer bolted on.
3. Principles: clean, simple, fast, mobile-first, touch-friendly, one primary action per screen, large scoring controls.

---

## 6. UI v2 Navigation

**General**

```
Home · Matches · Teams · Stats · More
```

**More:** Players, Tournaments/Series, Settings, import/export, etc.

**Active match**

```
Live · Scorecard · Overs · More
```

Implementation note: map existing `showScreen` / `nav*` handlers; hide Series/Players/Stats from the live bottom bar rather than deleting those screens.

---

## 7. Home / Match Center

Replace dense Match Center-first landing after auth with a clear home:

```
CricScore Pro                              ⚙

        Score cricket simply

     [ + QUICK MATCH ]
     [   WEB SCORE   ]

Recent Matches
  Team A  87/4
  Team B  91/4   Completed
```

- **Quick Match** → full wizard (Teams → Players → Settings → Toss → Live)
- **Web Score** → shorter path (Teams → Overs → Toss → Live) aligned with marketing workflow
- Keep guest/registered behaviour; keep existing match list data and filters under Matches

---

## 8. Quick Match Wizard

```
Teams → Players → Match Settings → Toss → Live Scoring
```

Progress: `● Teams ─── ○ Players ─── ○ Match ─── ○ Toss`

### Step 1 — Teams

Select existing or create new (name + colour). Cards with player counts. No full directory yet.

### Step 2 — Players

Roster list + `[ + Add Player ]` → focused search-or-create dialog (roles: Batter, Bowler, All-Rounder, WK). Preserve global directory data model.

### Step 3 — Match Settings

Compact card: overs, max bowler overs, save teams. **Advanced** expands Gully Rules / powerplay / quota fields already present in `matchSettingsModal` / new-match form.

### Step 4 — Toss

Existing toss modal logic; present as focused full-screen step.

### Step 5 — Start Match

Single primary **[ START MATCH ]** → current `confirmTossAndStart` / live path.

---

## 9. Toss

Minimal UI:

```
MATCH TOSS → [ FLIP COIN ] → Team won → [ BAT FIRST ] [ BOWL FIRST ] → [ START MATCH ]
```

Keep coin assets (`public/img/coin_*.png`), `openTossModal`, `selectTossWinner`, `selectTossDecision`, `confirmTossAndStart`.

---

## 10. Live Scoring (highest priority)

### Primary information

Score, wickets, overs, CRR, RRR/target when chasing, striker, non-striker, bowler, recent balls / ticker.

### Suggested layout

```
TEAM · 87/4 · 14.3 overs · CRR · RRR
BATTERS  (striker *)
BOWLER
KEYPAD: 0 1 2 3 / 4 6 WD NB / WICKET / UNDO
```

### Primary actions (must keep)

`addBall(0–6)`, `addExtra(WIDE|NO_BALL)`, WICKET/RETIRE, UNDO.

### Secondary → More

1G, SWAP, Share live score, Scorecard, Overs, Settings, Delete match, edit-ball entry points.

Do **not** remove pending-action modals (fielder, run-out, dropped catch, extra runs, selection). Restyle and ensure only one primary modal is visible.

---

## 11. Wicket / Retire

Focused sheet:

Dismissal types (Bowled, Caught, LBW, Run Out, Stumped, Retired Hurt, plus any already in `WicketType`) → Next batter → Confirm.

Keep `openWicketModal` and downstream fielder/run-out/dropped-catch chains. Retired Hurt must not count as a wicket (engine already defines this via `isPhysicalBall` / stats).

---

## 12. End of Over

Prompt next bowler only; respect quota (`maxOversPerBowler` / quota fields). Reuse `selectionModal` / bowler list behaviour.

---

## 13. Scorecard / Overs / Stats

Match header + tabs: Summary | Scorecard | Overs | Stats.

Preserve existing calculations and tabbed innings content. On small screens, prefer stacked cards for wide tables.

---

## 14. Match Complete

Clear winner + margin (`completedMatchCard`, `winnerTitle`, `marginText`) + links to Scorecard / Overs / Stats / Share / Back to Matches.

---

## 15. Spectator

`?matchId=` read-only: show `spectatorBanner`, hide keypad, keep polling. No scoring controls.

---

## 16. Management (under More)

- **Teams** — create/edit; data via `cric_teams`
- **Players** — directory; `cric_global_players`
- **Tournaments** — series + standings; cascade delete unchanged
- **Settings** — overs defaults, Gully Rules, Reset App Data (confirm)

---

## 17. Visual Design System (target)

### Light theme tokens

```css
--color-background: #F7F8FA;
--color-surface: #FFFFFF;
--color-primary: #1664D9;
--color-primary-dark: #0F4FAF;
--color-text: #172033;
--color-text-secondary: #667085;
--color-border: #E5E7EB;
--color-success: #16A34A;
--color-danger: #DC2626;
--color-warning: #F59E0B;
```

Keep chip colours for 4 / 6 / W / extras (can adapt existing `--chip-*`).

Characteristics: white cards, subtle borders/shadows, 10–14px radius, large score type (40–56px), ~44px min touch targets, minimal animation except toss.

### Typography

Page 28–36px · Section 20–24px · Score 40–56px · Body 14–16px · Secondary 12–14px.

### Buttons

Primary / Secondary / Danger. Confirm before Delete / Reset.

---

## 18. Responsive

Targets: mobile portrait/landscape, tablet, desktop.

- No horizontal scroll; keypad always usable
- Bottom nav never covers controls
- Desktop: max readable content width (do not stretch keypad full browser width)
- Expand breakpoints beyond the current single `480px` query

---

## 19. Progressive Disclosure

Show what is needed now; hide occasional actions under More / Advanced.

Examples: Add Player dialog instead of dual full directories; compact Match Settings; live More menu for Share/Delete.

---

## 20. Accessibility

Keyboard focus, semantic buttons, labels, aria on icon-only controls, modal focus trap + Escape, contrast, non-colour-only state (e.g. `*` for striker).

---

## 21. Empty / Error / Loading

Intentional empty states (no matches, no live match). Concise errors with Retry. Local ops must not block on network.

---

## 22. Implementation Phases

| Phase | Focus |
|-------|--------|
| **1** | Analysis — **done in this document** |
| **2** | Design system in `styles.css` (tokens, components, light theme) |
| **3** | Home / Match Center entry (Quick Match + Web Score + recent) |
| **4** | Match creation wizard (split `screenNewMatch`) |
| **5** | Toss presentation |
| **6** | **Live Scoring** (layout, keypad hierarchy, More menu) — highest priority |
| **7** | Wicket / extras modal presentation |
| **8** | Scorecard / Overs / Stats presentation |
| **9** | Nav: general vs active-match; More for management |
| **10** | Responsive + accessibility passes |
| **11** | Regression: unit + Playwright e2e + manual scoring matrix |

---

## 23. Regression Test Matrix

**Auth:** Register, Sign in, Guest, Sign out, guest isolation  

**Match creation:** Existing/new teams & players, overs, max bowler overs, save teams, powerplay/gully fields  

**Toss:** Flip, winner, bat/bowl, start  

**Live scoring:** 0–6, WD, NB (+ extra runs panels), 1G, SWAP, Wicket types, Retire, Undo, new batter, end of over, bowler quota, CRR/RRR/target, pendingAction gates  

**Sharing:** WhatsApp link, spectator read-only, auto refresh  

**Post-match:** Winner, margin, scorecard tabs, overs, stats  

**Persistence:** Reload, guest vs registered, cloud sync when online  

**Settings:** Overs, bowler limit, Gully Rules, Reset App Data  

**Responsive:** Phone / tablet / desktop  

**Automated:** `npm test`, `npm run test:e2e`

---

## 24. UI Regression Checklist (each phase)

- [ ] Screens load via existing `showScreen` IDs  
- [ ] Handlers still wired (`addBall`, modals, toss, share, delete)  
- [ ] No console errors  
- [ ] pendingAction flows still block until resolved  
- [ ] Match data survives reload  
- [ ] Scoring totals match engine  
- [ ] Spectator still read-only  
- [ ] Mobile keypad usable  

---

## 25. Definition of Done

**Visual:** Clean light UI, consistent components, live scoring dominant, simplified nav, progressive disclosure.  

**Functional:** All existing features available; calculations, persistence, auth, share, spectator, offline unchanged.  

**Technical:** Engine and generated bundle untouched; storage contracts intact; no framework migration.  

**Quality:** Mobile/tablet/desktop checked; a11y pass; unit + e2e green.

---

## 26. Coding-Agent Directive (paste at start of every task)

```
You are modifying the existing CricScore Pro Web application.

Repository: https://github.com/Ankojin/CricketScorer-web
Version context: package.json 2.33.28, public/ is the deployed SPA.

This is UI/UX modernization "CricScore Pro UI v2".

UNIVERSAL DIRECTIVE: PRESERVE FUNCTIONALITY FIRST.

Do not rewrite the app or migrate frameworks.
Do not change cricket scoring rules.
Do not modify src/engine/ScoringEngine.ts for UI work.
Do not hand-edit public/js/scoring-engine.js (rebuild via npm run build).
Do not change public/js/storage.js data keys or API contracts unless explicitly approved.
Do not change aws/ Lambda or DynamoDB schema.

Preserve: auth + guest, match creation, teams, players, overs, bowler limits,
toss, live scoring (0-6, WD, NB, 1G, SWAP, WICKET, RETIRE, UNDO),
pendingAction modals (fielder, run-out, dropped catch, extras, selection),
scorecard, overs, stats, tournaments, share/spectator, settings/Gully Rules,
localStorage keys, cloud sync, offline behaviour.

UI may change: layout, CSS design system, navigation presentation,
progressive disclosure, modal chrome, responsive behaviour, accessibility.

Primary nav target: Home · Matches · Teams · Stats · More
Active match nav: Live · Scorecard · Overs · More
Quick Match: Teams → Players → Match Settings → Toss → Live

Before coding: inspect current handlers and element IDs; prefer keeping IDs
that app.js binds to; make the smallest safe change.

After coding: check console, affected workflow, mobile layout, scoring, persistence;
run npm test and relevant Playwright specs when possible.
Report files changed, tests run, remaining risks.
```

---

## 27. Recommended Prompt Sequence (for Gemini / coding agent)

```
01  Confirm analysis against local checkout (this doc §2)
 ↓
02  Design system (styles.css tokens + components, light theme)
 ↓
03  Home / Match Center entry points
 ↓
04  Quick Match wizard (split New Match)
 ↓
05  Toss presentation
 ↓
06  Live Scoring layout + More menu     ← highest priority
 ↓
07  Wicket / extras modal chrome
 ↓
08  Scorecard / Overs / Stats
 ↓
09  Bottom nav: general vs active-match
 ↓
10  Responsive + accessibility
 ↓
11  Full regression (manual matrix + npm test + e2e)
```

Do not feed all phases in one prompt. Keep the Universal Directive in every prompt.

---

## 28. Final Target Statement

The finished product should feel less like:

> “A web application containing cricket scoring features”

and more like:

> “A cricket scorer that happens to have a web interface.”

**Preserve the functionality. Aggressively simplify the presentation.**

Architectural boundary remains:

```
UI Rendering (v2) → app.js controller → ScoringEngine (unchanged)
                                    ↘ storage.js (preserved)
									
									
```
