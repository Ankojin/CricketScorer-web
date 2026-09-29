# Comprehensive Architecture & User Workflow Reference

**Application:** CricLeague (PWA)
**Version:** 2.33.28  
**Repository:** [https://github.com/Ankojin/CricketScorer-web](https://github.com/Ankojin/CricketScorer-web)  
**Latest Commit:** `0e05e91` (Theme: Navy + Electric Green — pushed to `main`)  
**Date:** 2026-09-26  
**Verified:** Code review of `public/index.html`, `public/css/styles.css`, `public/js/app.js`, `public/js/storage.js`, `src/engine/ScoringEngine.ts`; unit tests **27/27** pass after `npm test` (includes build).

---

## Executive Summary

CricLeague is a serverless, progressive web application (PWA) for offline-first cricket scoring with background AWS cloud synchronization.

The application strictly separates **Presentation**, **Application Controller**, **Scoring Engine**, and **Persistence**. UI theme and home changes must not alter cricket rules, match records, or sync contracts.

**Product defaults**

| Session | Primary Home CTA | Secondary | Live UI |
|--------|-------------------|-----------|---------|
| **Guest** | Quick Match | Sign in to Save | `scoringMode: 'QUICK'` — simple panel |
| **Registered** | Full Match | Quick Match | `FULL` = full hub; `QUICK` still available |

**Visual system (current):** Navy + Electric Green (not Forest/Emerald).

---

## 1. Implementation & Feature Status Matrix

| Component / Feature | Product Requirement | Status | Notes / Location |
| :--- | :--- | :---: | :--- |
| **Home redesign** | Guest: Quick + Sign in; Registered: Full + Quick | **DONE** | `renderHomeDashboard()` — `cric_user_mode` + auth |
| **Color system** | Navy + Electric Green design tokens | **DONE** | `:root` in `styles.css` (`#071B33`, `#49E878`, `#13A968`, `#F4F7FA`) |
| **Webscore removal** | No Web Scorer / Webscore on Home or Features | **DONE** | Folded into Quick Match |
| **Features menu** | Quick Match, Full Match, Coin Toss, Settings & Gully Rules | **DONE** | Four entries only |
| **Full Match sign-in gate** | Guest Full Match → auth modal | **DONE** | `startFullMatch()` → `openAuthModal('REGISTER')` |
| **URL routes** | `/quick-match`, `/full-match`, `/coin-toss`, `/settings-gully-rules` | **DONE** | `handleUrlRouting()`, `navigateToRoute()` |
| **Standalone coin toss** | Heads/Tails utility without match setup | **DONE** | `#standaloneCoinTossModal` |
| **Teams & roster directory** | Saved team cards + expandable Players | **DONE** | `renderPlayers()` |
| **Bottom nav cleanup** | Hide on Home, Quick wizard, Quick live | **DONE** | `updateBottomNavVisibility()` |
| **Scoring mode CTAs** | Quick → `QUICK`; Full → `FULL` | **DONE** | `startQuickMatch` / `startFullMatch`; `showNewMatchScreen(mode = 'QUICK')` |
| **Match `scoringMode`** | Persist `'QUICK' \| 'FULL'` on match | **DONE** | Set on create / wizard finish; used in `renderLiveScoring` |
| **QUICK simple panel** | Hide batters/bowler cards & match tabs when QUICK | **DONE** | `isQuickMode` in `renderLiveScoring()` |
| **Auto players (QUICK)** | Seed 11 + auto striker/NS/bowler; no start modals | **DONE** | Wizard overs step + `finishWizardAndStartMatch` |
| **QUICK completed summary** | Result card + Done/Home / View scorecard | **DONE** | `#completedMatchCard` |
| **Unit tests** | ScoringEngine suite | **DONE** | **27/27** via `npm test` (build + node:test) |
| **E2E Playwright** | Auth isolation / spectator | **CHECK LOCALLY** | Requires deps + server; do not assume green without run |

---

## 2. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     PRESENTATION / UX LAYER                               │
│   index.html · styles.css (Navy + Electric Green tokens) · PWA shell    │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ DOM events & navigation
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  APPLICATION CONTROLLER (`app.js`)                        │
│  Screens · session · modals · wizards · URL routes · scoringMode UI     │
└──────────────────┬──────────────────────────────────────┬───────────────┘
                   │ recalculateMatch                       │ save / sync
                   ▼                                        ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────────────┐
│     SCORING ENGINE CORE              │  │        PERSISTENCE CORE               │
│  src/engine/ScoringEngine.ts         │  │  public/js/storage.js                 │
│  → public/js/scoring-engine.js       │  │  LocalStorage · AWS API · auth/guest  │
│  (build only; never hand-edit)       │  └──────────────────────────────────────┘
└──────────────────────────────────────┘
```

### 2.1 Layer responsibilities

| Layer | Files | Role | Rules |
| :--- | :--- | :--- | :--- |
| **Presentation** | `index.html`, `styles.css` | DOM, modals, tokens, responsive layout | Mobile-first (~44px targets); Navy structure, Electric Green action |
| **Controller** | `app.js` | Routing, session, wizards, `pendingAction` UI, `scoringMode` presentation | Null-guard DOM; no rule changes in UI layer |
| **Engine** | `ScoringEngine.ts` → `scoring-engine.js` | Balls, wickets, extras, CRR/RRR, quotas, NRR | Immutable API; `npm run build` only |
| **Persistence** | `storage.js` | `cric_*` keys, guest vs registered, cloud sync | Offline-first |
| **PWA** | `sw.js`, `manifest.json` | Cache, installability | Prefer cache version bumps on release |

---

## 3. Design system (current)

**Name:** CricLeague — Navy + Electric Green

| Role | Token | Hex |
| :--- | :--- | :--- |
| Navy (structure / header / hero) | `--color-primary` | `#071B33` |
| Navy deep | `--color-primary-deep` | `#041326` |
| Navy soft | `--color-primary-soft` | `#0D2A4A` |
| Green (primary actions) | `--color-green` | `#13A968` |
| Electric (live / accent / YOUR SCORE) | `--color-electric` | `#49E878` |
| Page background | `--color-background` | `#F4F7FA` |
| Surface | `--color-surface` | `#FFFFFF` |
| Text | `--color-text` | `#122033` |
| Warning | `--color-warning` | `#F59E0B` |
| Error / wicket | `--color-error` | `#D92D20` |

**Usage:** Navy = chrome; green/electric = CTA & live; amber = extras/warning only; red = wicket/destructive only.

**Home hero copy (current code):**

```text
YOUR MATCH.
YOUR SCOREBOOK.
YOUR SCORE.          ← Electric Green (.highlight-green)
```

Subline: guest quick game vs sign-in to save.

> **Doc correction:** Earlier drafts referenced Forest (`#0b2213`) + Emerald (`#16a34a`) + Cream (`#f4f1ea`). That palette is **replaced** by Navy + Electric Green as of commit `0e05e91`.

---

## 4. Core state machine & event replay

### 4.1 Event-sourced model

1. Append / edit / remove ball on `match.ballHistory`  
2. `ScoringEngine.recalculateMatch(match)` replays from ball 1  
3. Totals, stats, CRR/RRR, over chips, innings/match completion update  
4. `CricStorage.saveMatch` → localStorage (+ cloud if registered & online)  
5. `renderLiveScoring()` (FULL shows tables/tabs; QUICK hides them)

### 4.2 `pendingAction` (simplified)

Real app also uses gates such as `SELECT_RUNS_WICKET`, run-out steps, `SELECT_BOWLER`, `SELECT_STRIKER`, `SELECT_NON_STRIKER`, innings-end prompts, etc.

```text
NONE ──wicket──► SELECT_STRIKER / fielder steps
    ──over end──► SELECT_BOWLER
    ──toss──────► TOSS_REQUIRED
```

**QUICK:** no striker/NS/bowler modals **at match start** (auto-assigned). Prompts after wicket / over end still apply.

### 4.3 Illustrative ball event (aligned names)

```javascript
{
  ballNumber: 1,
  runs: 4,
  extrasType: 'NONE',       // WIDE | NO_BALL | BYE | LEG_BYE | GRANTED | NONE
  extraRuns: 0,
  isWicket: false,
  wicketType: 'NONE',
  dismissedPlayerId: null,
  fielderId: null,
  strikerId: '…',
  nonStrikerId: '…',
  bowlerId: '…',
  timestamp: '…'
}
```

*(Illustrative — always verify against `ScoringEngine.ts` / `addBall` in `app.js`.)*

---

## 5. User workflows
### APP Entry Flow
                    OPEN APP / REFRESH
                            │
                            ▼
              ┌─────────────────────────┐
              │     LANDING SCREEN        │
              │   (screenLanding)         │
              └─────────────┬─────────────┘
                            │
              Has session? (localStorage)
              • cric_user_mode = GUEST
              • or REGISTERED + user/token
                            │
              ┌─────────────┴─────────────┐
              │ NO                         │ YES
              ▼                            ▼
┌──────────────────┐         ┌──────────────────┐
│  SIGN-IN ENTRY     │         │   HOME PAGE       │
│  #landingAuthEntry │         │   #homeDashboard  │
│                    │         │                  │
│ [Register/Sign In] │         │ Guest or          │
│ [Continue as Guest]│         │ Registered CTAs   │
└────────┬───────────┘         └──────────────────┘
│
┌──────┴──────┐
│             │
▼             ▼
SIGN IN /      CONTINUE AS
REGISTER         GUEST
│             │
│             ├─ set cric_user_mode = GUEST
│             └─ show Home
│
├─ success → cric_user_mode = REGISTERED
│            save user/token
└─ show Home
### Workflow A — Guest (Quick Match first)

```text
Landing → Continue as Guest
  → Home [Quick Match] [Sign in to Save]
  → /quick-match wizard: Teams → Overs → Toss → Score
  → Live QUICK panel (no start player modals; tables/tabs/bottom nav hidden)
  → #completedMatchCard → Done / Home | View Scorecard
```

### Workflow B — Registered (Full Match first)

```text
Home [Full Match] [Quick Match]
  → /full-match → squads, settings, Gully rules, toss
  → Live FULL: Summary | Scorecard | Overs | Stats + tables
  → Cloud sync, share, series/NRR as implemented
```

Guest tapping **Full Match** is gated to Sign in / Register.

### Workflow C — Spectator

```text
index.html?matchId=…
  → Read-only UI, keypad hidden, poll for updates
```

### Features menu (current)

1. Quick Match  
2. Full Match  
3. Coin Toss  
4. Settings & Gully Rules  

---

## 6. Key controller APIs (presentation)

| Function | Behaviour |
| :--- | :--- |
| `startQuickMatch()` | `currentScoringMode = 'QUICK'`; wizard / quick path |
| `startFullMatch()` | If not registered → auth modal; else `FULL` + `showNewMatchScreen('FULL')` |
| `showNewMatchScreen(mode = 'QUICK')` | Mode-aware new match UI |
| `finishWizardAndStartMatch()` | Create match, set toss/live, `scoringMode` QUICK, auto players, `showLiveScreen` |
| `renderLiveScoring()` | Branches on `scoringMode` / `currentScoringMode` for QUICK chrome |
| `updateBottomNavVisibility(screenId)` | Hides nav on landing, wizard, and QUICK live/scorecard/overs |
| `handleUrlRouting()` / `navigateToRoute()` | Clean paths for quick/full/toss/settings |

---

## 7. Strengths & recommendations

### Strengths

1. Engine isolation via `npm run build`  
2. Offline-first localStorage with optional cloud  
3. Explicit `QUICK` vs `FULL` presentation modes  
4. Navy + Electric Green tokenized theme  
5. Unit suite green (27/27)

### Future (non-blocking)

| Area | Suggestion |
| :--- | :--- |
| `app.js` size | Split navigation / wizard / scoring-ui modules over time |
| Large matches | Optional Web Worker for `recalculateMatch` |
| PWA | Explicit SW cache version on each CloudFront release |
| E2E CI | Ensure Lambda test deps installed; stable static server for Playwright |
| Theme polish | Rename leftover `.bg-purple` / `.bg-indigo` class names; reduce hard-coded hex in `app.js` UI chrome |

---

## 8. Footer

| Field | Value |
| :--- | :--- |
| Repo | https://github.com/Ankojin/CricketScorer-web |
| Version | 2.33.28 |
| Latest commit reviewed | `0e05e91` (Navy + Electric Green) |
| Date | 2026-09-26 |
| Unit tests | **27/27 passed** (`npm test` = build + `dist/test/ScoringEngine.test.js`) |
| E2E | Run `npm run test:e2e` locally before claiming pass |
| Engine | Generate only via `npm run build`; do not hand-edit `public/js/scoring-engine.js` |

---

## 9. Changelog vs previous architecture doc

| Topic | Previous doc | Updated truth |
| :--- | :--- | :--- |
| Theme | Forest + Emerald + Cream | **Navy + Electric Green** |
| Commit | `bfd655d` | **`0e05e91`** (theme) on `main` at review time |
| QUICK live / summary / mode persist | Claimed DONE | **Confirmed in code** |
| `showNewMatchScreen` | Unclear arity | **`showNewMatchScreen(mode = 'QUICK')`** |
| Features menu | Cleanup claimed | **Confirmed 4 items** |
| Tests | 27/27 + 4/4 e2e | **27/27 unit verified; e2e not re-verified in this pass** |
