/**
 * Playground stand-in for a host's submit hook. A real host would notify Slack,
 * log to a database, or track the report for a "my reports" view here. It runs
 * server-side after the GitHub issue is filed, and must never need to succeed
 * for the submission to succeed — a throw is caught and ignored by the module.
 *
 * The `report`/`result` shapes mirror the `#feedback/on-submit` contract; a real
 * host can rely on that ambient module type instead of re-declaring it.
 */
export default async function onSubmit(
  report: { type: 'bug' | 'feature', message: string, app: string | null },
  result: { channel: 'github', issue: { number: number, url: string } },
): Promise<void> {
  console.log(
    `[playground] feedback filed #${result.issue.number} (${report.type})`,
    result.issue.url,
  )
}
