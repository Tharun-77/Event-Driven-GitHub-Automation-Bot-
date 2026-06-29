export type EventType = 'issues' | 'pull_request' | 'push';
export type MatchField = 'title' | 'body' | 'author' | 'label';
export type MatchOp = 'contains' | 'equals';

export interface RuleActions {
  addLabel?: boolean;
  labelName?: string;
  postComment?: boolean;
  commentBody?: string;
  slackNotify?: boolean;
}

/** The rule fields the matcher needs (a subset of the persisted Rule). */
export interface RuleLike {
  eventType: string;
  matchField: string;
  matchOp: string;
  matchValue: string;
  enabled: boolean;
}

export interface ExtractedFields {
  title: string;
  body: string;
  author: string;
  labels: string[];
}
