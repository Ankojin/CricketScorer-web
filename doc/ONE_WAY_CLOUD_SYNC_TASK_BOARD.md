# CricLeague One-Way Cloud Sync Task Board

## Objective
Deliver a safe one-way cloud architecture:
- Android App -> Cloud writes
- Cloud -> Android/Web reads
- Web scoring data is read-only
- No data mismatch, no duplicate records, no cross-account contamination

## Delivery Model
- P0 = Blocker safety items (must complete first)
- P1 = Core platform behavior
- P2 = Hardening and scale readiness

---

## P0 - Data Integrity and Ownership Safety

### P0-1 Backend: Owner-scoped write enforcement
**Owner**: Backend

**Task**:
- Reject match upserts when `ownerUserId` is missing or does not match authenticated user.
- Reject updates to records not owned by the caller.

**Acceptance Criteria**:
- Non-owner write attempts return `403`.
- Owner writes continue to succeed.
- Existing owner-scoped reads remain unchanged.

### P0-2 Backend: Deterministic revision control
**Owner**: Backend

**Task**:
- Add `revision` to match payload contract.
- Apply conditional write: accept only if incoming revision is newer than stored revision.
- Return explicit reject reason on stale update.

**Acceptance Criteria**:
- Replayed stale updates do not overwrite newer cloud state.
- No duplicate records for same `matchId`.
- API response includes accepted/rejected status and server revision.

### P0-3 Android: Account-safe push filter
**Owner**: Android

**Task**:
- Before push, include only local matches safe for current cloud account.
- Skip unknown-owner or foreign-owner records.

**Acceptance Criteria**:
- Sync summary shows `skipped_owner_mismatch` count.
- Logging in with account B never uploads account A local matches.

### P0-4 Web: Spectator token hard lock
**Owner**: Web

**Task**:
- If `st` token exists in URL, force read-only mode always (regardless of sign-in status).

**Acceptance Criteria**:
- Any spectator URL cannot perform score updates.
- UI edit controls stay disabled in all spectator-link scenarios.

---

## P1 - Core One-Way Sync Behavior

### P1-1 Android: Push -> Queue -> Pull reconciliation pipeline
**Owner**: Android

**Task**:
- Sync order:
  1. Push eligible local matches
  2. Process pending queue
  3. Pull cloud snapshot
  4. Reconcile local DB to cloud truth

**Acceptance Criteria**:
- Post-sync local state equals cloud for synced matches.
- Retry behavior is idempotent and stable.

### P1-2 Android: Existing data migration classifier
**Owner**: Android

**Task**:
- Add one-time classifier for existing local matches:
  - safe_upload
  - owner_unknown
  - owner_mismatch

**Acceptance Criteria**:
- Migration report shown once per account.
- No silent cross-account uploads.

### P1-3 Web: Read-only scoring data model
**Owner**: Web

**Task**:
- Disable cloud score mutation calls from web for match scoring.
- Keep web as cloud consumer for match state.

**Acceptance Criteria**:
- Web can view latest synced match state.
- Web does not perform match score writes.

### P1-4 Per-account local partitioning
**Owner**: Android + Web

**Task**:
- Namespace local caches by account identity.
- Prevent mixed datasets on shared devices.

**Acceptance Criteria**:
- Switching accounts does not expose prior account match lists.
- Local cache remains isolated by account.

---

## P2 - Hardening and Operability

### P2-1 Backend: Sync telemetry and audit
**Owner**: Backend

**Task**:
- Log metrics/events for:
  - stale revision rejects
  - owner mismatch rejects
  - duplicate suppression
  - abnormal sync frequency

**Acceptance Criteria**:
- Dashboard/queries can explain sync decisions for a match.

### P2-2 Abuse controls
**Owner**: Backend

**Task**:
- Add rate limits and throttling for auth and high-frequency sync routes.

**Acceptance Criteria**:
- Brute-force and replay-like patterns are limited without impacting normal users.

### P2-3 UX confidence signals
**Owner**: Android + Web

**Task**:
- Display explicit sync mode and account ownership status.
- Show result summaries: uploaded, imported, skipped, conflicts.

**Acceptance Criteria**:
- User can understand what synced and what was skipped.

---

## Regression Gate (Release Blockers)

Release is blocked unless all pass:
1. Same match shows consistent score state on Android and Web after sync.
2. Repeated sync operations do not create duplicates.
3. Cross-account sign-in on one device does not leak prior account data.
4. Spectator links cannot mutate scoring under any login state.
5. Existing cloud matches remain accessible after revision rollout.

---

## Suggested Implementation Order
1. P0-1, P0-2 (backend safety contract)
2. P0-3 (android push guard)
3. P0-4 (web spectator hard lock)
4. P1-1, P1-2 (android pipeline + migration)
5. P1-3, P1-4 (web read-only + local partition)
6. P2 hardening items

---

## Definition of Done
- One-way writer model enforced: Android writes, Web reads.
- Cloud state is authoritative and deterministic.
- Existing matches are supported with safe migration.
- No mismatch/duplication in cross-platform validation tests.
