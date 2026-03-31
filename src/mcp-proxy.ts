/**
 * @fileoverview MCP proxy — spawns child MCP servers and wraps their tools as ServiceAdapters.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { ServiceAdapter, ServiceAction, ParamSchema, McpServerConfig } from './types.js';

/** JSON Schema property (subset we handle) */
interface JsonSchemaProperty {
  type?: string;
  description?: string;
  enum?: string[];
  [key: string]: unknown;
}

/** JSON Schema object (subset we handle) */
interface JsonSchemaObject {
  type: 'object';
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

/**
 * Convert a JSON Schema object definition to our ParamSchema format.
 * Exported for testing.
 */
export function convertJsonSchemaToParams(
  schema: JsonSchemaObject
): Record<string, ParamSchema> {
  const params: Record<string, ParamSchema> = {};
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);

  for (const [name, prop] of Object.entries(properties)) {
    const simpleType = prop.type === 'string' || prop.type === 'number' || prop.type === 'boolean';

    let type: ParamSchema['type'];
    let description = prop.description ?? '';

    if (simpleType) {
      type = prop.type as ParamSchema['type'];
    } else {
      // Complex type — fall back to string, include schema info in description
      type = 'string';
      if (prop.type) {
        description = description
          ? `${description} (JSON ${prop.type})`
          : `JSON ${prop.type}`;
      }
    }

    const paramSchema: ParamSchema = {
      type,
      description,
      required: required.has(name),
    };

    if (prop.enum && Array.isArray(prop.enum)) {
      paramSchema.enum = prop.enum as string[];
    }

    params[name] = paramSchema;
  }

  return params;
}

/**
 * Start a proxied MCP server and return a ServiceAdapter wrapping its tools.
 */
export async function startMcpProxy(
  name: string,
  config: McpServerConfig
): Promise<{ adapter: ServiceAdapter; shutdown: () => void }> {
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)
      ),
      ...(config.env ?? {}),
    },
  });

  const client = new Client({ name: `mcp-relay-kit-proxy-${name}`, version: '1.0.0' });
  await client.connect(transport);

  const { tools } = await client.listTools();

  const actions: ServiceAction[] = tools.map((tool) => {
    const inputSchema = (tool.inputSchema ?? { type: 'object' }) as JsonSchemaObject;
    const params = convertJsonSchemaToParams(inputSchema);

    return {
      name: tool.name,
      description: tool.description ?? '',
      params,
      execute: async (actionParams: Record<string, unknown>, _config: Record<string, unknown>) => {
        const callPromise = client.callTool({
          name: tool.name,
          arguments: actionParams,
        });
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Proxied tool "${tool.name}" timed out after 30s`)), 30_000)
        );
        const result = await Promise.race([callPromise, timeout]);
        // Extract text content from MCP response
        const texts = (result.content as Array<{ type: string; text?: string }>)
          .filter((c) => c.type === 'text' && c.text)
          .map((c) => c.text!);
        if (texts.length === 1) {
          // Try to parse as JSON for cleaner output
          try { return JSON.parse(texts[0]); } catch { return texts[0]; }
        }
        return texts.length > 0 ? texts.join('\n') : result.content;
      },
    };
  });

  const adapter: ServiceAdapter = {
    name,
    description: `Proxied MCP server: ${name}`,
    actions,
  };

  const shutdown = () => {
    client.close().catch(() => {});
  };

  return { adapter, shutdown };
}
