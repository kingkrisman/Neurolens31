/**
 * Keeps a site's own code working around the bold word starts.
 *
 * Runs in the page's world, not the extension's, on sites the reader switched
 * on. Bold word starts put a site's text node inside a wrapper — the node
 * itself, kept hidden beside the bold copy (see content.ts), so the site still
 * holds the node it made. App-like sites (X, Facebook, Instagram, anything
 * built with React and its kin) later remove that node or insert next to it
 * by asking its old parent, which no longer holds it, and the browser throws —
 * the same fault that makes Google Translate crash such sites.
 *
 * These two methods are taught one thing: a node inside one of our wrappers
 * stands where the wrapper stands. Removing it removes the wrapper (the
 * site's text was going away anyway); inserting before it inserts before the
 * wrapper. Every other call passes through untouched.
 */

declare global {
  interface Window {
    __nlGuard?: boolean;
  }
}

if (!window.__nlGuard) {
  window.__nlGuard = true;

  /** The wrapper standing in for a node, if the node is inside one. */
  const standIn = (node: Node | null): Node | null => {
    const holder = node?.parentNode;
    if (!holder || holder.nodeName !== "NL-ORIG") return null;
    const wrapper = holder.parentNode;
    return wrapper && wrapper.nodeName === "NL-TEXT" ? wrapper : null;
  };

  const removeChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child && child.parentNode !== this) {
      const wrapper = standIn(child);
      if (wrapper && wrapper.parentNode === this) {
        removeChild.call(this, wrapper);
        return child;
      }
    }
    return removeChild.call(this, child) as T;
  };

  const insertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(this: Node, node: T, before: Node | null): T {
    if (before && before.parentNode !== this) {
      const wrapper = standIn(before);
      if (wrapper && wrapper.parentNode === this) return insertBefore.call(this, node, wrapper) as T;
    }
    return insertBefore.call(this, node, before) as T;
  };
}

export {};
