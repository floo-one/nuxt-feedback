import { defineEventHandler, readValidatedBody, setResponseStatus } from "h3";
import { z } from "zod";
import { useRuntimeConfig } from "#imports";
import resolveUser from "#feedback/resolve-user";
import { createGitHubIssue } from "../lib/github.js";
import { captureBugInSentry } from "../lib/sentry.js";
const bodySchema = z.object({
  type: z.enum(["bug", "feature", "feedback"]),
  message: z.string().trim().min(1, "Message is required").max(5e3, "Message is too long"),
  email: z.union([z.literal(""), z.email()]).optional(),
  context: z.object({
    url: z.string().optional(),
    userAgent: z.string().optional(),
    app: z.string().optional(),
    ts: z.string().optional()
  }).partial().optional()
});
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse);
  const config = useRuntimeConfig(event);
  const feedback = config.feedback;
  const token = config.githubToken;
  const user = await resolveUser(event).catch((error) => {
    console.error("[feedback] resolveUser threw; treating as anonymous", error);
    return null;
  });
  const email = body.email || void 0;
  try {
    if (body.type === "bug") {
      const captured = feedback.sentry ? await captureBugInSentry({ message: body.message, email, user, context: body.context }) : false;
      if (captured) {
        return { ok: true, channel: "sentry" };
      }
      console.warn("[feedback] bug route falling back to GitHub issue");
      await createGitHubIssue({
        repo: feedback.github.repo,
        token,
        type: "bug",
        message: body.message,
        label: feedback.github.labels.bug,
        email,
        user,
        context: body.context
      });
      return { ok: true, channel: "github", fallback: true };
    }
    const label = body.type === "feature" ? feedback.github.labels.feature : feedback.github.labels.feedback;
    await createGitHubIssue({
      repo: feedback.github.repo,
      token,
      type: body.type,
      message: body.message,
      label,
      email,
      user,
      context: body.context
    });
    return { ok: true, channel: "github" };
  } catch (error) {
    console.error("[feedback] delivery failed", error);
    setResponseStatus(event, 502);
    return { ok: false };
  }
});
