import type { FeedbackContext, ResolvedUser } from '../../types.js';
export interface CaptureBugArgs {
    message: string;
    email?: string;
    user: ResolvedUser | null;
    context?: FeedbackContext;
}
/**
 * Forward a bug report to the host's server-side Sentry SDK.
 *
 * `@sentry/node` is an OPTIONAL peer dependency: it is imported lazily and
 * guarded, so a host without Sentry (or with it disabled) degrades gracefully.
 * Returns `true` when the report was captured, `false` when the caller should
 * fall back to another channel (e.g. a GitHub issue).
 */
export declare function captureBugInSentry(args: CaptureBugArgs): Promise<boolean>;
