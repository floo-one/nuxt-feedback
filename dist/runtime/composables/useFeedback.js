import { useState } from "#imports";
export function useFeedback() {
  const isOpen = useState("floo-feedback:open", () => false);
  const type = useState("floo-feedback:type", () => "bug");
  function open(initialType) {
    if (initialType) {
      type.value = initialType;
    }
    isOpen.value = true;
  }
  function close() {
    isOpen.value = false;
  }
  function submit(payload) {
    return $fetch("/api/__feedback", {
      method: "POST",
      body: payload
    });
  }
  return { isOpen, type, open, close, submit };
}
