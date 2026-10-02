import ReactMarkdown from "react-markdown";

/**
 * A post's body, from Markdown.
 *
 * react-markdown never renders raw HTML, and its default URL filter drops
 * `javascript:` links — so even a post pasted from somewhere careless cannot
 * carry a script onto the site. Links that leave the site open in a new tab;
 * pictures load lazily so a long post does not fetch every image up front.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      components={{
        a: ({ href = "", children: label }) => {
          const external = /^https?:\/\//.test(href) && !/^https?:\/\/(www\.)?neurolens\.space/.test(href);
          return (
            <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
              {label}
            </a>
          );
        },
        img: ({ src = "", alt = "" }) => (
          <img
            src={typeof src === "string" ? src : ""}
            alt={alt}
            loading="lazy"
            decoding="async"
            className="my-6 w-full rounded-2xl bg-fg/5 shadow-border"
          />
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
