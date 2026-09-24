# CricScore Pro Web - Architecture & Testing Documentation

A high-performance, deterministic, event-sourced Progressive Web Application (PWA) built for corporate and Intune-managed browser devices. Operating 100% within the **AWS Free Tier** ($0.00 cost).

---

## 🏗 Architecture & Cloud Sync Overview

```
[ Browser / Intune PWA Client ]
        │
        ├──► (Optimistic Local Write) ──► localStorage (Offline First)
        │
        └──► (Background Cloud Sync) ─► API Gateway (HTTP API v2) ──► Lambda (Node.js 20) ──► DynamoDB Table
```

### Cloud Sync Readiness & Offline Resilience
- **Offline First**: Writes immediately to `localStorage` for 0ms UI latency.
- **Background Sync**: Asynchronously syncs payload to AWS Lambda (`PUT /matches/{id}`) and DynamoDB.
- **Toast Alerts**: Non-blocking toast notifications alert the user of sync status (`🟢 Synced to AWS` / `🟡 Saved Locally`).
- **Conflict Resolution**: Uses **Last-Updated-Wins** strategy based on ISO `updatedAt` timestamps.
- **Multi-Tab Sync**: Listens to browser `storage` events so changes in one tab instantly update all open browser tabs.

---

## 🧪 Verification & Persistence Testing Steps

Follow these exact steps to verify that data survives refreshes, browser restarts, and offline scenarios:

### Test 1: Page Refresh Survival
1. Open the app on `https://dzi2g91hixjsk.cloudfront.net/`.
2. Score 3 balls (e.g. `4`, `1`, `6`). Scorecard should show `11/0 (0.3 Ov)`.
3. Press `F5` or click Refresh on the browser.
4. **Expected Result**: Scorecard remains `11/0 (0.3 Ov)`. Ball history chips, active batters, bowler, and run rates are 100% preserved.

### Test 2: Multi-Tab Synchronization
1. Open `https://dzi2g91hixjsk.cloudfront.net/` in two side-by-side browser tabs.
2. Score `WD` in Tab 1.
3. **Expected Result**: Tab 2 automatically updates score and ball chips in real-time via `storage` event sync without manual page refresh.

### Test 3: Browser Restart Survival
1. Close all browser windows/tabs completely.
2. Re-open browser and visit `https://dzi2g91hixjsk.cloudfront.net/`.
3. **Expected Result**: Active match, teams, global player roster, and tournament series are restored from DynamoDB / local storage.

---

## ⚾ Phase-1 Visual & UX Parity Features

- **End-of-Over Summary Popup**: Modal appears automatically when an over completes (`totalBalls % 6 === 0`), displaying runs scored in over, wickets taken, and bowler figures (`Charlie: 1.0 - 0 - 6 - 1`).
- **Stronger Colored Ball Chips**:
  - `4`: Bright Green (`#10b981`)
  - `6`: Bright Cyan (`#06b6d4`)
  - `W`: Bright Red (`#ef4444`)
  - `WD`/`NB`/`1G`/`🔀`: Amber (`#f59e0b`)
- **Gully Crix Style Bowler Selection**: Displays list of bowlers with bowling stats and disables/greys out the bowler who bowled the previous over (`(Last Bowler)`).
- **Match Completion Summary**: Displays winner banner and margin when match status becomes `COMPLETED` (e.g. `🎉 Rockets won by 4 wickets`).

---

## ☁️ AWS Provisioned Infrastructure & Resources

| Resource | AWS Service | Resource Name / ID |
| :--- | :--- | :--- |
| **Database** | Amazon DynamoDB | `CricMatches` (On-Demand / Pay-per-request) |
| **S3 Bucket** | Amazon S3 | `cricscore-pro-web-112232725342-us-east-1` |
| **CDN Distribution** | Amazon CloudFront | `E2FADRQRZIIFJQ` (OAC Secured) |
| **API Gateway** | HTTP API v2 | `CricScoreHttpApi` (`https://zqa91yrypg.execute-api.us-east-1.amazonaws.com`) |
| **Backend Compute** | AWS Lambda | `CricScoreApiLambda` (Node.js 20.x) |
| **CloudFormation Stack**| AWS SAM | `cricscore-pro-web` |

---

## 🚀 AWS SAM Infrastructure & Web Deployment Commands

1. **Deploy / Update SAM Backend Infrastructure**:

```powershell
sam deploy --no-confirm-changeset --stack-name cricscore-pro-web --template-file aws/template.yaml --capabilities CAPABILITY_IAM --resolve-s3
```

2. **Sync Frontend Static Web Assets to Amazon S3**:

```powershell
aws s3 sync public/ s3://cricscore-pro-web-112232725342-us-east-1/ --delete
```

3. **Invalidate CloudFront Cache for Instant CDN Updates**:

```powershell
aws cloudfront create-invalidation --distribution-id E2FADRQRZIIFJQ --paths "/*"
```
