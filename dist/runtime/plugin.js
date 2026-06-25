import { createVNode, render } from "vue";
import { defineNuxtPlugin } from "#app";
import FeedbackDialog from "./components/FeedbackDialog.vue";
export default defineNuxtPlugin((nuxtApp) => {
  const config = nuxtApp.$config.public.feedback;
  if (config?.enabled === false) {
    return;
  }
  nuxtApp.hook("app:mounted", () => {
    if (document.getElementById("floo-feedback-root")) {
      return;
    }
    const el = document.createElement("div");
    el.id = "floo-feedback-root";
    document.body.appendChild(el);
    const vnode = createVNode(FeedbackDialog);
    vnode.appContext = nuxtApp.vueApp._context;
    render(vnode, el);
  });
});
