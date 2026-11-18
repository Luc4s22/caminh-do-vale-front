const EVENT = "cdv:open-assistant";

/** Opens the floating assistant from anywhere (e.g. a button on the trip page), optionally asking right away. */
export function openAssistant(question?: string): void {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { question } }));
}

export function onOpenAssistant(handler: (question?: string) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<{ question?: string }>).detail?.question);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
