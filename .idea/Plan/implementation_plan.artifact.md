# Implementation Plan: CricScore Pro Web Project (`D:/CricketScorer-web`)

Create a standalone, production-ready Serverless Web Application project at `D:/CricketScorer-web` for Intune-managed browser users, fully mirroring the Android app's event-sourced domain logic and rules while operating strictly within AWS Free Tier limits.

---

## Proposed Project Structure (`D:/CricketScorer-web`)

### Directory Layout
- **`package.json`**: Node.js project manifest & build scripts.
- **`tsconfig.json`**: TypeScript compiler configuration.
- **`src/models/types.ts`**: Complete TypeScript domain models (`Match`, `Team`, `Player`, `Ball`, `GullyRules`, `InningsSummary`, `WicketRecord`).
- **`src/engine/ScoringEngine.ts`**: TypeScript port of Kotlin `ScoringEngine` (event-sourced recalculation, `lastManStanding`, `noExtraRunsForWidesNoBalls`, `unequalTeams`, strike rotation, all-out calculations).
- **`aws/template.yaml`**: AWS SAM Serverless infrastructure template for S3, CloudFront OAC, API Gateway HTTP API v2, Lambda, and DynamoDB single table.
- **`aws/lambda/index.mjs`**: AWS Lambda backend handler for match CRUD & ball event processing using AWS SDK v3.
- **`public/index.html`**: Mobile-responsive PWA web interface for Intune browser users.
- **`public/app.js`**: PWA client-side UI controller.
- **`README.md`**: Complete setup, local testing, and zero-cost AWS deployment guide.

---

## Verification Plan

### Automated & Static Verification
1. **Compilation Check**: Verify TypeScript types and SAM template validity.
2. **Scoring Parity**: Verify `ScoringEngine.ts` output against Kotlin `ScoringEngine.kt` rules.

### Manual Verification
1. **AWS Infrastructure**: Deploy via SAM or Serverless CLI; test REST endpoints.
2. **Browser Experience**: Load PWA in mobile & desktop browser viewport; simulate live scoring.
