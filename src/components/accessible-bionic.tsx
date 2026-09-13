/**
 * Bionic fixation spans are a visual aid. Screen readers that honor inner
 * <span> boundaries will spell “T he” instead of “The”. Keep the styled HTML
 * for sighted reading and expose the original sentence to AT.
 */
export function AccessibleBionic({ text, html }: { text: string; html: string }) {
  if (!html.includes("<")) return text;
  return (
    <>
      <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />
      <span className="sr-only">{text}</span>
    </>
  );
}
