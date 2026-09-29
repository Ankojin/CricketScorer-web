# CricLeague (PWA)

A high-performance, deterministic, event-sourced Progressive Web Application (PWA) built for corporate and Intune-managed browser devices. Operating 100% within the **AWS Free Tier** ($0.00 cost).

---

## 🔐 User Authentication (Demo-Grade vs Production Path)

> **Current Demo-Grade Authentication**:
> The current authentication mechanism (`/auth/register`, `/auth/login` in `aws/lambda/index.mjs`) uses a lightweight hashed user validation model stored directly in the shared DynamoDB table (`CricMatches`). This allows immediate zero-cost user registration and login without requiring complex external identity providers.
> 
> **Production Upgrade Path**:
> Production hardening with **Amazon Cognito User Pools** (or OAuth2/OIDC) can be seamlessly integrated later. The frontend UI modal (`#authModal`) and local JWT session token flow (`localStorage.getItem('cric_auth_token')`) are designed so switching the backend to Amazon Cognito will require zero frontend UI changes.

---

## 🗂 Project Structure & Script Organization

- **Active Web Assets (`public/`)**:
  - `public/index.html`: Main HTML single page application shell.
  - `public/js/scoring-engine.js`: Generated browser bundle from `src/engine/ScoringEngine.ts` exposing `window.ScoringEngine`.
  - `public/js/storage.js`: Storage adapter managing LocalStorage and background AWS API Gateway sync.
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
| **HTTP API v2** | Amazon API Gateway | `https://zqa91yrypg.execute-api.us-east-1.amazonaws.com` |
| **Database Table** | Amazon DynamoDB | `CricMatches` |
| **Lambda Function** | AWS Lambda | `CricScoreApiLambda` (Node.js 22.x) |

---

## 🚀 Deployment Commands

## 🌐 Public domain: `cricleague.nrkmart.in`

The application is configured to use these public hostnames:

| Hostname | Purpose | DNS target |
| :--- | :--- | :--- |
| `cricleague.nrkmart.in` | Main website | CloudFront distribution domain (CNAME) |
| `cricleagueapi.nrkmart.in` | Application API | API Gateway regional domain (CNAME) |

Before deploying, add this ACM DNS-validation record in the Spaceship DNS zone. It is required before AWS can issue the HTTPS certificate:

| Type | Host | Value |
| :--- | :--- | :--- |
| `CNAME` | `_da902f14652543ad1d90358c5788c963` | `_6bee345353698669ebec04cbaa8706ad.wzccmgtwzk.acm-validations.aws` |

Wait until the certificate status is `ISSUED`:

```powershell
aws acm describe-certificate --region us-east-1 --certificate-arn arn:aws:acm:us-east-1:112232725342:certificate/ddb82548-dbd0-4675-b5f1-90a6f7aea3f8 --query 'Certificate.Status' --output text
```

After it is issued, deploy the stack. The outputs provide the CloudFront and API Gateway values needed for the remaining DNS records:

```powershell
sam deploy --no-confirm-changeset --stack-name cricscore-pro-web --template-file aws/template.yaml --capabilities CAPABILITY_IAM --resolve-s3
aws cloudformation describe-stacks --stack-name cricscore-pro-web --region us-east-1 --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDomainName` || OutputKey==`ApiGatewayRegionalDomainName`].[OutputKey,OutputValue]' --output table
```

Add `cricleague` as a CNAME using the CloudFront value. Add `cricleagueapi` as a CNAME using the API Gateway value.

### 1. Deploy Infrastructure with AWS SAM
```powershell
sam deploy --no-confirm-changeset --stack-name cricscore-pro-web --template-file aws/template.yaml --capabilities CAPABILITY_IAM --resolve-s3
```

### 2. Sync Static Web Files to S3 & Invalidate CloudFront
```powershell
aws s3 sync public/ s3://cricscore-pro-web-112232725342-us-east-1/ --delete
aws s3 cp doc/privacy-policy.html s3://cricscore-pro-web-112232725342-us-east-1/privacy-policy.html --content-type text/html
aws cloudfront create-invalidation --distribution-id E2FADRQRZIIFJQ --paths "/*"
```
