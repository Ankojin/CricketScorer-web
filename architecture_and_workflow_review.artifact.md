# Comprehensive Architecture & User Workflow Reference

**Application:** CricScore Pro Web (PWA)
**Version:** 2.33.28
**Repository:** [https://github.com/Ankojin/CricketScorer-web](https://github.com/Ankojin/CricketScorer-web)
**Date:** 2026-09-25

---

## Executive Summary

CricScore Pro Web is a serverless, progressive web application (PWA) designed for offline-first cricket scoring with background AWS cloud synchronization.

The application strictly separates its **Presentation Layer**, **Application Controller**, **Scoring Engine Core**, and **Persistence Core**. This architectural boundary guarantees that UI modernizations, home redesigns, or presentation changes never corrupt cricket rules, persisted match records, or cloud synchronization.

---

## 1. Implementation & Feature Status Matrix

| Component / Feature | Product Requirement | Implementation Status | Notes / Location |
| :--- | :--- | :---: | :--- |
| **Home Redesign** | Guest CTAs (`Quick Match` + `Sign in`) vs Registered CTAs (`Full Match` + `Quick Match`) | **DONE** | Wired dynamically in `renderHomeDashboard()` (`app.js`) based on `cric_user_mode` and auth session. |
| **Color System** | Single unified Forest (`#0b2213`) + Emerald (`#16a34a` / `#22c55e`) + Cream (`#f4f1ea`) palette | **DONE** | Applied via CSS tokens in `:root` (`styles.css`). |
| **Webscore Removal** | Remove "Web Scorer / Webscore" user-facing branding from Home & Features menu | **DONE** | Merged into Quick Match. Features menu clean without duplicate Webscore entry (`index.html`). |
| **Scoring Mode CTAs** | `startQuickMatch()` sets `scoringMode = 'QUICK'`; `startFullMatch()` sets `scoringMode = 'FULL'` | **DONE** | Invokes `showNewMatchScreen(mode)` with explicit mode parameter (`app.js`). |
| **Match Object Persistence** | Store `activeMatch.scoringMode = 'QUICK' \| 'FULL'` on match creation | **DONE** | Saved in `handleCreateMatch()` and persisted to `cric_matches` (`storage.js`). |
| **QUICK Simple Panel** | Live scoring hides full batters table, bowler table & match tabs in QUICK mode | **DONE** | Evaluated in `renderLiveScoring()`. Full UI remains active for FULL mode (`app.js`). |
| **Auto Player Assignment** | Auto-seed 11 players & auto-assign striker/NS/bowler for QUICK start | **DONE** | Set in `finishWizardAndStartMatch()`. No selection modals pop up at match start. |
| **QUICK Complete Summary** | Result card with Man of the Match, `Done / Home` & `View Scorecard` CTAs | **DONE** | Rendered in `#completedMatchCard` (`app.js` & `index.html`). |

---

## 2. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PRESENTATION / UX LAYER                          │
│   HTML5 Shell (index.html) · Unified Theme (styles.css) · Mobile PWA   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ DOM events & Navigation
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     APPLICATION CONTROLLER (`app.js`)                   │
│   Screen Router · Session State · Modal Manager · Workflow Handlers    │
└──────────────────┬──────────────────────────────────────┬───────────────┘
                   │ Event-sourcing replay                │ Local / AWS API
                   ▼                                      ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────────────┐
│        SCORING ENGINE CORE           │  │           PERSISTENCE CORE           │
│   src/engine/ScoringEngine.ts        │  │           public/js/storage.js       │
│   (Authoritative rules engine)       │  │   • LocalStorage Cache               │
│                   │                  │  │   • AWS Cloud API Gateway Sync       │
│                   ▼                  │  │   • Auth & Guest Isolation           │
│   public/js/scoring-engine.js        │  └──────────────────────────────────────┘
│   (Compiled browser bundle)          │
└──────────────────────────────────────┘
```

### 2.1 Architectural Layer Responsibilities

| Layer | Primary Files | Responsibilities | Key Design Principles |
| :--- | :--- | :--- | :--- |
| **Presentation** | `index.html`<br>`styles.css` | DOM structure, semantic HTML5 modal overlays, responsive CSS layout, design tokens. | Mobile-first (~44px touch targets), single unified Forest + Emerald + Cream design system. |
| **App Controller** | `app.js` | SPA screen routing, session management, UI event wiring, wizard step progression, modal state gates. | High performance, zero framework overhead, strict null-guards on DOM operations. Signature: `showNewMatchScreen(mode = 'QUICK')`. |
| **Scoring Engine** | `src/engine/ScoringEngine.ts`<br>`public/js/scoring-engine.js` | Cricket rules, ball event replay, run rates (CRR/RRR), wicket attribution, bowler limits, NRR. | **Immutable & Isolated**. Compiled via `tsc` + `build-engine.js`. Never hand-edited in bundle form. |
| **Persistence** | `storage.js` | LocalStorage caching, guest vs registered user isolation, background AWS API Gateway / DynamoDB sync. | **Offline-first**. Offline actions succeed locally and automatically sync when online. |
| **PWA Shell** | `sw.js`<br>`manifest.json` | Offline asset caching, PWA installation, standalone app display mode. | Zero network latency for cached SPA assets. |

---

## 3. Core State Machine & Event Replay Engine

### 3.1 Event-Sourced Deterministic Replay Model
Cricket scoring state is maintained as an **immutable event stream of balls** (`ballHistory`).

When a ball is recorded, edited, or undone:
1. The ball event object is appended to, updated in, or removed from `match.ballHistory`.
2. `ScoringEngine.recalculateMatch(match)` runs a deterministic replay from ball #1 to the latest ball.
3. Totals, wickets, batter/bowler statistics, current run rate (CRR), required run rate (RRR), target, and current over ball chips are recalculated cleanly without accumulating drift errors.

```
Initial Match State
      │
      ├── + Ball Event (0, 1, 4, 6, WD, NB, WICKET...)
      │
      ▼
ScoringEngine.recalculateMatch() Replay Loop
      │
      ├──► Recalculate Batting Stats (runs, balls, 4s, 6s, SR, dismissal)
      ├──► Recalculate Bowling Stats (overs, maidens, runs, wickets, ECON)
      ├──► Recalculate Team Totals & Overs (legal ball increments)
      ├──► Evaluate Over Completions & Bowler Quota Limits
      └──► Evaluate Innings Completion & Target / Match Winner
      │
      ▼
Updated UI State & Persistence Save
```

### 3.2 Pending Action Gating Mechanism
*(Note: Simplified conceptual view. The actual application handles additional gates including `SELECT_RUNS_WICKET`, `DROPPED_CATCH_RUNS`, `RUN_OUT_RUNS`, `TOSS_REQUIRED`, `SELECT_BOWLER`, `SELECT_STRIKER`, `SELECT_NON_STRIKER`, `FIRST_INNINGS_END`, `KEEPER_REQUIRED`, etc.)*

```
[ NONE ] ──► (Wicket) ──► [ WICKET_REQUIRED / SELECT_STRIKER ]
   ▲                              │
   │                              ▼
   ├────────── (Fielder) ◄── [ SELECT_FIELDER ]
   │
   ├────────── (Over Complete) ──► [ SELECT_BOWLER ]
   │
   └────────── (Toss Required) ──► [ TOSS_REQUIRED ]
```

---

### 3.3 End-to-End Technical Execution Flow (`HTML` → `app.js` → `ScoringEngine` → `storage.js` → `HTML`)

The end-to-end data and execution flow for a user action (such as tapping a run button or recording a wicket) follows a strict unidirectional data pipeline.

*(Note: Schema fields below are aligned to actual `app.js` and `ScoringEngine.ts` types)*

```mermaid
sequenceDiagram
    autonumber
    actor Scorer as User (Scorer)
    participant DOM as HTML DOM (index.html)
    participant App as App Controller (app.js)
    participant Engine as ScoringEngine (scoring-engine.js)
    participant Store as Persistence (storage.js)
    participant AWS as AWS API Gateway / DynamoDB

    Scorer->>DOM: Taps Scoring Keypad Button (e.g. "4")
    DOM->>App: Triggers onclick="addBall(4)"

    Note over App: 1. State & Guard Validation<br/>2. Pending Action Check<br/>3. Construct Ball Event Object

    App->>App: Append ballEvent to activeMatch.ballHistory

    App->>Engine: window.ScoringEngine.recalculateMatch(activeMatch)
    Note over Engine: Replay ballHistory from Ball #1:<br/>• Recalculate Batting/Bowling Stats<br/>• Calculate CRR/RRR & Target<br/>• Check Over End & Bowler Quotas<br/>• Evaluate Innings Completion
    Engine-->>App: Return updated, consistent activeMatch

    App->>Store: window.CricStorage.saveMatch(activeMatch)
    Store->>Store: Update LocalStorage Cache ('cric_matches')

    alt Online & Registered User
        Store->>AWS: Background Async HTTP POST/PUT /matches
        AWS-->>Store: 200 OK Sync Confirmation
    else Offline
        Store->>Store: Queue for auto-sync on network reconnect
    end

    App->>DOM: renderLiveScoring()
    Note over DOM: • Update Main Score (Runs/Wickets, Overs)<br/>• Update Batters & Bowler Tables (if FULL mode)<br/>• Render Current Over Ball Chips<br/>• Update Action Banner if pendingAction
    DOM-->>Scorer: Visual UI Updated Immediately (<16ms)
```

#### Illustrative Ball Event Object Schema (`app.js` / `ScoringEngine.ts`):
```javascript
const ballEvent = {
  ballNumber: activeMatch.totalBalls + 1,
  runs: 4,                        // Bat runs (0, 1, 2, 3, 4, 6)
  extrasType: 'NONE',             // 'NONE' | 'WIDE' | 'NO_BALL' | 'BYE' | 'LEG_BYE' | 'GRANTED'
  extraRuns: 0,                   // Additional extra runs
  isAdjustment: false,            // True for SWAP adjustment events
  isWicket: false,                // True if wicket fell on this ball
  wicketType: 'NONE',             // 'BOWLED' | 'CAUGHT' | 'LBW' | 'RUN_OUT' | 'STUMPED' | etc.
  dismissedPlayerId: null,        // ID of dismissed batter
  fielderId: null,                // ID of catching / run-out / stumping fielder
  strikerId: 'pla_123',           // ID of striker
  nonStrikerId: 'pla_456',        // ID of non-striker
  bowlerId: 'plb_789',            // ID of current bowler
  timestamp: '2026-09-25T12:00:00.000Z'
};
```

---

## 4. Comprehensive User App Workflows

### Workflow A: Guest Mode Flow (Quick Match First)
```
Landing Screen (Register / Sign In | Continue as Guest)
       │
       ▼
Home Dashboard (Guest Mode)
       │  • Primary CTA: [ 🏏 Quick Match → ]
       │  • Secondary CTA: [ 🔑 Sign in to Save ]
       │
       ▼
Quick Match Wizard (4-Step Fast Path)
       │
       ├──► Step 1: TEAMS  ── (Inputs Team A & Team B names; auto-seeds 11 squad players if empty)
       ├──► Step 2: OVERS  ── (Stepper − 6 ＋ and quick pills: 6, 10, 20, 35, 50)
       ├──► Step 3: TOSS   ── (Coin flip animation, call selection, winner & Bat/Bowl decision)
       └──► Step 4: SCORE  ── (Launches Quick Live Scoring Panel directly)
       │
       ▼
Quick Live Scoring Panel (`scoringMode === 'QUICK'`)
       │  • Dominant score hero (0/0 · 0.0 overs)
       │  • Current over ball chips & primary keypad
       │  • Auto-assigned striker, non-striker & bowler (no start modals)
       │  • Full tables & match tabs hidden for clean, simple scoring
       │
       ▼
Completed Match Summary
       • Winner, margin & Man of the Match display
       • Actions: [ Done / Home ] and [ View Scorecard ]
```

---

### Workflow B: Registered User Flow (Full Squads & Cloud Sync)
```
Landing Screen / Auto Session Restore
       │
       ▼
Home Dashboard (Registered Mode)
       │  • Primary CTA: [ 📋 Full Match → ]
       │  • Secondary CTA: [ 🏏 Quick Match ]
       │
       ▼
Full Match Builder (`showNewMatchScreen('FULL')`)
       │
       ├──► Squad Builder: Load saved teams or create custom rosters (Captains & Vice-Captains)
       ├──► Match Settings: Overs per innings, max bowler overs, powerplay overs, Gully rules
       └──► Toss & Innings Start
       │
       ▼
Full Live Scoring & Match Hub (`scoringMode === 'FULL'`)
       │  • Match Hub Tabs: [ Summary ] | [ Scorecard ] | [ Overs ] | [ Stats ]
       │  • Full Batters & Bowler tables with player replacement buttons
       │  • Advanced ball edits from overs timeline
       │
       ▼
Cloud Synchronization & Export
       • Background sync to AWS API Gateway & DynamoDB
       • Scorecard snapshot PNG export & WhatsApp live score sharing
       • Tournaments & Series Points Table with Net Run Rate (NRR) sorting
```

---

### Workflow C: Spectator / Read-Only Live Stream Flow
```
Spectator Link Access (`index.html?matchId=match_123`)
       │
       ▼
Read-Only Spectator Mode
       │  • Keypad and scoring controls HIDDEN
       │  • Prominent Banner: "👀 Spectator Live Viewer Mode (Read-Only)"
       │  • Auto-polls AWS API Gateway every 5 seconds for live ball updates
       │
       ▼
Live Score Refresh
       • Renders updated score, batters, bowler, and recent ball chips automatically
```

---

## 5. Strengths & Architectural Recommendations

### 5.1 Key System Strengths
1. **Strict Engine Isolation:** Rebuilding the scoring engine via `npm run build` (`tsc && scripts/build-engine.js`) ensures zero hand-editing bugs in the production browser bundle.
2. **Offline Resilience:** LocalStorage caching ensures that matches can be created and scored completely offline, with cloud sync catching up when connectivity resumes.
3. **High Performance:** Vanilla JS execution with zero heavy virtual DOM or bundle bloat delivers instant response times on mobile devices.
4. **Cohesive Design System:** Unified Forest Green (`#0b2213`), Emerald (`#16a34a` / `#22c55e`), and Cream (`#f4f1ea`) palette ensures consistent visual hierarchy without copyright risks.

### 5.2 Recommendations for Future Evolution

| Target Area | Recommendation | Rationale |
| :--- | :--- | :--- |
| **Module Splitting** | Split `app.js` into ES modules (e.g. `ui-navigation.js`, `wizard-controller.js`, `scoring-ui.js`) over time. | Improves maintainability as UI feature set grows. |
| **Worker Processing** | Offload `recalculateMatch` to a Web Worker for matches with >500 balls. | Keeps main thread 100% idle during massive recalculations. |
| **Cache Versioning** | Implement explicit version hashing in `sw.js`. | Ensures users always receive instant PWA updates when new releases deploy to CloudFront. |

---

## 6. Footer & Reference Information

- **Repository:** [https://github.com/Ankojin/CricketScorer-web](https://github.com/Ankojin/CricketScorer-web)
- **Version:** `2.33.28` (`package.json`)
- **Date:** 2026-09-25
- **Engine Bundle Status:** Verified generated via `npm run build`
- **Test Suite Status:** 27/27 Node Unit Tests Passed, 4/4 Playwright E2E Tests Passed
