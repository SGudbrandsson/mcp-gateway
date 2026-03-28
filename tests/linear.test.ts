import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { linearAdapter } from '../src/services/linear.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockLinearResponse(data: unknown) {
  return {
    ok: true,
    json: async () => ({ data }),
    text: async () => JSON.stringify({ data }),
  };
}

function mockLinearError(status: number, message: string) {
  return {
    ok: false,
    status,
    text: async () => JSON.stringify({ errors: [{ message }] }),
  };
}

const config = { token: 'test-token' };

describe('Linear adapter', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has expected actions', () => {
    const names = linearAdapter.actions.map((a) => a.name);
    expect(names).toContain('search_issues');
    expect(names).toContain('get_issue');
    expect(names).toContain('create_issue');
    expect(names).toContain('update_issue');
    expect(names).toContain('delete_issue');
    expect(names).toContain('list_teams');
    expect(names).toContain('list_projects');
    expect(names).toContain('list_workflow_states');
    expect(names).toContain('add_comment');
    expect(names).toContain('list_labels');
  });

  describe('search_issues', () => {
    const action = linearAdapter.actions.find((a) => a.name === 'search_issues')!;

    it('searches issues by query', async () => {
      mockFetch.mockResolvedValueOnce(mockLinearResponse({
        issueSearch: { nodes: [{ id: '1', title: 'Bug' }] },
      }));
      const result = await action.execute({ query: 'login bug' }, config);
      expect(result).toEqual({ issueSearch: { nodes: [{ id: '1', title: 'Bug' }] } });

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('https://api.linear.app/graphql');
      expect(call[1].method).toBe('POST');
      expect(call[1].headers.Authorization).toBe('Bearer test-token');
      const body = JSON.parse(call[1].body);
      expect(body.variables.query).toBe('login bug');
    });

    it('throws on missing token', async () => {
      await expect(action.execute({ query: 'test' }, {})).rejects.toThrow('Linear token not configured');
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce(mockLinearError(401, 'Unauthorized'));
      await expect(action.execute({ query: 'test' }, config)).rejects.toThrow('Linear API 401');
    });

    it('uses custom baseUrl when configured', async () => {
      mockFetch.mockResolvedValueOnce(mockLinearResponse({ issueSearch: { nodes: [] } }));
      await action.execute({ query: 'test' }, { ...config, baseUrl: 'https://linear.example.com' });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toBe('https://linear.example.com/graphql');
    });
  });

  describe('get_issue', () => {
    const action = linearAdapter.actions.find((a) => a.name === 'get_issue')!;

    it('fetches an issue by identifier', async () => {
      mockFetch.mockResolvedValueOnce(mockLinearResponse({
        issue: { id: '1', title: 'Bug', identifier: 'ENG-123' },
      }));
      const result = await action.execute({ issue_id: 'ENG-123' }, config);
      expect(result).toEqual({ issue: { id: '1', title: 'Bug', identifier: 'ENG-123' } });
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.variables.id).toBe('ENG-123');
    });
  });

  describe('create_issue', () => {
    const action = linearAdapter.actions.find((a) => a.name === 'create_issue')!;

    it('creates an issue', async () => {
      mockFetch.mockResolvedValueOnce(mockLinearResponse({
        issueCreate: { success: true, issue: { id: '1', title: 'New bug' } },
      }));
      await action.execute({ title: 'New bug', team_id: 'team-1', priority: '2' }, config);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.variables.input.title).toBe('New bug');
      expect(body.variables.input.teamId).toBe('team-1');
      expect(body.variables.input.priority).toBe(2);
    });
  });

  describe('update_issue', () => {
    const action = linearAdapter.actions.find((a) => a.name === 'update_issue')!;

    it('updates an issue', async () => {
      mockFetch.mockResolvedValueOnce(mockLinearResponse({
        issueUpdate: { success: true, issue: { id: '1', title: 'Updated' } },
      }));
      await action.execute({ issue_id: 'issue-1', title: 'Updated', priority: '1' }, config);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.variables.id).toBe('issue-1');
      expect(body.variables.input.title).toBe('Updated');
      expect(body.variables.input.priority).toBe(1);
    });
  });

  describe('delete_issue', () => {
    const action = linearAdapter.actions.find((a) => a.name === 'delete_issue')!;

    it('archives an issue', async () => {
      mockFetch.mockResolvedValueOnce(mockLinearResponse({
        issueArchive: { success: true },
      }));
      await action.execute({ issue_id: 'issue-1' }, config);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.variables.id).toBe('issue-1');
      expect(body.query).toContain('issueArchive');
    });
  });

  describe('list_teams', () => {
    const action = linearAdapter.actions.find((a) => a.name === 'list_teams')!;

    it('lists all teams', async () => {
      mockFetch.mockResolvedValueOnce(mockLinearResponse({
        teams: { nodes: [{ id: '1', name: 'Engineering' }] },
      }));
      const result = await action.execute({}, config);
      expect(result).toEqual({ teams: { nodes: [{ id: '1', name: 'Engineering' }] } });
    });
  });

  describe('list_projects', () => {
    const action = linearAdapter.actions.find((a) => a.name === 'list_projects')!;

    it('lists all projects', async () => {
      mockFetch.mockResolvedValueOnce(mockLinearResponse({
        projects: { nodes: [{ id: '1', name: 'Project A' }] },
      }));
      const result = await action.execute({}, config);
      expect(result).toEqual({ projects: { nodes: [{ id: '1', name: 'Project A' }] } });
    });
  });

  describe('list_workflow_states', () => {
    const action = linearAdapter.actions.find((a) => a.name === 'list_workflow_states')!;

    it('lists workflow states for a team', async () => {
      mockFetch.mockResolvedValueOnce(mockLinearResponse({
        workflowStates: { nodes: [{ id: '1', name: 'In Progress', type: 'started' }] },
      }));
      const result = await action.execute({ team_id: 'team-1' }, config);
      expect(result).toEqual({ workflowStates: { nodes: [{ id: '1', name: 'In Progress', type: 'started' }] } });
    });
  });

  describe('add_comment', () => {
    const action = linearAdapter.actions.find((a) => a.name === 'add_comment')!;

    it('adds a comment to an issue', async () => {
      mockFetch.mockResolvedValueOnce(mockLinearResponse({
        commentCreate: { success: true, comment: { id: 'c1', body: 'Fixed' } },
      }));
      await action.execute({ issue_id: 'issue-1', body: 'Fixed' }, config);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.variables.input.issueId).toBe('issue-1');
      expect(body.variables.input.body).toBe('Fixed');
    });
  });

  describe('list_labels', () => {
    const action = linearAdapter.actions.find((a) => a.name === 'list_labels')!;

    it('lists all labels', async () => {
      mockFetch.mockResolvedValueOnce(mockLinearResponse({
        issueLabels: { nodes: [{ id: '1', name: 'Bug', color: '#red' }] },
      }));
      const result = await action.execute({}, config);
      expect(result).toEqual({ issueLabels: { nodes: [{ id: '1', name: 'Bug', color: '#red' }] } });
    });
  });
});
