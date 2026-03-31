import { describe, it, expect } from 'vitest';
import { convertJsonSchemaToParams } from '../src/mcp-proxy.js';

describe('convertJsonSchemaToParams', () => {
  it('converts simple string, number, boolean properties', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'The name' },
        count: { type: 'number', description: 'How many' },
        verbose: { type: 'boolean', description: 'Enable verbose' },
      },
    };
    const result = convertJsonSchemaToParams(schema);
    expect(result.name).toEqual({ type: 'string', description: 'The name', required: false });
    expect(result.count).toEqual({ type: 'number', description: 'How many', required: false });
    expect(result.verbose).toEqual({ type: 'boolean', description: 'Enable verbose', required: false });
  });

  it('marks required properties', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Resource ID' },
        label: { type: 'string', description: 'Optional label' },
      },
      required: ['id'],
    };
    const result = convertJsonSchemaToParams(schema);
    expect(result.id.required).toBe(true);
    expect(result.label.required).toBe(false);
  });

  it('carries over enum arrays', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        status: { type: 'string', description: 'Status', enum: ['open', 'closed'] },
      },
    };
    const result = convertJsonSchemaToParams(schema);
    expect(result.status.enum).toEqual(['open', 'closed']);
  });

  it('handles complex types by falling back to string with schema in description', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        tags: { type: 'array', description: 'Tag list', items: { type: 'string' } },
      },
    };
    const result = convertJsonSchemaToParams(schema);
    expect(result.tags.type).toBe('string');
    expect(result.tags.description).toContain('Tag list');
    expect(result.tags.description).toContain('array');
  });

  it('returns empty params for schema with no properties', () => {
    const schema = { type: 'object' as const };
    const result = convertJsonSchemaToParams(schema);
    expect(result).toEqual({});
  });

  it('handles missing description gracefully', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        id: { type: 'string' },
      },
    };
    const result = convertJsonSchemaToParams(schema);
    expect(result.id.description).toBe('');
  });
});
