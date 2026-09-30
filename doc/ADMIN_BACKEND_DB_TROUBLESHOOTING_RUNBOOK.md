# CricLeague Admin Runbook - DB and Backend Troubleshooting

Purpose: Verify cross-device data sync issues for a signed-in user from DynamoDB and backend level.

Date: 2026-09-30

## 1. Prerequisites
- AWS CLI configured with access to the production account.
- Region set to us-east-1.
- Table name: CricMatches.
- API domain: https://cricleagueapi.nrkmart.in

Optional convenience (PowerShell):
- aws configure set default.region us-east-1

## 2. Set Variables
PowerShell:

$email = "ankoji@gmail.com".ToLower()
$table = "CricMatches"
$api = "https://cricleagueapi.nrkmart.in"

## 3. Compute userId from email (same logic as backend)
PowerShell using Node:

$uid = node -e "const email=process.argv[1].toLowerCase();let hash=0;for(let i=0;i<email.length;i++){hash=((hash<<5)-hash)+email.charCodeAt(i);hash|=0;}console.log('user_h_'+Math.abs(hash).toString(36));" $email
$uid

Expected format: user_h_xxxxx

## 4. Verify user account record exists
Command:

aws --no-cli-pager dynamodb scan --table-name $table --filter-expression "docType = :u AND payload.email = :e" --expression-attribute-values '{":u":{"S":"USER"},":e":{"S":"ankoji@gmail.com"}}' --projection-expression "matchId, payload.email, payload.createdAt" --output json

Interpretation:
- Count 1: user exists.
- Count 0: user not found in this table/account/region.

## 5. Check user-owned data counts by type
MATCH count:

aws --no-cli-pager dynamodb scan --table-name $table --filter-expression "(ownerUserId = :uid OR payload.ownerUserId = :uid) AND docType = :d" --expression-attribute-values "{\":uid\":{\"S\":\"$uid\"},\":d\":{\"S\":\"MATCH\"}}" --select COUNT --output json

TOURNAMENT count:

aws --no-cli-pager dynamodb scan --table-name $table --filter-expression "(ownerUserId = :uid OR payload.ownerUserId = :uid) AND docType = :d" --expression-attribute-values "{\":uid\":{\"S\":\"$uid\"},\":d\":{\"S\":\"TOURNAMENT\"}}" --select COUNT --output json

PLAYER count:

aws --no-cli-pager dynamodb scan --table-name $table --filter-expression "(ownerUserId = :uid OR payload.ownerUserId = :uid) AND docType = :d" --expression-attribute-values "{\":uid\":{\"S\":\"$uid\"},\":d\":{\"S\":\"PLAYER\"}}" --select COUNT --output json

Interpretation:
- If MATCH and TOURNAMENT are 0, cross-device history cannot appear.

## 6. List recent docs for this user
Command:

aws --no-cli-pager dynamodb scan --table-name $table --filter-expression "ownerUserId = :uid OR payload.ownerUserId = :uid" --expression-attribute-values "{\":uid\":{\"S\":\"$uid\"}}" --projection-expression "matchId, docType, ownerUserId, updatedAt" --output table

## 7. Global table health snapshot
Table metadata:

aws --no-cli-pager dynamodb describe-table --table-name $table --query "Table.{TableName:TableName,CreationDateTime:CreationDateTime,ItemCount:ItemCount,TableStatus:TableStatus}" --output table

DocType distribution:

$json = aws --no-cli-pager dynamodb scan --table-name $table --projection-expression "docType" --output json | ConvertFrom-Json
$types = @(); foreach ($i in $json.Items) { if ($i.docType.S) { $types += $i.docType.S } else { $types += 'LEGACY_OR_UNTYPED' } }
$types | Group-Object | Sort-Object Count -Descending | ForEach-Object { "{0}: {1}" -f $_.Name, $_.Count }

## 8. API-level verification for the same user
1) Login and capture token:

$body = @{ email = "ankoji@gmail.com"; password = "<YOUR_PASSWORD>" } | ConvertTo-Json
$login = Invoke-RestMethod -Method POST -Uri "$api/auth/login" -ContentType "application/json" -Body $body
$token = $login.token

2) List matches via API:

$headers = @{ Authorization = "Bearer $token" }
Invoke-RestMethod -Method GET -Uri "$api/matches" -Headers $headers

Interpretation:
- API empty + DB MATCH count 0 confirms data is absent in cloud.
- API non-empty but UI empty suggests client-side rendering/filter issue.

## 9. CloudWatch logs check for backend errors
Get Lambda name from stack:

aws --no-cli-pager cloudformation describe-stack-resources --stack-name cricscore-pro-web --query "StackResources[?LogicalResourceId=='CricScoreApiLambda'].PhysicalResourceId | [0]" --output text

Use that function name in logs query:

$fn = "<FUNCTION_NAME_FROM_PREV_COMMAND>"
aws --no-cli-pager logs tail "/aws/lambda/$fn" --since 2h --format short

Filter possible auth/sync failures:
- Look for 401, 403, Invalid email or password, Unauthorized, Access denied.
- Look for write failures around POST /matches and PUT /matches/{id}.

## 10. Root-cause checklist for cross-device mismatch
- Same exact email used on both devices.
- Both devices signed in (not guest mode).
- Device A actually performed cloud save/sync after match creation.
- Device B has network access and valid token.
- DB contains MATCH/TOURNAMENT for owner userId.
- API GET /matches returns data for token.

## 11. Quick conclusion mapping
- USER exists, MATCH/TOURNAMENT = 0:
  Data never synced or was removed; cross-device list will be empty.
- USER exists, MATCH/TOURNAMENT > 0, API empty:
  Token/account mismatch or backend auth/ownership bug.
- API has data, UI empty:
  Frontend filtering/rendering issue on that device.

## 12. Safe recovery path
1. On source device, sign in and export backups (if local data visible).
2. Re-import backups while signed in.
3. Trigger sync and re-run section 5 counts.
4. Confirm API GET /matches returns entries.
5. Re-login on second device and re-check list.
