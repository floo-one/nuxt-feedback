import type { FeedbackContext, FeedbackType, ResolvedUser } from '../../types.js';
export interface CreateIssueArgs {
    repo: string;
    token: string;
    type: FeedbackType;
    message: string;
    label: string;
    email?: string;
    user: ResolvedUser | null;
    context?: FeedbackContext;
}
export declare function buildTitle(type: FeedbackType, message: string): string;
export declare function buildReporter(user: ResolvedUser | null, email?: string): string;
interface GitHubIssueResponse {
    number: number;
    html_url: string;
}
/**
 * Create a GitHub issue via the REST API using a raw `$fetch` call.
 * Throws on missing config or a failed request — the caller maps that to a
 * clean `{ ok: false }` response without leaking provider internals.
 */
export declare function createGitHubIssue(args: CreateIssueArgs): Promise<GitHubIssueResponse>;
export {};
