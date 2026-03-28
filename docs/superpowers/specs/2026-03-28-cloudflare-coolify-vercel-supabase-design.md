# Cloudflare, Coolify, Vercel, and Supabase Adapters + Documentation Design

## Overview

Add four new service adapters to the MCP gateway plus two documentation guides. Each adapter follows the established single-file pattern with a fetch helper and inline actions.

## Configuration

```json
{
  "services": {
    "cloudflare": {
      "token": "${CLOUDFLARE_API_TOKEN}",
      "account_id": "YOUR_ACCOUNT_ID",
      "zone_id": "YOUR_ZONE_ID"
    },
    "coolify": {
      "token": "${COOLIFY_API_TOKEN}",
      "baseUrl": "http://your-coolify-host:8000"
    },
    "vercel": {
      "token": "${VERCEL_TOKEN}",
      "team_id": "team_xxxx"
    },
    "supabase": {
      "token": "${SUPABASE_MANAGEMENT_TOKEN}",
      "service_role_key": "${SUPABASE_SERVICE_ROLE_KEY}",
      "project_ref": "YOUR_PROJECT_REF",
      "baseUrl": "https://supabase.co"
    }
  }
}
```

Config notes:
- **Cloudflare:** `token` required. `account_id` required for tunnels/Zero Trust. `zone_id` required for DNS.
- **Coolify:** `token` and `baseUrl` both required (self-hosted, no default).
- **Vercel:** `token` required. `team_id` optional (appended as `?teamId=` to requests).
- **Supabase:** Two tokens — `token` for Management API (projects, functions, SQL), `service_role_key` for Project API (auth, storage). `project_ref` required. `baseUrl` defaults to `supabase.co`, configurable for self-hosted.

## Cloudflare Adapter

**File:** `src/services/cloudflare.ts`

**Helper:** `cloudflareFetch(path, config, options?)` — Bearer token auth, base URL `https://api.cloudflare.com/client/v4`. Extracts `.result` from responses (Cloudflare wraps all responses in `{ success, result, errors }`).

**Actions (18):**

### DNS (zone-scoped, uses `zone_id` from config)

| Action | Method | Path | Params |
|--------|--------|------|--------|
| `list_dns_records` | GET | `/zones/{zone_id}/dns_records` | `type?`, `name?`, `search?` |
| `get_dns_record` | GET | `/zones/{zone_id}/dns_records/{record_id}` | `record_id` |
| `create_dns_record` | POST | `/zones/{zone_id}/dns_records` | `type`, `name`, `content`, `proxied?`, `ttl?`, `priority?` |
| `update_dns_record` | PATCH | `/zones/{zone_id}/dns_records/{record_id}` | `record_id`, `type?`, `name?`, `content?`, `proxied?`, `ttl?` |
| `delete_dns_record` | DELETE | `/zones/{zone_id}/dns_records/{record_id}` | `record_id` |

### Zero Trust Access (account-scoped, uses `account_id` from config)

| Action | Method | Path | Params |
|--------|--------|------|--------|
| `list_access_apps` | GET | `/accounts/{account_id}/access/apps` | — |
| `get_access_app` | GET | `/accounts/{account_id}/access/apps/{app_id}` | `app_id` |
| `create_access_app` | POST | `/accounts/{account_id}/access/apps` | `name`, `domain`, `type?`, `session_duration?` |
| `delete_access_app` | DELETE | `/accounts/{account_id}/access/apps/{app_id}` | `app_id` |
| `list_access_policies` | GET | `/accounts/{account_id}/access/apps/{app_id}/policies` | `app_id` |
| `create_access_policy` | POST | `/accounts/{account_id}/access/apps/{app_id}/policies` | `app_id`, `name`, `decision`, `include` (JSON) |
| `delete_access_policy` | DELETE | `/accounts/{account_id}/access/apps/{app_id}/policies/{policy_id}` | `app_id`, `policy_id` |

### Tunnels (account-scoped, uses `account_id` from config)

| Action | Method | Path | Params |
|--------|--------|------|--------|
| `list_tunnels` | GET | `/accounts/{account_id}/cfd_tunnel` | `name?` |
| `get_tunnel` | GET | `/accounts/{account_id}/cfd_tunnel/{tunnel_id}` | `tunnel_id` |
| `create_tunnel` | POST | `/accounts/{account_id}/cfd_tunnel` | `name`, `tunnel_secret` |
| `delete_tunnel` | DELETE | `/accounts/{account_id}/cfd_tunnel/{tunnel_id}` | `tunnel_id` |
| `get_tunnel_config` | GET | `/accounts/{account_id}/cfd_tunnel/{tunnel_id}/configurations` | `tunnel_id` |
| `update_tunnel_config` | PUT | `/accounts/{account_id}/cfd_tunnel/{tunnel_id}/configurations` | `tunnel_id`, `config` (JSON string of ingress rules) |

## Coolify Adapter

**File:** `src/services/coolify.ts`

**Helper:** `coolifyFetch(path, config, options?)` — Bearer token auth, base URL from config (required), path prefix `/api/v1`. Validates `baseUrl` is present.

**Actions (23):**

### Applications

| Action | Method | Path | Params |
|--------|--------|------|--------|
| `list_applications` | GET | `/applications` | `tag?` |
| `get_application` | GET | `/applications/{uuid}` | `uuid` |
| `deploy_application` | GET | `/deploy?uuid={uuid}` | `uuid`, `force?` |
| `restart_application` | GET | `/applications/{uuid}/restart` | `uuid` |
| `stop_application` | GET | `/applications/{uuid}/stop` | `uuid` |
| `get_application_logs` | GET | `/applications/{uuid}/logs` | `uuid`, `lines?` |

### Servers

| Action | Method | Path | Params |
|--------|--------|------|--------|
| `list_servers` | GET | `/servers` | — |
| `get_server` | GET | `/servers/{uuid}` | `uuid` |
| `validate_server` | GET | `/servers/{uuid}/validate` | `uuid` |
| `get_server_resources` | GET | `/servers/{uuid}/resources` | `uuid` |

### Databases

| Action | Method | Path | Params |
|--------|--------|------|--------|
| `list_databases` | GET | `/databases` | — |
| `get_database` | GET | `/databases/{uuid}` | `uuid` |
| `create_database` | POST | `/databases/{type}` | `type` (enum: postgresql, mysql, mariadb, mongodb, redis, clickhouse, dragonfly, keydb), `server_uuid`, `project_uuid`, `environment_name`, `name?`, `image?` |
| `start_database` | GET | `/databases/{uuid}/start` | `uuid` |
| `stop_database` | GET | `/databases/{uuid}/stop` | `uuid` |

### Projects

| Action | Method | Path | Params |
|--------|--------|------|--------|
| `list_projects` | GET | `/projects` | — |
| `get_project` | GET | `/projects/{uuid}` | `uuid` |
| `create_project` | POST | `/projects` | `name`, `description?` |
| `delete_project` | DELETE | `/projects/{uuid}` | `uuid` |

### Environments

| Action | Method | Path | Params |
|--------|--------|------|--------|
| `list_environments` | GET | `/projects/{project_uuid}/environments` | `project_uuid` |
| `get_environment` | GET | `/projects/{project_uuid}/{environment_name}` | `project_uuid`, `environment_name` |
| `create_environment` | POST | `/projects/{project_uuid}/environments` | `project_uuid`, `name` |
| `delete_environment` | DELETE | `/projects/{project_uuid}/{environment_name}` | `project_uuid`, `environment_name` |

## Vercel Adapter

**File:** `src/services/vercel.ts`

**Helper:** `vercelFetch(path, config, options?)` — Bearer token auth, base URL `https://api.vercel.com`. Automatically appends `?teamId={team_id}` from config when present.

**Actions (18):**

### Deployments

| Action | Method | Path | Params |
|--------|--------|------|--------|
| `list_deployments` | GET | `/v6/deployments` | `projectId?`, `state?`, `target?`, `limit?` |
| `get_deployment` | GET | `/v13/deployments/{deployment_id}` | `deployment_id` |
| `create_deployment` | POST | `/v13/deployments` | `name`, `project?`, `target?` |
| `cancel_deployment` | PATCH | `/v12/deployments/{deployment_id}/cancel` | `deployment_id` |
| `promote_deployment` | POST | `/v10/projects/{project_id}/promote/{deployment_id}` | `project_id`, `deployment_id` |
| `rollback_deployment` | POST | `/v1/projects/{project_id}/rollback/{deployment_id}` | `project_id`, `deployment_id`, `description?` |

### Projects

| Action | Method | Path | Params |
|--------|--------|------|--------|
| `list_projects` | GET | `/v10/projects` | `search?` |
| `get_project` | GET | `/v9/projects/{project_id}` | `project_id` |
| `create_project` | POST | `/v11/projects` | `name`, `framework?` |
| `update_project` | PATCH | `/v9/projects/{project_id}` | `project_id`, `name?`, `framework?`, `buildCommand?` |
| `delete_project` | DELETE | `/v9/projects/{project_id}` | `project_id` |

### Environment Variables

| Action | Method | Path | Params |
|--------|--------|------|--------|
| `list_env_vars` | GET | `/v10/projects/{project_id}/env` | `project_id` |
| `create_env_var` | POST | `/v10/projects/{project_id}/env` | `project_id`, `key`, `value`, `target`, `type?` |
| `update_env_var` | PATCH | `/v9/projects/{project_id}/env/{env_id}` | `project_id`, `env_id`, `value?`, `target?` |
| `delete_env_var` | DELETE | `/v9/projects/{project_id}/env/{env_id}` | `project_id`, `env_id` |

### Domains

| Action | Method | Path | Params |
|--------|--------|------|--------|
| `list_domains` | GET | `/v9/projects/{project_id}/domains` | `project_id` |
| `add_domain` | POST | `/v10/projects/{project_id}/domains` | `project_id`, `name` |
| `remove_domain` | DELETE | `/v9/projects/{project_id}/domains/{domain}` | `project_id`, `domain` |

## Supabase Adapter

**File:** `src/services/supabase.ts`

**Helpers:** Two fetch functions due to Supabase's dual API architecture:
- `supabaseManagementFetch(path, config, options?)` — Bearer token auth, base URL `https://api.supabase.com`. Used for projects, SQL, edge functions lifecycle.
- `supabaseProjectFetch(path, config, options?)` — `service_role_key` as both `apikey` header and `Authorization: Bearer` header. Base URL `https://{project_ref}.{baseUrl}` (configurable for self-hosted). Used for auth, storage, function invocation.

**Actions (20):**

### Projects (Management API)

| Action | Method | Path | Params |
|--------|--------|------|--------|
| `list_projects` | GET | `/v1/projects` | — |
| `get_project` | GET | `/v1/projects/{project_ref}` | `project_ref` |

### Database (Management API)

| Action | Method | Path | Params |
|--------|--------|------|--------|
| `run_sql` | POST | `/v1/projects/{project_ref}/database/query` | `query`, `read_only?` |

### Auth / Users (Project API)

| Action | Method | Path | Params |
|--------|--------|------|--------|
| `list_users` | GET | `/auth/v1/admin/users` | `page?`, `per_page?` |
| `get_user` | GET | `/auth/v1/admin/users/{user_id}` | `user_id` |
| `create_user` | POST | `/auth/v1/admin/users` | `email?`, `phone?`, `password?`, `email_confirm?`, `user_metadata?` |
| `update_user` | PUT | `/auth/v1/admin/users/{user_id}` | `user_id`, `email?`, `password?`, `user_metadata?` |
| `delete_user` | DELETE | `/auth/v1/admin/users/{user_id}` | `user_id` |

### Storage (Project API)

| Action | Method | Path | Params |
|--------|--------|------|--------|
| `list_buckets` | GET | `/storage/v1/bucket` | — |
| `get_bucket` | GET | `/storage/v1/bucket/{bucket_id}` | `bucket_id` |
| `create_bucket` | POST | `/storage/v1/bucket` | `id`, `name`, `public?`, `file_size_limit?`, `allowed_mime_types?` |
| `delete_bucket` | DELETE | `/storage/v1/bucket/{bucket_id}` | `bucket_id` |
| `list_files` | POST | `/storage/v1/object/list/{bucket_id}` | `bucket_id`, `prefix?`, `limit?`, `search?` |
| `delete_files` | DELETE | `/storage/v1/object/{bucket_id}` | `bucket_id`, `prefixes` |
| `get_signed_url` | POST | `/storage/v1/object/sign/{bucket_id}/{path}` | `bucket_id`, `path`, `expires_in` |
| `upload_file` | POST | `/storage/v1/object/{bucket_id}/{path}` | `bucket_id`, `path`, `content` (base64-encoded), `content_type?` |

### Edge Functions

| Action | Method | Path | Params |
|--------|--------|------|--------|
| `list_functions` | GET | `/v1/projects/{project_ref}/functions` | — (Management API) |
| `get_function` | GET | `/v1/projects/{project_ref}/functions/{function_slug}` | `function_slug` (Management API) |
| `delete_function` | DELETE | `/v1/projects/{project_ref}/functions/{function_slug}` | `function_slug` (Management API) |
| `invoke_function` | POST | `/functions/v1/{function_slug}` | `function_slug`, `body?` (Project API) |

## Documentation

### Connector Development Guide (`docs/adding-a-connector.md`)

Covers:
1. File structure — create `src/services/<name>.ts`, register in `src/services/index.ts`
2. Adapter pattern — fetch helper with token validation and error handling, `ServiceAction[]` array, exported `ServiceAdapter` constant
3. Config schema — how config loading works, `${ENV_VAR}` interpolation
4. Security requirements — `validatePathSegment()` for all path-interpolated params, GraphQL variables (not string interpolation)
5. Testing pattern — mock fetch with `vi.stubGlobal`, per-adapter response helpers, what to cover (happy path, missing token, API errors, custom baseUrl)
6. Step-by-step walkthrough using Sentry adapter as the simplest example

### Setup Guide (`docs/setup-guide.md`)

Covers:
1. Creating a gateway config JSON with service credentials
2. Claude Code — `.mcp.json` configuration
3. Gemini CLI — MCP server config
4. OpenAI Codex — MCP server setup
5. Cursor / Windsurf / other IDEs — MCP settings
6. Verifying the setup works

## Testing Strategy

Same pattern as existing adapters:
- One test file per adapter in `tests/`
- Mock `fetch` with `vi.stubGlobal`
- Test each action: correct URL construction, auth headers, params, error cases
- Validate `validatePathSegment` is used on path params
- Validate required config fields are checked

## Registration

All four adapters added to `src/services/index.ts`.

## Files Changed

- `src/services/cloudflare.ts` — New
- `src/services/coolify.ts` — New
- `src/services/vercel.ts` — New
- `src/services/supabase.ts` — New
- `src/services/index.ts` — Add 4 imports and registrations
- `tests/cloudflare.test.ts` — New
- `tests/coolify.test.ts` — New
- `tests/vercel.test.ts` — New
- `tests/supabase.test.ts` — New
- `examples/keeps.json` — Add config examples for 4 new services
- `docs/adding-a-connector.md` — New
- `docs/setup-guide.md` — New
