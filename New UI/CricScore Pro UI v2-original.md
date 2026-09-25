# CricScore Pro UI v2

**Document:** CricScore Pro UI v2  
**Purpose:** UI/UX modernization and refactoring specification  
**Application:** CricScore Pro Web (PWA)  
**Repository:** https://github.com/Ankojin/CricketScorer-web  
**Status:** Implementation specification  
**Date:** 2026-09-25

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

The existing application already separates:

| Layer | Responsibility |
|-------|----------------|
| UI controller (`app.js`) | Navigation, state, handlers, modals |
| Persistence (`storage.js`) | LocalStorage + background AWS sync |
| Scoring engine (`ScoringEngine.ts` → `scoring-engine.js`) | Cricket rules and state recalculation |
| PWA shell (`sw.js`) | Offline / installable behaviour |

UI v2 must preserve those boundaries.

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

## 2. Existing Application Baseline

### 2.1 Current Frontend Structure

| Component | Responsibility | UI v2 Treatment |
|-----------|----------------|-----------------|
| `public/index.html` | SPA shell, screens, forms, modals | Refactor |
| `public/css/styles.css` | Dark / mobile-first styling | Major refactor |
| `public/js/app.js` | Navigation, state, UI handlers | Refactor carefully |
| `public/js/storage.js` | LocalStorage + background AWS sync | **Preserve** |
| `src/engine/ScoringEngine.ts` | Cricket rules & recalculation | **Do not modify** |
| `public/js/scoring-engine.js` | Generated browser bundle | **Never hand-edit** |
| `public/sw.js` | PWA / offline service worker | Preserve (unless cache needs update) |

### 2.2 Existing User Flow (from User Manual)

```
Landing
  → Sign in / Register / Guest
Match Center
  → List + filter matches
  → Tournaments (series + standings)
  → Players (shared roster)
New Match Setup
  → Build squads, set overs
Toss
  → Flip coin, winner + decision
Live Scoring
  → Keypad, wicket, over-end
  → Share → Spectator View (read-only)
Completed Summary
  → Winner + margin
Scorecard / Overs / Stats
```

### 2.3 Current Pain Points

- Too many controls visible at once (especially on New Match and Live Scoring).
- Feels like an administration console rather than a simple cricket scorer.
- Dense dark dashboard aesthetic.
- Primary scoring actions compete with administrative actions.
- Limited progressive disclosure.

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
└──────────────┬─────────────────┬─────────────┘
               │                 │
               ▼                 ▼
┌──────────────────────┐  ┌──────────────────────┐
│  Scoring Engine      │  │  Persistence Core    │
│  (UNCHANGED)         │  │  (PRESERVED)         │
│  Cricket rules       │  │  Local + Cloud       │
└──────────────────────┘  └──────────────────────┘
```

The rendering layer may evolve substantially.  
The scoring engine and persistence core must remain isolated.

---

## 4. Non-Negotiable Preservation Rules

### 4.1 Scoring Engine

- Do **not** modify cricket rules as part of UI work.
- Authoritative source: `src/engine/ScoringEngine.ts`
- Generated bundle: `public/js/scoring-engine.js` — **never hand-edit**
- If a genuine engine defect is found, treat it as a separate change through the normal build process.

### 4.2 Persistence

Preserve:

- LocalStorage behaviour
- Match / team / player / tournament persistence
- Authentication session behaviour
- Cloud synchronization
- Offline behaviour
- AWS API interaction

### 4.3 Authentication

Preserve:

- Register / Sign in
- Guest mode
- Existing session and token behaviour

UI may redesign presentation only.

### 4.4 Existing Features (must remain available)

| Area | Capabilities |
|------|--------------|
| Match | Create, teams, players, overs, max bowler overs, save teams, toss, start live |
| Scoring | 0–6, WD, NB, 1G, SWAP, WICKET, RETIRE, UNDO |
| Match flow | New batter, end-of-over bowler, max overs validation, CRR/RRR/target |
| Post-match | Winner, margin, scorecard, overs, stats |
| Management | Teams, Players, Tournaments, Settings, Gully Rules |
| Sharing | Share live score, spectator link, read-only view, auto-refresh |
| Data | Match deletion, tournament deletion, Reset App Data |

Simplification means **progressive disclosure**, not deletion.

---

## 5. Product Design Goals

### 5.1 Primary Goal

The scorer should always know:

1. Where they are
2. What information matters **now**
3. What action they should take **next**

### 5.2 Design Philosophy

> **A cricket scorer that happens to have a web interface.**

Not:

> An administration dashboard containing a cricket scorer.

### 5.3 Design Principles

- Clean
- Simple
- Fast
- Mobile-first
- Touch-friendly
- Professional
- Minimal visual noise
- Clear hierarchy
- One primary action per screen
- Large scoring controls
- Consistent spacing & typography
- Responsive on mobile, tablet, desktop

---

## 6. UI v2 Navigation

### 6.1 General Navigation

```
Home · Matches · Teams · Stats · More
```

**More** contains:

- Players
- Tournaments
- Settings
- Other management functions

### 6.2 Active Match Navigation

When a match is being scored:

```
Live · Scorecard · Overs · More
```

The scorer must not be forced through general administration screens during live scoring.

---

## 7. Home / Match Center

The home screen answers: **“What do you want to do?”**

```
┌─────────────────────────────────────┐
│ 🏏 CricScore Pro              ⚙    │
│                                     │
│        Score cricket simply         │
│                                     │
│     ┌─────────────────────────┐     │
│     │     + QUICK MATCH       │     │
│     └─────────────────────────┘     │
│                                     │
│     ┌─────────────────────────┐     │
│     │      WEB SCORE          │     │
│     └─────────────────────────┘     │
│                                     │
│ Recent Matches                      │
│ ┌─────────────────────────────┐     │
│ │ Rockets  87/5               │     │
│ │ Thunder 91/4   Completed    │     │
│ └─────────────────────────────┘     │
└─────────────────────────────────────┘
```

**Primary actions**

1. **Quick Match** — full guided setup
2. **Web Score** — essential setup (Teams → Overs → Toss → Score)

**Secondary content**

- Continue active match (if any)
- Recent matches / match history
- Empty state when no matches exist

Avoid exposing advanced administration on the home screen.

---

## 8. Entry Paths (aligned with new workflow)

| Path | Intent | Steps |
|------|--------|-------|
| **Web Score** | Fastest path | Teams → Overs → Toss → Score |
| **Quick Match** | Complete guided match | Create → Teams → Players → Overs → Toss → Score → Stats |
| **Full Match** | Complete experience | Download mobile app (native) |

UI v2 focuses on **Web Score** and **Quick Match** inside the existing web PWA.

---

## 9. Quick Match Workflow (4–5 step wizard)

```
Teams → Players → Match Settings → Toss → Live Scoring
```

Progress indicator:

```
● Teams ─── ○ Players ─── ○ Match ─── ○ Toss
```

### 9.1 Step 1 — Teams

- Select existing team **or** create new team
- Team name + colour
- Show selected teams as simple cards

```
TEAM A                          TEAM B
┌──────────────────┐            ┌──────────────────┐
│ 🔵 Rockets       │     VS     │ 🔴 Thunder       │
│ 11 players       │            │ 11 players       │
└──────────────────┘            └──────────────────┘

[ Continue ]
```

Do **not** show the full player directory on this step.

### 9.2 Step 2 — Players

Progressive disclosure:

```
Rockets — Players (11)

✓ Rahul
✓ David
✓ Ahmed
…

[ + Add Player ]
```

**+ Add Player** opens a focused dialog:

- Search existing player  
  **OR**
- Create new player (Name + Role)

Roles remain: Batter · Bowler · All-Rounder · WK

### 9.3 Step 3 — Match Settings

Compact card:

```
Match Settings

Overs per innings          20
Max overs per bowler        4
Save teams for reuse        ✓

Advanced settings >
```

Advanced (Gully Rules, etc.) hidden until requested.

### 9.4 Step 4 — Toss

Minimal focused screen (see §10).

### 9.5 Step 5 — Start Match

One strong primary button: **[ START MATCH ]**

---

## 10. Toss

```
              MATCH TOSS

                 🪙

            [ FLIP COIN ]

         Rockets won the toss

         [ BAT FIRST ]
         [ BOWL FIRST ]

            [ START MATCH ]
```

Preserve:

- Existing coin animation
- Toss winner recording
- Bat / Bowl decision
- Start Match Live behaviour

Remove unrelated navigation and secondary information from this screen.

---

## 11. Live Scoring — Highest Priority

The scorer should see only the **critical information** needed for the next action.

### 11.1 Primary Information

1. Current score
2. Wickets
3. Overs
4. Current run rate (CRR)
5. Required run rate (RRR) when chasing
6. Target when chasing
7. Striker
8. Non-striker
9. Current bowler

### 11.2 Recommended Layout

```
┌─────────────────────────────────┐
│ Rockets                   87/4  │
│ 14.3 overs                      │
│ CRR 5.93       RRR 7.20         │
├─────────────────────────────────┤
│ BATTERS                         │
│ Rahul *             42 (31)     │
│ David               18 (15)     │
├─────────────────────────────────┤
│ BOWLER                          │
│ Ahmed                2/18 (3.0) │
├─────────────────────────────────┤
│                                 │
│      0     1     2     3        │
│                                 │
│      4     6    WD    NB        │
│                                 │
│           WICKET                │
│            UNDO                 │
└─────────────────────────────────┘
```

### 11.3 Primary Scoring Actions (must preserve)

```
0  1  2  3
4  6  WD NB
WICKET
UNDO
```

Also preserve (can live under More or secondary area):

- 1G (Granted run)
- SWAP
- RETIRE

### 11.4 Secondary Actions → More menu

```
⋮ More
  · Swap batsmen
  · Granted run
  · Share live score
  · Scorecard
  · Overs
  · Settings
  · Delete match
```

---

## 12. Wicket / Retire UI

Focused modal or bottom sheet:

```
Wicket

Dismissal Type
[ Bowled ]  [ Caught ]  [ LBW ]
[ Run Out ] [ Stumped ] [ Retired Hurt ]

Next Batter
[ Select Batter ]

[ CONFIRM WICKET ]
```

- Preserve all existing dismissal types.
- **Retired Hurt** must not incorrectly increment wickets.
- Minimal taps to complete.

---

## 13. End-of-Over Interaction

```
OVER COMPLETE

Next Bowler

Bowler A
Bowler B
Bowler C

[ SELECT BOWLER ]
```

Respect existing maximum-overs-per-bowler validation. UI must not bypass it.

---

## 14. Scorecard / Overs / Stats

Clean match-details layout:

```
MATCH SUMMARY

Team A  87/4
Team B  91/4
Result

[ Summary ] [ Scorecard ] [ Overs ] [ Stats ]
```

- Preserve all existing batting, bowling, over and statistical data.
- On mobile, convert wide tables to stacked cards where appropriate.
- Sticky tab navigation recommended.

---

## 15. Match Completion

```
MATCH COMPLETE

🏆 Team A
Won by 6 wickets

[ SCORECARD ]  [ OVERS ]  [ STATS ]
[ SHARE ]      [ BACK TO MATCHES ]
```

Existing winner and margin calculations remain authoritative.

---

## 16. Spectator View

Clearly read-only:

```
LIVE

Team A  87/4
14.3 overs

LIVE SCORE — Read-only spectator view
```

- No scoring controls.
- Preserve share-link and auto-refresh behaviour.

---

## 17. Management Screens (secondary)

### Teams

```
Teams
[ + Create Team ]

Team A — 11 players
Team B — 11 players
```

### Players

```
Players
[ Search ]  [ + Add Player ]

Name · Role (Batter / Bowler / All-Rounder / WK)
```

### Tournaments

```
Tournaments
[ + Create Tournament ]

Tournament A — Matches: 8 — Standings >
```

These live under **More** / **Manage** and must not clutter live scoring.

---

## 18. Settings

```
Settings

Match
  · Overs
  · Max overs per bowler

Scoring
  · Gully Rules

Application
  · Reset App Data   ← confirmation required

Account
  · Existing account controls
```

Dangerous actions must be visually separated and require confirmation.

---

## 19. Visual Design System

### 19.1 Default Theme — Light

| Token | Value |
|-------|-------|
| Background | `#F7F8FA` |
| Surface | `#FFFFFF` |
| Primary | `#1664D9` |
| Primary dark | `#0F4FAF` |
| Text | `#172033` |
| Secondary text | `#667085` |
| Border | `#E5E7EB` |
| Success | `#16A34A` |
| Danger | `#DC2626` |
| Warning | `#F59E0B` |

Use CSS custom properties (design tokens) rather than repeated hard-coded values.

### 19.2 Visual Characteristics

- White cards
- Subtle borders / restrained shadows
- Corner radius 10–14 px
- Large score typography
- Fewer borders and emojis
- Consistent iconography
- One primary action per screen
- Large touch targets
- Minimal animation (except toss / important state changes)
- Optional dark mode later

### 19.3 Typography Hierarchy

| Element | Size |
|---------|------|
| Page title | 28–36 px |
| Section title | 20–24 px |
| Live score | 40–56 px |
| Normal text | 14–16 px |
| Secondary text | 12–14 px |

### 19.4 Buttons

| Type | Examples |
|------|----------|
| Primary | START MATCH, QUICK MATCH, SAVE |
| Secondary | Cancel, Back, Edit |
| Danger | Delete Match, Reset App Data |

Minimum touch target ≈ **44 × 44 px**. Scoring buttons preferably larger.

---

## 20. Responsive Design

| Device | Priority |
|--------|----------|
| Mobile portrait | Score, batsmen, bowler, keypad |
| Mobile landscape | Keep score visible, no overflow |
| Tablet | Extra context without cognitive overload |
| Desktop | Readable max content width; do not stretch keypad full-width |

Requirements:

- No horizontal scrolling
- No clipped buttons or overlapping modals
- Keypad fits viewport
- Bottom navigation does not cover controls
- Tables remain usable (cards on small screens)

---

## 21. Bottom Navigation

**General**

```
Home · Matches · Teams · Stats · More
```

**Active match**

```
Live · Scorecard · Overs · More
```

Navigation must never cover scoring controls.

---

## 22. Progressive Disclosure

Central principle:

> **Show what is needed now. Hide what is needed occasionally.**

Examples:

- Players → `[ + Add Player ]` instead of full directory
- Match Settings → compact card + Advanced >
- Live actions → primary keypad + More menu

Do not remove functionality merely because it is hidden.

---

## 23. Accessibility

- Keyboard navigation
- Visible focus states
- Semantic buttons (prefer `<button>` over clickable divs)
- Form labels
- `aria-label` for icon-only controls
- Modal focus trapping + Escape key
- Sufficient colour contrast
- Touch-friendly targets
- Do **not** communicate important state by colour alone (use `*` for striker, text labels, etc.)

---

## 24. Empty, Error & Loading States

**Empty**

```
No matches yet

Create your first cricket match.

[ + CREATE MATCH ]
```

**Error**

```
Unable to save match.
Your local match is still available.

[ Retry ]
```

Avoid raw technical errors for normal users.  
Local operations should not be blocked by network loading states.

---

## 25. Files to Protect

| File / Area | Rule |
|-------------|------|
| `src/engine/ScoringEngine.ts` | Do not modify for UI work |
| `public/js/scoring-engine.js` | Never hand-edit |
| `public/js/storage.js` | Avoid changing data behaviour |
| AWS Lambda / DynamoDB / API Gateway / S3 / CloudFront / SAM | Do not change during UI-only task |

---

## 26. Files Expected to Change

Primary:

- `public/index.html`
- `public/css/styles.css`
- `public/js/app.js`

Additional UI-only modules may be introduced if they improve separation **without** duplicating or bypassing existing business logic.

---

## 27. Suggested Conceptual Components

Even without a framework migration, keep clear responsibility:

- Header
- Navigation / BottomNavigation
- MatchCard · TeamCard · PlayerCard
- ScoreDisplay · BatterCard · BowlerCard
- ScoreKeypad
- WicketModal
- TossView
- MatchSettings
- Scorecard · OverTimeline · StatsView
- Toast · ConfirmationModal

---

## 28. Implementation Phases

| Phase | Focus | Notes |
|-------|-------|-------|
| 1 | Analysis | Inspect repo, screens, modals, CSS, JS, state, persistence. **No code changes.** |
| 2 | Design system | Tokens, typography, buttons, cards, inputs, modals, navigation, responsive foundations |
| 3 | Home / Match Center | Landing, recent matches, Quick Match / Web Score entry |
| 4 | Match creation | Teams → Players → Match Settings → Toss |
| 5 | **Live Scoring** | **Highest priority** — score header, batters, bowler, keypad, wicket, undo, More menu |
| 6 | Post-match | Summary, Scorecard, Overs, Stats |
| 7 | Management | Teams, Players, Tournaments, Settings |
| 8 | Responsive | Mobile, tablet, desktop |
| 9 | Accessibility | Full pass |
| 10 | Regression | Complete functional test suite |

---

## 29. Regression Test Matrix

### Authentication
- Register · Sign in · Guest mode · Sign out

### Match Creation
- Create match · Existing / new teams · Existing / new players · Overs · Max bowler overs · Save teams

### Toss
- Flip coin · Winner · Bat first · Bowl first · Start match

### Live Scoring
- 0 · 1 · 2 · 3 · 4 · 6 · Wide · No-ball · Granted run · Swap · Wicket · Retire · Undo · New batter · End of over · New bowler · Bowler limit · CRR · RRR · Target

### Sharing
- Share live score · Spectator link · Read-only view · Auto refresh

### Post Match
- Winner · Margin · Scorecard · Overs · Stats

### Persistence
- LocalStorage · Browser reload · Guest persistence · Registered-user persistence · Cloud sync · Offline behaviour

### Settings
- Overs · Bowler limit · Gully Rules · Reset App Data

### Responsive
- Mobile portrait / landscape · Tablet · Desktop

---

## 30. UI Regression Checklist (after every major change)

- [ ] Existing screen loads
- [ ] Existing buttons still work
- [ ] Event handlers remain connected
- [ ] No console errors / JS exceptions
- [ ] Modals work
- [ ] State & match data preserved
- [ ] Scoring unchanged
- [ ] Persistence works
- [ ] Mobile layout works
- [ ] Accessibility acceptable

---

## 31. Definition of Done

### Visual
- Clean, consistent interface
- Responsive
- Live scoring visually dominant
- Simplified navigation
- Progressive disclosure for secondary functions

### Functional
- All existing features remain available
- Cricket calculations unchanged
- Persistence, authentication, sharing, spectator mode, offline behaviour work

### Technical
- Scoring engine remains authoritative
- Generated scoring bundle is not hand-edited
- Persistence layer remains isolated
- No unnecessary architecture rewrite or framework migration

### Quality
- Mobile / tablet / desktop tested
- Accessibility checked
- Regression tests completed
- Console errors resolved

---

## 32. Target End-to-End Experience

```
                    CricScore Pro
                          │
             ┌────────────┴────────────┐
             │                         │
           HOME                     ACCOUNT
             │
       ┌─────┼──────┐
       │     │      │
     Quick  Web   Recent
     Match Score Matches
       │
       ▼
     TEAMS
       │
       ▼
    PLAYERS
       │
       ▼
 MATCH SETTINGS
       │
       ▼
      TOSS
       │
       ▼
 LIVE SCORING
       │
    ┌──┼───────────┐
    │  │           │
 Scorecard       Overs
    │
    └──────── Stats
             │
             ▼
      MATCH COMPLETE
             │
      ┌──────┼──────┐
      │      │      │
   Summary Scorecard Stats
```

Architectural boundary remains:

```
         CricScore Pro UI v2
                 │
                 ▼
      UI Rendering / UX Layer
                 │
                 ▼
        Existing App Controller
            /           \
           /             \
          ▼               ▼
  Scoring Engine        Persistence
  (UNCHANGED)           (PRESERVED)
```

---

## 33. Coding-Agent Directive (use at the start of every task)

```
You are modifying the existing CricScore Pro Web application.

Repository: https://github.com/Ankojin/CricketScorer-web

This is a UI/UX modernization project called "CricScore Pro UI v2".

UNIVERSAL DIRECTIVE:

PRESERVE FUNCTIONALITY FIRST.

Do not rewrite the application.
Do not migrate frameworks unless explicitly requested.
Do not change cricket scoring rules.
Do not modify the scoring engine as part of UI work.
Do not hand-edit: public/js/scoring-engine.js

The scoring engine source of truth is: src/engine/ScoringEngine.ts

Preserve:
- Authentication & Guest mode
- Match creation, teams, players, overs, bowler limits, toss
- Live scoring (0–6, WD, NB, 1G, SWAP, WICKET, RETIRE, UNDO)
- Scorecard, Overs, Stats, Tournaments, Sharing, Spectator view
- Settings, Gully Rules, LocalStorage, Cloud sync, Offline behaviour
- Existing data structures

UI changes may modify:
- Layout, styling, navigation presentation
- Component presentation, responsive behaviour, accessibility
- Progressive disclosure, modal presentation, visual hierarchy

The new UI should be:
Clean · Simple · Mobile-first · Touch-friendly · Professional · Accessible · Responsive

Primary navigation: Home · Matches · Teams · Stats · More
Active-match navigation: Live · Scorecard · Overs · More

Quick Match flow: Teams → Players → Match Settings → Toss → Live Scoring

Prioritize the live scoring experience.
Show the most important information first.
Hide secondary actions under More or Advanced Settings.
Do not remove functionality merely because it is not visible on the primary screen.

Before changing code:
1. Inspect the existing implementation.
2. Identify existing handlers and state dependencies.
3. Identify which elements are safe to refactor.
4. Preserve existing IDs/hooks where practical.
5. Do not break event wiring.
6. Make the smallest safe architectural change.

After changing code:
1. Check the browser console.
2. Test the affected workflow.
3. Test mobile layout.
4. Verify scoring behaviour.
5. Verify persistence.
6. Report changed files, tests performed, and remaining risks.

If a requested UI change conflicts with existing functionality, preserve functionality and find a UI-only solution.
```

---

## 34. Recommended Prompt Sequence

Do **not** give the coding agent all prompts at once. Run in this order:

```
01  Analyze repository
 ↓
02  Design system
 ↓
03  Home / Match Center
 ↓
04  Quick Match wizard
 ↓
05  Toss
 ↓
06  Live Scoring          ← highest priority
 ↓
07  Wicket UI
 ↓
08  Scorecard / Overs / Stats
 ↓
09  Secondary navigation (More / Manage)
 ↓
10  Responsive pass
 ↓
11  Accessibility pass
 ↓
12  Regression testing
```

Keep the Universal Directive in every prompt.

---

## 35. Final Target Statement

The finished product should feel less like:

> “A web application containing cricket scoring features”

and more like:

> “A cricket scorer that happens to have a web interface.”

The underlying functionality (cloud/local persistence, teams, players, tournaments, live scoring, spectator sharing, scorecards, overs, statistics) remains intact.

**Preserve the functionality. Aggressively simplify the presentation.**
