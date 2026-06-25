const TYPE_PREFIX = {
  bug: "[Bug]",
  feature: "[Feature]",
  feedback: "[Feedback]"
};
export function buildTitle(type, message) {
  const firstLine = message.trim().split("\n")[0].trim();
  const truncated = firstLine.length > 80 ? `${firstLine.slice(0, 77)}\u2026` : firstLine;
  return `${TYPE_PREFIX[type]} ${truncated || "New report"}`;
}
export function buildReporter(user, email) {
  if (!user && !email) {
    return "anonymous";
  }
  const parts = [];
  if (user?.name) parts.push(user.name);
  const contact = user?.email || email;
  if (contact) parts.push(`<${contact}>`);
  if (user?.id) parts.push(`(id: ${user.id})`);
  return parts.join(" ") || "anonymous";
}
function buildBody(args) {
  const { message, user, email, context } = args;
  const lines = [
    message.trim(),
    "",
    "---",
    `**Reporter:** ${buildReporter(user, email)}`
  ];
  if (context?.app) lines.push(`**App:** ${context.app}`);
  if (context?.url) lines.push(`**URL:** ${context.url}`);
  if (context?.userAgent) lines.push(`**User agent:** ${context.userAgent}`);
  lines.push(`**Submitted:** ${context?.ts || (/* @__PURE__ */ new Date()).toISOString()}`);
  lines.push("", "_Filed via @floo-one/nuxt-feedback._");
  return lines.join("\n");
}
export async function createGitHubIssue(args) {
  const { repo, token } = args;
  if (!repo) {
    throw new Error("[feedback] github.repo is not configured");
  }
  if (!token) {
    throw new Error("[feedback] NUXT_GITHUB_TOKEN is not set");
  }
  return await $fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "floo-one-nuxt-feedback"
    },
    body: {
      title: buildTitle(args.type, args.message),
      body: buildBody(args),
      labels: args.label ? [args.label] : []
    }
  });
}
