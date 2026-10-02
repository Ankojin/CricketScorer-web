# CricLeague (PWA)

A high-performance, deterministic, event-sourced Progressive Web Application (PWA) built for corporate and Intune-managed browser devices. Operating 100% within the **AWS Free Tier** ($0.00 cost).

---

## 🛡️ Admin Console & System Monitoring

The application includes a strictly restricted **Admin Console** for real-time monitoring of registered users, system health, cloud synchronization, error events, and security audit trails.

### Access & Security Specification
* **Authorized Admin Account**: Strictly restricted to **`ankoji@gmail.com`**.
* **URL Routes**:
  - `https://cricleague.nrkmart.in/admin`
  - `https://cricleague.nrkmart.in/?route=admin`
  - `https://cricleague.nrkmart.in/#admin`
* **Multi-Layer Security**:
  1. **UI Layer**: The `🛡️ Admin Console` option in the top menu (`☰ Menu`) is visible **only** when signed in as `ankoji@gmail.com`.
  2. **Client Navigation Guard**: Any attempt by other accounts to navigate to `/admin` shows a red warning notice (*Admin Console is restricted to ankoji@gmail.com*) and redirects to Home.
  3. **Server-Side API Guard**: AWS Lambda middleware (`enforceAdminAuth` in `index.mjs`) checks user JWT tokens against DynamoDB and enforces `403 Forbidden` on all `/admin/*` API endpoints for non-admin accounts.

### Admin Dashboard Modules
1. 👥 **Users Directory**: Searchable list of registered users, registration dates, last login/active timestamps, and total match counts.
2. 🏥 **System Health**: Real-time database latency (ms), DynamoDB table item counts, Lambda uptime, and memory usage.
3. 🔄 **Auth & Sync Monitoring**: Total user accounts, total matches created, and active live spectator share tokens.
4. ⚠️ **Error Dashboard**: Real-time log of client-side and server-side errors and 4xx/5xx exceptions.
5. 📜 **Audit Log Viewer**: 30-day security event timeline (logins, registrations, match deletions, token revocations, admin actions).
6. ⏱ **30-Day Auto-Cleanup**: Audit logs (`docType = "AUDIT_LOG"`) and error logs (`docType = "ERROR_LOG"`) use DynamoDB `ttlSeconds = now + 30 days` for automatic zero-maintenance log cleanup.

---

## 🔐 User Authentication (Demo-Grade vs Production Path)

> **Current Authentication**:
> Uses a lightweight bcrypt hashed user validation model stored directly in the shared DynamoDB table (`CricMatches`). This allows immediate zero-cost user registration and login without requiring complex external identity providers.
> 
> **Production Upgrade Path**:
> Production hardening with **Amazon Cognito User Pools** (or OAuth2/OIDC) can be seamlessly integrated later. The frontend UI modal (`#authModal`) and local JWT session token flow (`localStorage.getItem('cric_auth_token')`) are designed so switching the backend to Amazon Cognito will require zero frontend UI changes.

---

## 🗂 Project Structure & Script Organization

- **Active Web Assets (`public/`)**:
  - `public/index.html`: Main HTML single page application shell.
  - `public/js/scoring-engine.js`: Generated browser bundle from `src/engine/ScoringEngine.ts` exposing `window.ScoringEngine`.
  - `public/js/storage.js`: Storage adapter managing LocalStorage and background AWS API Gateway sync.
  - `public/js/ui/admin.js`: Admin Console controller managing User lists, Health, Auth/Sync, Error logs, and Audit views.
  - `public/js/app.js`: Main UI controller for live scoring, team selection, series, stats, and modals.
  - `public/css/styles.css`: Dark mode mobile-first stylesheet.
  - `public/sw.js`: Network-First Service Worker for PWA offline capabilities.

---

## ⚠️ Scoring Engine - Single Source of Truth Directive

> **IMPORTANT**:
> All scoring rules, ball replay, and state recalculations are implemented in **`src/engine/ScoringEngine.ts`**.
>
> 🛑 **DO NOT HAND-EDIT `public/js/scoring-engine.js` DIRECTLY!**
> Always make changes in `src/engine/ScoringEngine.ts` and run `npm run build` to update the browser bundles.

- **Exposed Browser API (`window.ScoringEngine`)**:
  - `recalculateMatch(match)` / `recalculateMatchFromHistory(match)`
  - `getOverSummaries(match)`
  - `calculateInningsStats(balls)`
  - `calculatePartnerships(balls, match)`
  - `calculateMotm(match)`
  - `calculateForecaster(match)`
  - `calculatePointsTable(teams, matches)`
  - `isPhysicalBall(ball)`

---

## 🧪 Integration Note: Hardened Match & Series Deletion

> **Hardened Match & Series Deletion**:
> Calling `deleteMatch(id)` or `deleteTournament(id)` performs an `await fetch(DELETE)` to AWS API Gateway. On success, the item is removed from DynamoDB and a success toast notifies **`🟢 Deleted from Cloud`**. If offline or API fails, local storage cleanup executes and notifies **`🟡 Deleted locally`**.
> 
> Deleting a tournament series (`DELETE /tournaments/{id}`) triggers a server-side cascade operation in AWS Lambda (`index.mjs`), scanning and deleting all matches associated with that `tournamentId` before deleting the tournament record itself in Amazon DynamoDB.

---

## ☁️ AWS Resources & Architecture

| Resource | AWS Service | Identifier / Endpoint |
| :--- | :--- | :--- |
| **Stack Name** | AWS SAM / CloudFormation | `cricscore-pro-web` |
| **S3 Web Bucket** | Amazon S3 | `cricscore-pro-web-112232725342-us-east-1` |
| **CDN Distribution** | Amazon CloudFront | `E2FADRQRZIIFJQ` |
| **HTTP API v2** | Amazon API Gateway | `https://cricleagueapi.nrkmart.in` |
| **Database Table** | Amazon DynamoDB | `CricMatches` |
| **Lambda Function** | AWS Lambda | `CricScoreApiLambda` (Node.js 22.x) |

---

## 🌐 Public Hostnames & Domains

| Hostname | Purpose | DNS Target |
| :--- | :--- | :--- |
| `cricleague.nrkmart.in` | Main website | CloudFront distribution domain (CNAME) |
| `cricleagueapi.nrkmart.in` | Application API | API Gateway regional domain (CNAME) |

---

## 🚀 Complete Step-by-Step Deployment Commands

### 1. Build Scoring Engine & Run Tests
```powershell
npm run build
cd aws/lambda
node --test index.test.mjs
cd ../..
```

### 2. Deploy AWS Infrastructure & Backend API (AWS SAM)
Deploys updated AWS Lambda code, DynamoDB table settings, and API Gateway routes (`/admin/users`, `/admin/system-health`, `/admin/auth-sync`, `/admin/error-dashboard`, `/admin/audit-logs`, `/admin/error-log`, and `/admin/{proxy+}`):

```powershell
sam deploy --no-confirm-changeset --stack-name cricscore-pro-web --template-file aws/template.yaml --capabilities CAPABILITY_IAM --resolve-s3
```

### 3. Deploy Web Assets to Amazon S3 & Invalidate CloudFront CDN
Uploads static frontend assets (`public/`) to S3 and invalidates CloudFront cache so all web browsers instantly receive the latest Admin Console UI:

```powershell
aws s3 sync public/ s3://cricscore-pro-web-112232725342-us-east-1/ --delete
aws cloudfront create-invalidation --distribution-id E2FADRQRZIIFJQ --paths "/*"
```

---

## 🔍 Verification Commands

### Check HTTPS Certificate Status
```powershell
aws acm describe-certificate --region us-east-1 --certificate-arn arn:aws:acm:us-east-1:112232725342:certificate/ddb82548-dbd0-4675-b5f1-90a6f7aea3f8 --query 'Certificate.Status' --output text
```

### Get CloudFront & API Gateway Regional Domain Targets
```powershell
aws cloudformation describe-stacks --stack-name cricscore-pro-web --region us-east-1 --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDomainName` || OutputKey==`ApiGatewayRegionalDomainName`].[OutputKey,OutputValue]' --output table
```
