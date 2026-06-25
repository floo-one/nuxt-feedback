import { defineNuxtModule, createResolver, addComponent, addImports, addPlugin, addServerHandler, addTypeTemplate } from '@nuxt/kit';

const module$1 = defineNuxtModule({
  meta: {
    name: "@floo-one/nuxt-feedback",
    configKey: "feedback",
    compatibility: {
      nuxt: ">=4.0.0"
    }
  },
  defaults: {
    shortcut: "g-f",
    sentry: true,
    enabled: true,
    github: {
      repo: "",
      labels: {
        feature: "enhancement",
        feedback: "feedback"
      }
    }
  },
  setup(options, nuxt) {
    if (options.enabled === false) {
      return;
    }
    const resolver = createResolver(import.meta.url);
    nuxt.options.runtimeConfig.githubToken ??= "";
    const runtimeConfig = nuxt.options.runtimeConfig;
    runtimeConfig.feedback = {
      sentry: options.sentry !== false,
      github: {
        repo: options.github?.repo ?? "",
        labels: {
          bug: "bug",
          feature: options.github?.labels?.feature || "enhancement",
          feedback: options.github?.labels?.feedback || "feedback"
        }
      }
    };
    const appTitle = nuxt.options.app?.head?.title;
    nuxt.options.runtimeConfig.public.feedback = {
      shortcut: options.shortcut || "g-f",
      enabled: options.enabled ?? true,
      app: typeof appTitle === "string" && appTitle ? appTitle : void 0
    };
    addComponent({
      name: "FeedbackDialog",
      filePath: resolver.resolve("./runtime/components/FeedbackDialog.vue")
    });
    addImports({
      name: "useFeedback",
      from: resolver.resolve("./runtime/composables/useFeedback")
    });
    addPlugin({
      src: resolver.resolve("./runtime/plugin"),
      mode: "client"
    });
    addServerHandler({
      route: "/api/__feedback",
      method: "post",
      handler: resolver.resolve("./runtime/server/api/feedback.post")
    });
    const resolveUserCode = options.resolveUserPath ? `export { default } from ${JSON.stringify(
      createResolver(nuxt.options.rootDir).resolve(options.resolveUserPath)
    )}` : "export default async () => null";
    nuxt.hook("nitro:config", (nitroConfig) => {
      nitroConfig.virtual ||= {};
      nitroConfig.virtual["#feedback/resolve-user"] = resolveUserCode;
    });
    addTypeTemplate({
      filename: "types/floo-feedback-resolve-user.d.ts",
      getContents: () => [
        `declare module '#feedback/resolve-user' {`,
        `  import type { H3Event } from 'h3'`,
        `  const resolveUser: (event: H3Event) => Promise<{ id?: string, email?: string, name?: string } | null>`,
        `  export default resolveUser`,
        `}`,
        ``
      ].join("\n")
    });
  }
});

export { module$1 as default };
