#!/usr/bin/env node
/**
 * Minimal MCP server for testing MCP proxying.
 * Exposes two tools: echo(message) and add(a, b).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'echo-test-server', version: '1.0.0' });

server.tool(
  'echo',
  'Echo back the input message',
  { message: z.string().describe('Message to echo back') },
  async ({ message }) => ({
    content: [{ type: 'text' as const, text: JSON.stringify({ echoed: message }) }],
  })
);

server.tool(
  'add',
  'Add two numbers',
  {
    a: z.number().describe('First number'),
    b: z.number().describe('Second number'),
  },
  async ({ a, b }) => ({
    content: [{ type: 'text' as const, text: JSON.stringify({ result: a + b }) }],
  })
);

const transport = new StdioServerTransport();
server.connect(transport);
