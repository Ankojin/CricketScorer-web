# CricScore Pro Web (AWS Serverless PWA)

A high-performance, deterministic, event-sourced Cricket Scorer Progressive Web Application (PWA) designed for Intune-managed browser users and corporate devices where native APK installation is restricted.

---

## 🏗 Architecture Overview

```
[ Client Browser (PWA) ] 
       │
       ├──► (Static Assets) ──► AWS CloudFront (HTTPS / OAC) ──► AWS S3 Bucket
       │
       └──► (REST API Calls) ─► AWS API Gateway (HTTP API v2) ──► AWS Lambda (Node.js 20) ──► DynamoDB Table
```

### Free Tier Cost Breakdown ($0.00 Guaranteed)

| Service | Always Free / Free Tier Allowance | Project Usage Target |
| :--- | :--- | :--- |
| **AWS CloudFront** | 1 TB Data Transfer / Month (Always Free) | < 1 GB / Month |
| **AWS S3** | 5 GB Storage, 20,000 GET requests | < 50 MB Storage |
| **AWS API Gateway** | 1,000,000 HTTP API Requests / Month (12 Months) | ~50,000 Requests |
| **AWS Lambda** | 1,000,000 Requests & 3.2M sec compute / Month (Always Free) | ~50,000 Executions |
| **AWS DynamoDB** | 25 GB Storage & 25 WCU / 25 RCU (Always Free) | < 1 GB Storage, 25 WCU/RCU |

---

## ⚡ Domain & Engine Rules Parity

This Web App directly mirrors the Android offline application (`D:/CricketScorer-new`) rules:

- **Event-Sourced Recalculation**: Complete match state (runs, wickets, overs, CRR, RRR, target) is recalculated deterministically from `ballHistory`.
- **Legal Balls**: Wides, No-Balls, and Retired Hurt are **NOT** physical legal over balls (`isPhysicalBall = false`).
- **Retired Hurt**: Does **NOT** increment total wickets count and does **NOT** increment physical balls count.
- **Team Visual Identity**: Teams support optional `colorHex` badges displayed dynamically across scorecards.
- **First-to-Second Innings Transition**: Automatically computes target (`Innings 1 Runs + 1`) and switches batting/bowling sides.

---

## 🚀 Deployment Guide (AWS SAM CLI)

### Step 1: Build & Package Infrastructure

Ensure AWS SAM CLI and AWS CLI are installed and configured (`aws configure`).

```bash
cd D:/CricketScorer-web
sam build -t aws/template.yaml
```

### Step 2: Deploy to AWS

```bash
sam deploy --guided \
  --stack-name cricscore-pro-web \
  --region us-east-1
```

After deployment, SAM will output:
- `WebUrl`: The HTTPS CloudFront distribution URL for browser access.
- `ApiUrl`: The API Gateway HTTP API endpoint.
- `S3BucketName`: The private S3 hosting bucket.

### Step 3: Upload Static Web UI to S3

```bash
aws s3 sync public/ s3://YOUR_S3_BUCKET_NAME/ --delete
```

---

## 🔔 AWS Budget Alerts Setup ($1 and $5 Safeguards)

To guarantee that your AWS account never incurs unexpected costs, create AWS Budget alerts with thresholds at **$1.00** and **$5.00**.

### AWS Billing Console Setup

1. Open **AWS Billing Console → Budgets**.
2. Click **Create budget**.
3. Select **Cost budget - Recommended**.
4. Set Budget Name: `CricScorePro-FreeTier-Guard`.
5. Set Target Amount: `$1.00`.
6. Configure Alert 1: **100% of budgeted amount ($1.00)** -> Add your notification email.
7. Configure Alert 2: **500% of budgeted amount ($5.00)** -> Add your notification email.
8. Click **Create budget**.

### AWS CLI Setup

Create `budget.json`:
```json
{
  "BudgetName": "CricScorePro-FreeTier-Guard",
  "BudgetLimit": { "Amount": "1.00", "Unit": "USD" },
  "CostTypes": {
    "IncludeTax": true,
    "IncludeSubscription": true,
    "UseBlended": false,
    "IncludeRefund": false,
    "IncludeCredit": false,
    "IncludeUpfront": true,
    "IncludeRecurring": true,
    "IncludeOtherSubscription": true,
    "IncludeSupport": true,
    "IncludeDiscount": true,
    "UseAmortized": false
  },
  "TimeUnit": "MONTHLY",
  "BudgetType": "COST"
}
```

Create `notifications.json`:
```json
[
  {
    "Notification": {
      "NotificationType": "ACTUAL",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 100,
      "ThresholdType": "PERCENTAGE"
    },
    "Subscribers": [
      { "SubscriptionType": "EMAIL", "Address": "your-email@example.com" }
    ]
  },
  {
    "Notification": {
      "NotificationType": "ACTUAL",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 500,
      "ThresholdType": "PERCENTAGE"
    },
    "Subscribers": [
      { "SubscriptionType": "EMAIL", "Address": "your-email@example.com" }
    ]
  }
]
```

Run AWS CLI command:
```bash
aws budgets create-budget \
    --account-id YOUR_AWS_ACCOUNT_ID \
    --budget file://budget.json \
    --notifications-with-subscribers file://notifications.json
```

---

## 🧪 Local Testing & Development

Run local HTTP server to test the PWA:

```bash
npx http-server public -p 8080
```

Open `http://localhost:8080` in Chrome, Edge, or Safari. Test live scoring, team creation with `colorHex`, extra runs, wickets, and offline LocalStorage caching.
