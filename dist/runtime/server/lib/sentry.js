export async function captureBugInSentry(args) {
  const Sentry = await import("@sentry/node").catch(() => null);
  if (!Sentry) {
    console.warn("[feedback] @sentry/node is not installed \u2014 cannot capture bug via Sentry");
    return false;
  }
  if (typeof Sentry.isInitialized === "function" && !Sentry.isInitialized()) {
    console.warn("[feedback] Sentry is not initialised in this process \u2014 falling back");
    return false;
  }
  const name = args.user?.name;
  const email = args.user?.email || args.email;
  try {
    if (typeof Sentry.captureFeedback === "function") {
      Sentry.captureFeedback({
        message: args.message,
        name,
        email,
        url: args.context?.url,
        tags: {
          feedbackType: "bug",
          ...args.context?.app ? { app: args.context.app } : {}
        }
      });
    } else {
      if (args.user) {
        Sentry.setUser({ id: args.user.id, email, username: name });
      }
      Sentry.captureMessage(args.message, {
        level: "warning",
        tags: { feedbackType: "bug" }
      });
    }
    if (typeof Sentry.flush === "function") {
      await Sentry.flush(2e3);
    }
    return true;
  } catch (error) {
    console.error("[feedback] Sentry capture failed", error);
    return false;
  }
}
