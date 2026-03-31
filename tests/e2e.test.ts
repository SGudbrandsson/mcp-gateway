import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('MCP Relay Kit E2E', () => {
  let client: Client;
  let transport: StdioClientTransport;
  const configPath = join(tmpdir(), 'mcp-relay-kit-e2e-config.json');

  beforeAll(async () => {
    // Write a config that enables asana (we won't make real API calls,
    // but the service will be registered so search/execute routing works)
    mkdirSync(join(tmpdir()), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({
        services: {
          asana: { token: 'fake-token-for-e2e', workspace: 'ws-test' },
        },
      })
    );

    transport = new StdioClientTransport({
      command: 'npx',
      args: ['tsx', 'src/server.ts'],
      cwd: join(import.meta.dirname, '..'),
      env: {
        ...process.env,
        GATEWAY_CONFIG: configPath,
      },
    });

    client = new Client({ name: 'e2e-test', version: '1.0.0' });
    await client.connect(transport);
  }, 30000);

  afterAll(async () => {
    await client.close();
    try {
      unlinkSync(configPath);
    } catch {}
  });

  it('lists the search and execute tools', async () => {
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name);
    expect(names).toContain('search');
    expect(names).toContain('execute');
  });

  it('search returns asana actions', async () => {
    const result = await client.callTool({ name: 'search', arguments: { query: 'asana' } });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const actions = JSON.parse(text);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0].service).toBe('asana');
  });

  it('search with empty query lists all actions', async () => {
    const result = await client.callTool({ name: 'search', arguments: { query: '' } });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const actions = JSON.parse(text);
    expect(actions.length).toBe(13); // All 13 asana actions
  });

  it('search for specific action returns matching results', async () => {
    const result = await client.callTool({ name: 'search', arguments: { query: 'comment' } });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const actions = JSON.parse(text);
    expect(actions.some((a: { action: string }) => a.action === 'post_comment')).toBe(true);
  });

  it('execute returns error for missing required param', async () => {
    const result = await client.callTool({
      name: 'execute',
      arguments: {
        service: 'asana',
        action: 'get_task',
        params: '{}',
      },
    });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Missing required parameter');
  });

  it('execute returns error for unknown service', async () => {
    const result = await client.callTool({
      name: 'execute',
      arguments: {
        service: 'nonexistent',
        action: 'anything',
        params: '{}',
      },
    });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Unknown service');
  });

  it('execute returns error for invalid JSON params', async () => {
    const result = await client.callTool({
      name: 'execute',
      arguments: {
        service: 'asana',
        action: 'get_task',
        params: 'not json',
      },
    });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Invalid JSON');
  });
});

describe('MCP Relay Kit E2E — proxied MCP server', () => {
  let client: Client;
  let transport: StdioClientTransport;
  const configPath = join(tmpdir(), 'mcp-relay-kit-e2e-proxy-config.json');

  beforeAll(async () => {
    mkdirSync(join(tmpdir()), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({
        services: {},
        mcpServers: {
          echo: {
            command: 'npx',
            args: ['tsx', join(import.meta.dirname, 'fixtures', 'echo-mcp-server.ts')],
          },
        },
      })
    );

    transport = new StdioClientTransport({
      command: 'npx',
      args: ['tsx', 'src/server.ts'],
      cwd: join(import.meta.dirname, '..'),
      env: {
        ...process.env,
        GATEWAY_CONFIG: configPath,
      },
    });

    client = new Client({ name: 'e2e-proxy-test', version: '1.0.0' });
    await client.connect(transport);
  }, 30000);

  afterAll(async () => {
    await client.close();
    try { unlinkSync(configPath); } catch {}
  });

  it('proxied echo server appears in search results', async () => {
    const result = await client.callTool({ name: 'search', arguments: { query: 'echo' } });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const actions = JSON.parse(text);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0].service).toBe('echo');
    expect(actions[0].action).toBe('echo');
  });

  it('can execute a proxied tool', async () => {
    const result = await client.callTool({
      name: 'execute',
      arguments: {
        service: 'echo',
        action: 'echo',
        params: JSON.stringify({ message: 'hello from proxy' }),
      },
    });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ echoed: 'hello from proxy' });
  });

  it('proxied server exposes correct param schemas', async () => {
    const result = await client.callTool({ name: 'search', arguments: { query: 'add numbers' } });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const actions = JSON.parse(text);
    const addAction = actions.find((a: any) => a.action === 'add');
    expect(addAction).toBeDefined();
    expect(addAction.params.a.type).toBe('number');
    expect(addAction.params.b.type).toBe('number');
    expect(addAction.params.a.required).not.toBe(false);
  });

  it('returns error for unknown action on proxied server', async () => {
    const result = await client.callTool({
      name: 'execute',
      arguments: {
        service: 'echo',
        action: 'nonexistent',
        params: '{}',
      },
    });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Unknown action');
  });
});
