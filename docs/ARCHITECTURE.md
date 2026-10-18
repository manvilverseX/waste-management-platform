# Architecture Decisions: Waste Management Platform

This document is the **single source of truth for the entire Waste Management Platform project**.

Use ONLY the architecture decisions provided below. Do not invent additional features, technologies, database entities, APIs, or architectural patterns.

## TEAM

* **Manvil** → Resident + Frontend + Integration
* **Nipun** → Collector + Evidence Verification
* **Harsh** → Community + Municipality

## TECH STACK

### Frontend
* Next.js 16
* TypeScript
* Tailwind CSS
* shadcn/ui
* Lucide React
* React Hook Form
* Zod

### Backend
* Next.js Route Handlers / Server Actions
* TypeScript
* Zod

### Database
* Supabase PostgreSQL
* PostGIS

### Authentication
* Supabase Auth

### Storage
* Supabase Storage

### Maps
* MapLibre GL JS
* OpenStreetMap

### AI
* xAI Grok API

### Deployment
* Vercel
* Supabase Cloud

### Development
* Git
* GitHub
* npm
* ESLint
* Prettier

## ARCHITECTURE PRINCIPLE

This is ONE Next.js application.

Do NOT create separate applications for Resident, Collector, Community, or Municipality.

The modules share:
* One codebase
* One Supabase project
* One database
* One authentication system
* One API layer
* Shared TypeScript types
* Shared UI components

## DATABASE ENTITIES

The initial database contains:

1. **users**
   * id
   * name
   * email
   * role
   * created_at

2. **communities**
   * id
   * name
   * address
   * latitude
   * longitude
   * created_at

3. **community_memberships**
   * id
   * user_id
   * community_id
   * membership_role
   * joined_at

4. **collection_requests**
   * id
   * resident_id
   * community_id
   * status
   * requested_at
   * completed_at

5. **evidence**
   * id
   * collection_request_id
   * evidence_type
   * image_url
   * uploaded_by
   * uploaded_at
   * verification_status

   *Evidence types:*
   * RESIDENT_BEFORE
   * COLLECTOR_AFTER

6. **verification_results**
   * id
   * evidence_id
   * decision
   * confidence_score
   * analysis
   * verified_at

7. **dumping_reports**
   * id
   * reported_by
   * community_id
   * image_url
   * latitude
   * longitude
   * description
   * status
   * reported_at

8. **reward_transactions**
   * id
   * user_id
   * points
   * reason
   * reference_type
   * reference_id
   * created_at

9. **community_scores**
   * id
   * community_id
   * score
   * period
   * breakdown
   * calculated_at

10. **municipality_issues**
    * id
    * community_id
    * reported_by
    * title
    * description
    * priority
    * status
    * created_at
    * resolved_at

## IMPORTANT DATABASE RULE

Do not independently change the database schema.

Any new entity, field, relationship, or major schema change must first be discussed with the team and added to this architecture document.

## API CONTRACTS

### Base path
`/api`

### Collection Requests
* POST `/api/collection-requests`
* GET `/api/collection-requests`
* GET `/api/collection-requests/:id`
* PATCH `/api/collection-requests/:id`

### Evidence
* POST `/api/evidence`
* GET `/api/evidence/:id`

### Verification
* POST `/api/verification/:requestId`
* GET `/api/verification/:requestId`

### Dumping Reports
* POST `/api/dumping-reports`
* GET `/api/dumping-reports`
* GET `/api/dumping-reports/:id`
* PATCH `/api/dumping-reports/:id`

### Communities
* GET `/api/communities`
* GET `/api/communities/:id`
* GET `/api/communities/:id/score`

### Rewards
* GET `/api/rewards`
* GET `/api/rewards/summary`

### Municipality
* GET `/api/municipality/issues`
* PATCH `/api/municipality/issues/:id`
* GET `/api/municipality/communities`
* GET `/api/municipality/analytics`

## API RULES

Use camelCase for JSON fields:
* userId
* communityId
* collectionRequestId

Do not mix naming conventions.

All incoming API data must be validated using Zod.

The backend must independently verify:
* authenticated user
* role
* permissions
* community membership

The frontend must never be trusted for authorization.

### Standard success response
```json
{
  "success": true,
  "data": {},
  "error": null
}
```

### Standard error response
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "ERROR_CODE",
    "message": "..."
  }
}
```

## AUTHENTICATION

Use Supabase Auth.

Primary roles:
* resident
* collector
* municipality

Authentication and authorization are different.
* Supabase Auth handles authentication.
* Backend authorization and Supabase RLS enforce permissions.

## AI ARCHITECTURE

The browser must NEVER directly call Grok.

### Correct flow
```
Browser -> Next.js backend -> Grok -> verification result -> database
```

xAI API keys must remain server-side.

AI analysis must not directly determine business permissions.
Business rules determine the final application outcome.

## FRONTEND STRUCTURE

Use:
```
src/
├── app/
│   ├── api/
│   ├── (auth)/
│   ├── resident/
│   ├── collector/
│   ├── community/
│   └── municipality/
│
├── components/
│   ├── ui/
│   └── shared/
│
├── features/
│   ├── resident/
│   ├── collector/
│   ├── community/
│   └── municipality/
│
├── lib/
│   ├── supabase/
│   ├── verification/
│   └── validations/
│
├── types/
│
└── utils/
```

### Module ownership

#### Manvil
* `features/resident`
* frontend integration

#### Nipun
* `features/collector`
* evidence verification

#### Harsh
* `features/community`
* `features/municipality`

#### Shared areas require coordination
* `components/ui`
* `components/shared`
* `types`
* `lib/supabase`
* API contracts
* authentication
* database schema

## GIT WORKFLOW

### Branches
* `main` → stable
* `resident` → Manvil
* `collector` → Nipun
* `community` → Harsh

Nobody directly develops on `main`.

### Normal workflow
```
pull -> code -> test -> commit -> push
```

Meaningful features should have meaningful commits.

Never force-push.
Never commit secrets.

## ENVIRONMENT VARIABLES

Use `.env.local`.

Expected variables include:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
XAI_API_KEY
```

Never commit `.env.local`.
Server-only secrets must never be exposed to the browser.

## PRODUCT FEATURES

### Resident
* Waste collection request
* Before-collection evidence
* Collection tracking
* Dumping reports
* Location capture
* Rewards
* Behavioural education
* Community participation

### Collector
* Collection requests
* Collection batching
* Collection completion
* After-collection evidence
* AI-assisted verification

### Community
* Community dashboard
* Community score
* Collection statistics
* Participation
* Challenges
* Dumping hotspots
* Community trends

### Municipality
* Community monitoring
* Dumping hotspots
* Waste-management analytics
* Community issues
* Issue prioritisation

## NON-NEGOTIABLE RULES

1. Do not introduce another major framework or database.
2. Do not create separate applications for each role.
3. Do not independently modify the database schema.
4. Do not independently modify API contracts.
5. Do not expose API keys.
6. Do not trust frontend authorization.
7. Do not call Grok directly from the browser.
8. Do not code directly on main.
9. Do not commit secrets.
10. Do not add unnecessary libraries.
11. Prefer simple implementations suitable for beginner developers.
12. If an architectural decision is unclear, stop and ask the team instead of inventing one.
