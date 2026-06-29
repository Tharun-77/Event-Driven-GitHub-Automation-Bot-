import { ExtractedFields, RuleLike } from './rule.types';

interface LabelLike {
  name?: string;
}

interface PayloadShape {
  issue?: IssueShape;
  pull_request?: IssueShape;
  head_commit?: { message?: string };
  pusher?: { name?: string };
  sender?: { login?: string };
}

interface IssueShape {
  title?: string;
  body?: string;
  user?: { login?: string };
  labels?: Array<string | LabelLike>;
}

function labelNames(labels: Array<string | LabelLike> | undefined): string[] {
  if (!Array.isArray(labels)) {
    return [];
  }
  return labels
    .map((l) => (typeof l === 'string' ? l : (l.name ?? '')))
    .filter((name) => name.length > 0);
}

/** Pulls the matchable fields out of a webhook payload for a given event type. */
export function extractFields(
  eventType: string,
  payload: PayloadShape,
): ExtractedFields {
  if (eventType === 'issues' && payload.issue) {
    return fromIssue(payload.issue);
  }
  if (eventType === 'pull_request' && payload.pull_request) {
    return fromIssue(payload.pull_request);
  }
  if (eventType === 'push') {
    return {
      title: payload.head_commit?.message ?? '',
      body: '',
      author: payload.pusher?.name ?? payload.sender?.login ?? '',
      labels: [],
    };
  }
  return { title: '', body: '', author: '', labels: [] };
}

function fromIssue(issue: IssueShape): ExtractedFields {
  return {
    title: issue.title ?? '',
    body: issue.body ?? '',
    author: issue.user?.login ?? '',
    labels: labelNames(issue.labels),
  };
}

/** True when the rule is enabled, applies to this event type, and matches. */
export function ruleMatches(
  rule: RuleLike,
  eventType: string,
  fields: ExtractedFields,
): boolean {
  if (!rule.enabled || rule.eventType !== eventType) {
    return false;
  }
  const needle = rule.matchValue.toLowerCase();

  if (rule.matchField === 'label') {
    return fields.labels.some((label) =>
      compare(label.toLowerCase(), needle, rule.matchOp),
    );
  }

  const haystack = (
    rule.matchField === 'title'
      ? fields.title
      : rule.matchField === 'author'
        ? fields.author
        : fields.body
  ).toLowerCase();

  return compare(haystack, needle, rule.matchOp);
}

function compare(haystack: string, needle: string, op: string): boolean {
  return op === 'equals' ? haystack === needle : haystack.includes(needle);
}
