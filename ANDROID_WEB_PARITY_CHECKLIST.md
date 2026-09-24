# Android to Web Parity Checklist

Date: 2026-09-24

## Current status summary

Web parity is now strong for core scoring mechanics:
- 2nd innings player selection survival is fixed and tested
- 1D behavior parity is present
- caught and run-out fielder-driven workflows are present
- dropped-catch two-step workflow is present
- NO_BALL additional-runs panel is present
- WIDE additional-runs panel is now present
- BYE and LEG_BYE runs panel is present
- overthrow/special runs panel is present
- historical ball edit is present from Overs and Scorecard timelines

Automated tests are green after the latest parity updates.

## Parity map

### Fully aligned or near aligned

1. Scoring replay engine behavior
- Event-sourced ball history replay
- Extra-run handling for NO_BALL, WIDE, BYE, LEG_BYE
- Run-out not credited as bowler wicket
- End-over bowler reset + strike swap

2. Pending actions for scoring gates
- Striker, non-striker, bowler gating
- Caught/stumped fielder selection path
- Run-out runs + fielder path
- Dropped-catch fielder + runs path

3. Live controls
- 0,1,2,3,4,6 scoring
- 1G style single without strike rotation
- Undo
- Retire hurt

4. Over and live chips
- WIDE, NO_BALL, BYE, LEG_BYE labels
- Dropped-catch labels
- Wicket labels

### Missing or partially implemented parity

P0-P1 (high impact)

1. Full Android pending action state machine completeness
- Web now routes replacement and wicket flows through pendingAction entry points
- Web now enforces strict pendingAction behavior across toss/settings/innings-break overlays (required actions persist until resolved)
- Keeper preflow now resumes after settings save and enforces WK-only stumping completion

2. Wicket keeper selection workflow parity
- Web now enforces keeper pre-flow for STUMPED via pendingAction -> Match Settings -> WK selection
- Web now resumes keeper-dependent wicket flow after settings save and enforces STUMPED confirmation only for selected WK

3. Bowler quota logic depth
- Web now enforces quotaMaxOvers/maxOversPerBowler and quotaBowlersCount in bowler selection
- Disabled reasons are surfaced in UI and click feedback (last bowler, quota completed, quota bowlers limit)

P2 (feature depth)

4. Tournament settings parity
- Android tournament settings include powerplayOvers and richer defaults propagation
- Web now supports series-level default settings and propagation into new matches (overs, max bowler overs, quota fields, gully rules, powerplay value capture)
- Web now enforces powerplay cap against innings overs and surfaces powerplay live-state in the scoring header
- Web now supports editing tournament defaults post-creation via Edit Defaults flow
- Web innings-phase stats now use configured powerplay and innings lengths (instead of fixed 1-6/7-15/16-20 buckets)

5. Points table and NRR accuracy parity
- Web points table exists
- Web now computes points table with tie column and NRR from completed innings snapshots (for/against run rates) and sorts by PTS then NRR
- Added automated tests for NRR ordering on tied points and resilience with missing legacy innings snapshots

6. Match status parity
- Android model supports ABANDONED
- Web now supports ABANDONED lifecycle actions (abandon/resume), status-aware scoring guards, and consistent status rendering

7. Expanded wicket type parity in UI
- Android models include HANDLED_BALL and OBSTRUCTING_FIELD
- Web edit-ball modal and main wicket picker now both surface HANDLED_BALL and OBSTRUCTING_FIELD

P3 (UX and polish)

8. Match ticker and overlay hierarchy parity
- Android has strong action-first overlays, scrolling ticker, and over-completion summaries
- Web now includes a dedicated live ticker strip and stronger pending-action banner emphasis
- Web now enforces single primary action-modal visibility across toss/settings/selection/extras/wicket/run-out/over-end/edit flows to prevent overlaps

9. Scorecard detail parity
- Android scorecard format includes richer dismissal and innings metadata blocks
- Web now includes in-screen scorecard tabs (Full / Innings 1 / Innings 2) with tabbed rendering in a single flow
- Not required for current web scope (accepted as-is)

10. Share/export parity
- Android supports screenshot sharing of scorecards, teams, points table
- Web now supports scorecard and series card snapshot export/share flows (PNG capture with Web Share when available, download fallback)

11. Sync/device parity
- Android includes nearby sync and connected endpoint awareness
- Web now includes connected endpoint/network awareness and cross-device handoff via match JSON export/import backups

## UI improvement targets for web to match Android quality

1. Action-priority overlays
- Ensure only one primary modal path is active
- Prioritize toss/settings, innings break, over summary, then wicket flows

2. Better hierarchy in live screen
- Stronger inning header, ticker strip, and pending-action badges
- Larger tap targets for extras/wicket in compact screens

3. Dense scorecard readability
- Consistent typography scale for player rows, dismissal text, extras summary, total block

4. Tournament pages
- Add polished tabbed experience for Teams, Matches, Table, Stats with consistent cards and filters

## Recommended delivery plan

Sprint A
- Finish strict pendingAction state machine parity
- Complete wicket keeper action flow and full bowler quota policy

Sprint B
- Tournament settings expansion (powerplay and advanced rules)
- NRR parity and points table correctness hardening

Sprint C
- UI polish pass (ticker, overlays, scorecard typography)
- Share snapshot/export features
- Additional parity tests for wickets and dialog paths

## Minimum additional automated tests to add next

1. ✅ WIDE additional runs options 0-4 -> expected team totals and no legal ball increment
2. ✅ Run-out two-step path with striker/non-striker variants
3. ✅ Stumped dismissal linkage coverage added (bowler/fielder/keeper stats); caught linkage already covered
