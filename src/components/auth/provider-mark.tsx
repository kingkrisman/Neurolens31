/**
 * Provider marks for the sign-in buttons.
 *
 * Drawn inline rather than fetched, because a sign-in button whose logo has not
 * loaded yet is a button nobody trusts — and these are the moment a reader
 * decides whether this app is real. Each is the provider's own mark at its own
 * colours; Apple's is a single path so it takes the button's text colour and
 * works on either theme.
 */
export function ProviderMark({ idp, className = "size-5" }: { idp: string; className?: string }) {
  if (idp === "google") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={className} focusable="false">
        <path
          fill="#4285F4"
          d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.87Z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.95H1.26v3.09A12 12 0 0 0 12 24Z"
        />
        <path
          fill="#FBBC05"
          d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.26a12 12 0 0 0 0 10.76l4.01-3.09Z"
        />
        <path
          fill="#EA4335"
          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.18 15.24 0 12 0A12 12 0 0 0 1.26 6.62l4.01 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
        />
      </svg>
    );
  }

  if (idp === "apple") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={className} focusable="false" fill="currentColor">
        <path d="M17.05 12.53c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.61-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.75-.78-2.87-.76-1.48.02-2.84.86-3.6 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.25 2.75 2.2 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.71.71 2.87.69 1.19-.02 1.94-1.08 2.66-2.14.84-1.23 1.19-2.42 1.21-2.48-.03-.01-2.32-.89-2.34-3.5ZM14.9 5.1c.61-.74 1.02-1.77.91-2.8-.88.04-1.94.59-2.57 1.32-.56.65-1.05 1.7-.92 2.7.98.08 1.98-.5 2.58-1.22Z" />
      </svg>
    );
  }

  if (idp === "twitter") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={className} focusable="false" fill="currentColor">
        <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.82l4.71 6.23 5.46-6.23Zm-1.16 17.52h1.83L7.01 4.13H5.04l12.04 15.64Z" />
      </svg>
    );
  }

  // An upstream added to the broker before it was given a mark here: the button
  // still works, it just leads with its initial.
  return (
    <span aria-hidden className={`grid place-items-center rounded-full bg-fg/10 text-[11px] font-semibold ${className}`}>
      {idp.charAt(0).toUpperCase()}
    </span>
  );
}
