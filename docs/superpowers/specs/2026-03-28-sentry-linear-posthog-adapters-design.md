# Sentry, Linear, and PostHog Adapters Design

## Overview

Add three new service adapters to the MCP gateway: Sentry (issue management), Linear (full CRUD issue tracking), and PostHog (analytics/debugging). Each adapter follows the existing pattern established by the Asana adapter — a single file per service with a helper fetch function and inline actions.

## Architecture

Each adapter is a standalone `ServiceAdapter` implementation in `src/services/`. No shared base classes or abstractions — each service has its own fetch helper tailored to its API quirks:

- **Sentry:** REST API, Bearer token auth, responses used directly
- **Linear:** GraphQL API, Bearer token auth, single endpoint
- **PostHog:** REST API, Bearer token auth, project-scoped paths

All adapters are registered in `src/services/index.ts` and auto-wired by the server when their config section is present.

## Configuration

Each service gets a section in the gateway config JSON:

```json
{
  "services": {
    "sentry": {
      "token": "${SENTRY_AUTH_TOKEN}",
      "organization": "my-org",
      "project": "my-project",
      "baseUrl": "https://sentry.io/api/0"
    },
    "linear": {
      "token": "${LINEAR_API_KEY}",
      "baseUrl": "https://api.linear.app"
    },
    "posthog": {
      "token": "${POSTHOG_PERSONAL_API_KEY}",
      "project_id": "12345",
      "baseUrl": "https://us.posthog.com"
    }
  }
}
```

- `token`: Required for all three services
- `baseUrl`: Optional, defaults to cloud SaaS URL (allows self-hosted instances)
- `organization` + `project`: Required for Sentry (used in API paths)
- `project_id`: Required for PostHog (scopes all queries to a project)

## Sentry Adapter

**File:** `src/services/sentry.ts`

**Helper:** `sentryFetch(path, config, options?)` — Bearer token auth, base URL defaults to `https://sentry.io/api/0`.

**Actions:**

| Action | Method | API Path | Params |
|--------|--------|----------|--------|
| `list_issues` | GET | `/projects/{org}/{project}/issues/` | `query?` (Sentry search syntax), `sort?` (enum: date, priority, freq, new) |
| `get_issue` | GET | `/issues/{issue_id}/` | `issue_id` (required) |
| `get_issue_events` | GET | `/issues/{issue_id}/events/` | `issue_id` (required) |
| `get_event_details` | GET | `/issues/{issue_id}/events/{event_id}/` | `issue_id` (required), `event_id` (required) |
| `resolve_issue` | PUT | `/issues/{issue_id}/` | `issue_id` (required) — sends `{ status: "resolved" }` |
| `unresolve_issue` | PUT | `/issues/{issue_id}/` | `issue_id` (required) — sends `{ status: "unresolved" }` |
| `update_issue` | PUT | `/issues/{issue_id}/` | `issue_id` (required), `assignedTo?`, `status?` (enum: resolved, unresolved, ignored), `priority?` |

**Notes:**
- `list_issues` supports Sentry's full search query syntax (e.g., `is:unresolved level:error first-seen:-24h`)
- `organization` and `project` are read from config and used to build project-scoped paths
- Issue-level endpoints use the issue ID directly (not project-scoped)

## Linear Adapter

**File:** `src/services/linear.ts`

**Helper:** `linearGraphQL(query, variables, config)` — Bearer token auth, endpoint defaults to `https://api.linear.app/graphql`. All actions use GraphQL queries/mutations.

**Actions:**

| Action | GraphQL Operation | Params |
|--------|-------------------|--------|
| `search_issues` | `issueSearch` query | `query` (required), `team_id?` |
| `get_issue` | `issue` query | `issue_id` (required) — accepts identifier like "ENG-123" |
| `create_issue` | `issueCreate` mutation | `title` (required), `team_id` (required), `description?`, `priority?` (enum: 0-4), `assignee_id?`, `state_id?`, `label_ids?` |
| `update_issue` | `issueUpdate` mutation | `issue_id` (required), `title?`, `description?`, `priority?`, `assignee_id?`, `state_id?` |
| `delete_issue` | `issueArchive` mutation | `issue_id` (required) — archives rather than hard-deletes |
| `list_teams` | `teams` query | (none) |
| `list_projects` | `projects` query | `team_id?` |
| `list_workflow_states` | `workflowStates` query | `team_id` (required) |
| `add_comment` | `commentCreate` mutation | `issue_id` (required), `body` (required, markdown) |
| `list_labels` | `issueLabels` query | `team_id?` |

**Notes:**
- Linear is GraphQL-only; the helper sends POST requests with `{ query, variables }` bodies
- `delete_issue` uses `issueArchive` mutation (Linear convention — issues are archived, not deleted)
- Lookup actions (`list_teams`, `list_workflow_states`, `list_labels`) provide the IDs needed for create/update operations
- `priority` uses Linear's numeric scale: 0 = No priority, 1 = Urgent, 2 = High, 3 = Medium, 4 = Low

## PostHog Adapter

**File:** `src/services/posthog.ts`

**Helper:** `posthogFetch(path, config, options?)` — Bearer token auth (`Personal API Key`), base URL defaults to `https://us.posthog.com`. All paths prefixed with `/api/projects/{project_id}/`.

**Actions:**

| Action | Method | API Path | Params |
|--------|--------|----------|--------|
| `query_events` | GET | `/events/` | `event?` (event name filter), `person_id?`, `distinct_id?`, `limit?`, `before?` (ISO date), `after?` (ISO date) |
| `get_person` | GET | `/persons/{person_id}/` or search by distinct_id | `person_id?`, `distinct_id?` (one required) |
| `search_persons` | GET | `/persons/` | `query` (required) — searches by email/properties |
| `get_person_events` | GET | `/events/` | `person_id` (required), `limit?`, `event?`, `before?`, `after?` |
| `query_insights` | GET | `/insights/{insight_id}/` | `insight_id` (required) |
| `list_cohorts` | GET | `/cohorts/` | (none) |
| `get_session_recordings` | GET | `/session_recordings/` | `person_id?`, `date_from?`, `date_to?`, `limit?` |
| `get_session_recording` | GET | `/session_recordings/{recording_id}/` | `recording_id` (required) |

**Notes:**
- All paths are scoped to a project via `project_id` from config
- `get_person` accepts either `person_id` or `distinct_id` (at least one required); if `distinct_id` is provided, it searches persons by that value
- `get_person_events` is implemented by querying `/events/` filtered by `person_id` — same endpoint as `query_events` but person-scoped
- Session recordings are key for debugging rage clicks and bug patterns — filter by person, then drill into specific sessions
- `query_insights` retrieves a saved insight by ID (for running pre-configured trend queries)

## Testing Strategy

Each adapter gets a test file following the `asana.test.ts` pattern:

- **`tests/sentry.test.ts`** — Mock `fetch`, test each action's request construction and response handling, test error cases (missing token, API errors), test config defaults (base URL)
- **`tests/linear.test.ts`** — Mock `fetch`, test GraphQL query/variable construction for each action, test mutations, test error responses
- **`tests/posthog.test.ts`** — Mock `fetch`, test each action's URL construction and query params, test person lookup by both ID types, test config defaults

Each test file validates:
1. Correct HTTP method and URL construction
2. Correct auth headers
3. Required param validation (missing params throw)
4. Response data extraction
5. Error handling (missing token, API errors)

The existing e2e test will automatically pick up new adapters when config is present.

## Registration

Add all three adapters to `src/services/index.ts`:

```typescript
import { sentry } from './sentry.js';
import { linear } from './linear.js';
import { posthog } from './posthog.js';

export const availableAdapters: Record<string, ServiceAdapter> = {
  asana,
  sentry,
  linear,
  posthog,
};
```

## Files Changed

- `src/services/sentry.ts` — New file
- `src/services/linear.ts` — New file
- `src/services/posthog.ts` — New file
- `src/services/index.ts` — Add imports and registrations
- `tests/sentry.test.ts` — New file
- `tests/linear.test.ts` — New file
- `tests/posthog.test.ts` — New file
- `examples/keeps.json` — Add example config for new services
