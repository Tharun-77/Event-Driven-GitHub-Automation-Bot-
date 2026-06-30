import { extractFields, ruleMatches } from './rule-matcher';
import { RuleLike } from './rule.types';

const base: RuleLike = {
  eventType: 'issues',
  matchField: 'title',
  matchOp: 'contains',
  matchValue: 'bug',
  enabled: true,
};
const fields = {
  title: 'Login bug here',
  body: 'steps to reproduce',
  author: 'octocat',
  labels: ['urgent', 'p1'],
};

describe('ruleMatches', () => {
  it('matches title contains, case-insensitively', () => {
    expect(ruleMatches({ ...base, matchValue: 'Bug' }, 'issues', fields)).toBe(
      true,
    );
  });

  it('does not match when the keyword is absent', () => {
    expect(
      ruleMatches({ ...base, matchValue: 'crash' }, 'issues', fields),
    ).toBe(false);
  });

  it('matches author equals', () => {
    expect(
      ruleMatches(
        {
          ...base,
          matchField: 'author',
          matchOp: 'equals',
          matchValue: 'octocat',
        },
        'issues',
        fields,
      ),
    ).toBe(true);
  });

  it('matches a label equals against any label', () => {
    expect(
      ruleMatches(
        {
          ...base,
          matchField: 'label',
          matchOp: 'equals',
          matchValue: 'urgent',
        },
        'issues',
        fields,
      ),
    ).toBe(true);
  });

  it('never matches a disabled rule', () => {
    expect(ruleMatches({ ...base, enabled: false }, 'issues', fields)).toBe(
      false,
    );
  });

  it('never matches when the event type differs', () => {
    expect(ruleMatches(base, 'pull_request', fields)).toBe(false);
  });
});

describe('extractFields', () => {
  it('extracts issue fields including label names', () => {
    const f = extractFields('issues', {
      issue: {
        title: 'A bug',
        body: 'desc',
        user: { login: 'alice' },
        labels: [{ name: 'bug' }, { name: 'p2' }],
      },
    });
    expect(f).toEqual({
      title: 'A bug',
      body: 'desc',
      author: 'alice',
      labels: ['bug', 'p2'],
    });
  });

  it('extracts pull_request fields', () => {
    const f = extractFields('pull_request', {
      pull_request: {
        title: 'Fix',
        body: '',
        user: { login: 'bob' },
        labels: [],
      },
    });
    expect(f.title).toBe('Fix');
    expect(f.author).toBe('bob');
  });

  it('extracts push commit message as the title', () => {
    const f = extractFields('push', {
      head_commit: { message: 'chore: bump' },
      pusher: { name: 'carol' },
    });
    expect(f.title).toBe('chore: bump');
    expect(f.author).toBe('carol');
  });
});
