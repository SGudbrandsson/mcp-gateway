# MCP Proxy & Rename to mcp-relay-kit

> **Goal:** Extend the gateway to proxy arbitrary MCP servers through the same search+execute interface, and rename the project to `mcp-relay-kit`.

## Decisions

| Decision | Choice |
|----------|--------|
| Proxy scope | Tools only (not resources or prompts) |
| Lifecycle | Spawn on startup, keep alive |
| Coexistence | Built-in adapters + proxied MCP servers side by side |
| Namespace | Flat — server name is the "service", tool name is the "action" |
| Implementation | MCP SDK Client (`StdioClientTransport`) |
| Rename | `codemode-gateway` → `mcp-relay-kit` |

## Config Format

The `GatewayConfig` gains a new optional `mcpServers` key using the standard MCP server config format:

```json
{
  "services": {
    "asana": { "token": "...", "workspace": "..." }
  },
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "ghp_..." }
    },
    "slack": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-slack"],
      "env": { "SLACK_TOKEN": "xoxb-..." }
    }
  }
}
```

- `mcpServers` is optional — existing configs without it keep working unchanged
- Each key becomes the service name in search/execute (e.g., `execute("github", "create_issue", "{}")`)
- `command`, `args`, `env` match the standard MCP server config format
- `env` values support `${VAR}` interpolation, same as `services`
- If a key in `mcpServers` collides with a key in `services`, log a warning and the built-in adapter wins

## Types

```typescript
interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface GatewayConfig {
  services: Record<string, ServiceConfig>;
  mcpServers?: Record<string, McpServerConfig>;
}
```

## MCP Proxy Module (`src/mcp-proxy.ts`)

Core responsibility: spawn a child MCP server, discover its tools, and return a `ServiceAdapter`.

### Startup flow

```
startMcpProxy(name, serverConfig)
  -> spawn child process via StdioClientTransport
  -> Client.connect()
  -> client.listTools() to discover tools
  -> convert each tool's JSON Schema into ServiceAction[]
  -> return { adapter: ServiceAdapter, shutdown: () => void }
```

### JSON Schema to ParamSchema conversion

MCP tools define params as JSON Schema (`{ type: "object", properties: { ... }, required: [...] }`). Each property is converted to `ParamSchema`:

- `string`, `number`, `boolean` map directly to ParamSchema `type`
- The JSON Schema `required` array determines `required: true/false` on each param
- `enum` arrays carry over
- `description` carries over
- Complex types (arrays, nested objects): set type to `string`, append the JSON Schema to the description so the caller knows the expected shape, and pass the value through to `callTool` as-is. Most MCP tool params are simple scalars; the few complex ones still work since `callTool` accepts arbitrary argument values.

### Execute flow

When `execute()` is called on a proxied action:
1. Call `client.callTool({ name: actionName, arguments: params })` on the child MCP client
2. Extract the text content from the MCP response
3. Return the result

### Lifecycle

- `startMcpProxy()` returns a `ServiceAdapter` plus a `shutdown()` function
- Server startup calls `startMcpProxy()` for each entry in `mcpServers`
- On process exit (SIGTERM, SIGINT), all child processes are cleaned up

### Error handling

- If a child MCP server fails to start or `listTools()` fails: log the error, skip that server, continue starting the hub
- If a child process dies mid-session: the execute call returns `{ success: false, error: "..." }`

## Server Startup Changes (`src/server.ts`)

After the existing built-in adapter registration loop, add a second loop for proxied MCP servers:

```
// existing: register built-in adapters from config.services
for (const [configKey, serviceConfig] of config.services) { ... }

// new: register proxied MCP servers from config.mcpServers
for (const [name, serverConfig] of config.mcpServers ?? {}) {
  if (registry.has(name)) {
    log warning: collision with built-in, skipping
    continue
  }
  const { adapter, shutdown } = await startMcpProxy(name, serverConfig)
  registry.register(adapter, {}, name)
  shutdowns.push(shutdown)
}

// cleanup on exit
process.on('SIGTERM', () => shutdowns.forEach(fn => fn()))
process.on('SIGINT',  () => shutdowns.forEach(fn => fn()))
```

## Setup Wizard Changes (`src/setup.ts`)

After configuring built-in services, add a new section:

- Ask: "Would you like to add any MCP servers?"
- For each MCP server, prompt for:
  - **Name** (the registry key, e.g., "github")
  - **Command** (e.g., "npx")
  - **Args** (e.g., "-y @modelcontextprotocol/server-github")
  - **Env vars** (key=value pairs, using existing `resolveValue` heuristic)
- Allow adding multiple with "Add another?" loop
- Written into the `mcpServers` section of the config file

## Rename: `codemode-gateway` → `mcp-relay-kit`

Mechanical rename across:

- `package.json`: name → `mcp-relay-kit`, bin → `mcp-relay-kit`
- `src/server.ts`: McpServer name, log prefix `[mcp-relay-kit]`
- `src/setup.ts`: MCP server entry key → `mcp-relay-kit`, prompts, paths
- Setup wizard config path: `~/.config/mcp-relay-kit/`
- `README.md`, `docs/setup-guide.md`: all references
- Tests: describe names, temp file prefixes
- `examples/`: file references

External `.mcp.json` files (like keeps) reference absolute file paths, so only the JSON key name changes — file paths stay the same.

## Testing

### Unit tests for `mcp-proxy.ts`
- Schema conversion: JSON Schema → ParamSchema for string, number, boolean, required/optional, enums, complex types
- Error handling: child process fails to start, listTools fails, callTool fails

### Integration test
- Create a minimal test MCP server (one tool that echoes input)
- Configure it in `mcpServers`
- Verify it appears in search results and can be executed through the hub

### Existing tests
- Registry, config, E2E tests keep working — update names for the rename
- E2E test optionally adds a proxied server to verify the full path

### Not tested
- Real external MCP servers — we test the proxy mechanism, not third-party implementations
