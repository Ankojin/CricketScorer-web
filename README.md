# CricScore Pro Web (PWA)

A high-performance, deterministic, event-sourced Progressive Web Application (PWA) built for corporate and Intune-managed browser devices. Operating 100% within the **AWS Free Tier** ($0.00 cost).

---

## 🗂 Project Structure & Script Organization

- **Active Web Assets (`public/`)**:
  - `public/index.html`: Main HTML single page application shell.
  - `public/js/scoring-engine.js`: Pure JavaScript event-sourced scoring engine exposing `window.ScoringEngine`.
  - `public/js/storage.js`: Storage adapter managing LocalStorage and background AWS API Gateway sync.
  - `public/js/app.js`: Main UI controller for live scoring, team selection, series, stats, and modals.
  - `public/css/styles.css`: Dark mode mobile-first stylesheet.
  - `public/sw.js`: Network-First Service Worker for PWA offline capabilities.

> **Note on Script Cleaning**: The legacy file `public/app.js` was removed to eliminate duplicate script loading and confusion with the active production file `public/js/app.js`. `public/index.html` exclusively loads `public/js/scoring-engine.js`, `public/js/storage.js`, and `public/js/app.js` in exact dependency order.

---

## ⚙️ Scoring Engine Single Source of Truth

- **TypeScript Engine (`src/engine/ScoringEngine.ts`)**:
  - Single source of truth for all domain scoring rules, ball replay, and state recalculation.
  - Mirrors the Android `ScoringEngine.kt` Kotlin logic.
  - Exposes `window.ScoringEngine` browser API compatible with `app.js` and `storage.js`:
    - `ScoringEngine.recalculateMatch(match)`
    - `ScoringEngine.getOverSummaries(match)`
    - `ScoringEngine.calculateInningsStats(balls)`
    - `ScoringEngine.calculatePartnerships(balls, match)`
    - `ScoringEngine.calculateMotm(match)`
    - `ScoringEngine.calculateForecaster(match)`
    - `ScoringEngine.calculatePointsTable(teams, matches)`

---

## 🧪 Integration Note: Tournament Series Deletion

> **Hardened Cascade Deletion**:
> Deleting a tournament series (`DELETE /tournaments/{id}`) triggers a server-side cascade operation in AWS Lambda (`index.mjs`), scanning and deleting all matches associated with that `tournamentId` before deleting the tournament record itself in Amazon DynamoDB (`CricMatches` table).
> 
> On the client (`storage.js`), calling `await window.CricStorage.deleteTournament(id)` performs the server HTTP DELETE request, falls back gracefully with a warning toast (`🟡 Series deleted locally`) if offline, and executes local cascade cleanup removing both the series and all associated matches from `localStorage`.

---

## 🚀 Deployment Commands

Sync static web files to AWS S3 & invalidate CloudFront:

```powershell
aws s3 sync public/ s3://cricscore-pro-web-112232725342-us-east-1/ --delete
aws cloudfront create-invalidation --distribution-id E2FADRQRZIIFJQ --paths "/*"
```
