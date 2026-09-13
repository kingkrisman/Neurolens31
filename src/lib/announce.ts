type Listener = (message: string) => void;

const listeners = new Set<Listener>();

/** Politely announce a status to assistive tech without moving focus (WCAG 4.1.3). */
export function announce(message: string) {
  const text = message.replace(/\s+/g, " ").trim();
  if (!text) return;
  for (const listener of listeners) listener(text);
}

export function subscribeAnnounce(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
