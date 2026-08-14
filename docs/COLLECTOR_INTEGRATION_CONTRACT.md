# Person 2 — Collector & Evidence Verification Integration Contract

**Owner**: Person 2 (Nipun)  
**Target Consumers**: Person 1 (Manvil - Resident Module) & Person 3 (Harsh - Community/Municipality Module)  
**Date**: August 2026  
**Status**: COMPLETE & AUDITED  

---

## 1. Overview & Module Responsibilities

This document defines the official API, database, and workflow integration contract for the **Collector & Evidence Verification Module** developed by Person 2.

### What Person 2 Owns
- Collector Dashboard & Batch Management UI
- Collector State Machine (`PENDING` → `ASSIGNED` → `PICKUP_EVIDENCE_SUBMITTED` → `VEHICLE_EVIDENCE_SUBMITTED` → `VERIFICATION_IN_PROGRESS` → `VERIFIED` / `NEEDS_REVIEW` / `REJECTED`)
- Collector Pickup Evidence Upload (`COLLECTOR_AFTER`) with Camera Base64 & GPS capture
- Collection Batches & Batch Vehicle Evidence Upload (`VEHICLE`)
- Hard-Evidence Verification Engine (Haversine GPS proximity, timestamp ordering, state machine checks)
- Google Gemini 2.5 Multimodal AI Advisory Analysis (Server-Side)
- Manual Review Queue (`NEEDS_REVIEW`) & Review Detail Workflows
- Collector Performance & Operational Metrics

### What Person 2 Does NOT Own
- Resident Dashboard, Request Submission UI & Onboarding (Person 1)
- Resident Before-Collection Evidence (`RESIDENT_BEFORE`) capture UI (Person 1)
- Resident Reward Transactions & Education (Person 1)
- Community Dashboards, Scores & Challenges (Person 3)
- Municipality Issue Management & Hotspot Analytics (Person 3)

---

## 2. Collection Request Creation Contract (For Person 1)

When a resident submits a new collection request via Person 1's API (`POST /api/collection-requests`), the database record in `collection_requests` MUST populate the following schema:

### Database Record (`collection_requests` Table)
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
resident_id UUID NOT NULL REFERENCES users(id),
community_id UUID NOT NULL REFERENCES communities(id),
collector_id UUID REFERENCES users(id), -- Populated upon assignment
collection_batch_id UUID REFERENCES collection_batches(id), -- Populated upon batching
status collection_status NOT NULL DEFAULT 'PENDING',
requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
completed_at TIMESTAMPTZ -- Set upon reaching VERIFIED status
```

---

## 3. Resident Evidence Contract (`RESIDENT_BEFORE`)

For the Verification Engine to achieve automatic `VERIFIED` status, Person 1 MUST insert a `RESIDENT_BEFORE` record into the `evidence` table when a resident submits a request:

### Database Record (`evidence` Table for Resident)
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
collection_request_id UUID NOT NULL REFERENCES collection_requests(id),
collection_batch_id UUID NULL,
evidence_type evidence_type NOT NULL, -- 'RESIDENT_BEFORE'
image_url TEXT NOT NULL,
uploaded_by UUID NOT NULL REFERENCES users(id), -- resident user_id
uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
verification_status verification_status NOT NULL DEFAULT 'pending',
latitude DOUBLE PRECISION,
longitude DOUBLE PRECISION,
captured_at TIMESTAMPTZ
```

> [!IMPORTANT]
> **Verification Engine Rule**:
> If `RESIDENT_BEFORE` evidence is missing when verification runs, the request **cannot** achieve automatic `VERIFIED` status and will route to `NEEDS_REVIEW` for manual administrative review.

---

## 4. Multi-Factor Evidence Dependency Matrix

The Person 2 Verification Engine evaluates **three distinct evidence artifacts**:

| Evidence Type | Provider | Target Entity | Mandatory for `VERIFIED`? |
|---|---|---|---|
| `RESIDENT_BEFORE` | Person 1 (Resident) | `collection_request_id` | Yes (Missing → routes to `NEEDS_REVIEW`) |
| `COLLECTOR_AFTER` | Person 2 (Collector) | `collection_request_id` | Yes (Missing → `REJECTED`) |
| `VEHICLE` | Person 2 (Collector) | `collection_batch_id` | Yes (Missing → routes to `NEEDS_REVIEW`) |

---

## 5. Person 2 API Endpoints for Consumption

### 5.1 List Collection Requests
`GET /api/collection-requests?status={STATUS}&communityId={UUID}&limit=20&page=1`
- **Authorization**: Authenticated user (`collector`, `resident`, `municipality`).
- **Response**: `ApiResponse<CollectionRequestDTO[]>`

### 5.2 Get Collection Request Detail
`GET /api/collection-requests/:id`
- **Authorization**: Authenticated user.
- **Response**: `ApiResponse<CollectionRequestDTO>`

### 5.3 Submit Collector Pickup Evidence
`POST /api/evidence`
- **Authorization**: Authenticated collector assigned to request.
- **Request Body**:
```json
{
  "collectionRequestId": "UUID",
  "evidenceType": "COLLECTOR_AFTER",
  "imageBase64": "data:image/jpeg;base64,...",
  "latitude": 12.9716,
  "longitude": 77.5946,
  "capturedAt": "2026-08-14T22:00:00.000Z"
}
```
- **Response**: `ApiResponse<EvidenceDTO>`

### 5.4 Trigger Automated Verification
`POST /api/verification/:requestId`
- **Authorization**: Authenticated collector assigned to request (or authorized server workflow).
- **Response**:
```json
{
  "success": true,
  "data": {
    "decision": "VERIFIED", // 'VERIFIED' | 'NEEDS_REVIEW' | 'REJECTED'
    "confidenceScore": 88.5,
    "reason": "Evidence signals support the collection...",
    "hardEvidenceChecks": [ ... ],
    "aiAnalysisDetails": { ... },
    "dto": { ... }
  },
  "error": null
}
```

### 5.5 Fetch Verification Result
`GET /api/verification/:requestId`
- **Authorization**: Authenticated resident, collector, or municipality.
- **Response**: `ApiResponse<VerificationResultDTO>`

### 5.6 Manual Review Queue (For Person 3 Municipality / Admin)
`GET /api/verification/review-queue?page=1&limit=20`
- **Authorization**: `collector` or `municipality` role.
- **Response**: `ApiResponse<ReviewQueueItemDTO[]>`

### 5.7 Submit Manual Review Decision (For Person 3 Municipality / Admin)
`POST /api/verification/review/:requestId`
- **Authorization**: `municipality` or authorized reviewer.
- **Request Body**:
```json
{
  "decision": "APPROVE", // 'APPROVE' | 'REJECT'
  "reason": "Detailed justification for manual decision"
}
```
- **Response**: `ApiResponse<VerificationResultDTO>` (Returns HTTP 409 Conflict if already reviewed).

### 5.8 Collector Performance Metrics
- Collector Self Metrics: `GET /api/collector/metrics?range=7d`
- Municipal Admin View: `GET /api/collector/metrics/:collectorId?range=7d`
- **Authorization**: `collector` (self) or `municipality` (specified collector).
- **Response**: `ApiResponse<CollectorMetricsDTO>`

---

## 6. Collection Request Status Lifecycle

```
PENDING / WASTE_READY
         ↓
      ASSIGNED
         ↓
PICKUP_EVIDENCE_SUBMITTED
         ↓
VEHICLE_EVIDENCE_SUBMITTED
         ↓
VERIFICATION_IN_PROGRESS
   ↙        ↓        ↘
VERIFIED  REJECTED  NEEDS_REVIEW
                       ↓
              (Manual Review)
                   ↙      ↘
             VERIFIED   REJECTED
```

---

## 7. Security & Identity Guidelines

1. **No Client Trust for Identity**: The server independently verifies JWT tokens via `supabase.auth.getUser()`. Never pass `userId`, `collectorId`, or `role` in client request bodies for authorization.
2. **IDOR Protection**: Access controls enforce ownership checks server-side (e.g. collector can only submit evidence to requests assigned to them).
3. **Server-Side API Key Safety**: `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are stored server-side only in `.env.local` and never exposed to browser bundles.
