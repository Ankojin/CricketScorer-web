# AWS Cost Guardrails (Free-Tier Friendly Testing)

This project includes a lightweight budget and cost-check workflow to keep testing spend near zero.

## What is included

- `budget.json` defines a monthly budget named `CricScorePro-FreeTier-Guard` with a default limit of 1.00 USD.
- `notifications.json` defines budget alerts at:
  - 100% (about 1 USD)
  - 500% (about 5 USD)
- `scripts/aws-cost-guardrails.ps1` can:
  - Create or update the budget
  - Ensure notifications exist
  - Print month-to-date service-wise spend
  - Exit with a failure code when cost is above threshold

## One-command setup

Run:

npm run cost:guardrails

This will create/update budget guardrails and print this month spend.

## Daily/weekly cost check

Run:

npm run cost:check

This prints month-to-date cost by service and total.

## Optional threshold override

You can run the script directly with a custom threshold:

powershell -ExecutionPolicy Bypass -File scripts/aws-cost-guardrails.ps1 -Report -MaxMonthlyUsd 2.5

## Free-tier safety notes

- Keep low traffic on Lambda, API Gateway, and DynamoDB.
- Avoid unnecessary CloudFront invalidations.
- Keep payload/log volume small to reduce CloudWatch ingestion costs.
- Reuse existing resources instead of creating many temporary stacks.
