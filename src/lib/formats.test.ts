import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decodeEntities,
  epubTitle,
  opfPathFrom,
  resolveHref,
  spineOrder,
  textFromDocxXml,
  textFromHtml,
  textFromRtf,
  tidy,
} from "./formats.ts";

describe("decodeEntities", () => {
  it("decodes the named five", () => {
    assert.equal(decodeEntities("a &lt;b&gt; &quot;c&quot; &apos;d&apos;"), `a <b> "c" 'd'`);
  });

  it("decodes numeric and hex escapes", () => {
    assert.equal(decodeEntities("caf&#233; &#x2014; bar"), "café — bar");
  });

  it("decodes the ampersand last", () => {
    // &amp;lt; is a literal "&lt;", not a "<". Decoding & first would produce
    // the wrong character and silently corrupt any text about markup.
    assert.equal(decodeEntities("&amp;lt;"), "&lt;");
  });

  it("drops an out-of-range code point rather than throwing", () => {
    assert.doesNotThrow(() => decodeEntities("&#1114112;"));
    assert.equal(decodeEntities("a&#1114112;b"), "ab");
  });
});

describe("textFromHtml", () => {
  it("keeps the words and drops the tags", () => {
    assert.equal(textFromHtml("<p>Hello <em>there</em>.</p>"), "Hello there.");
  });

  it("does not put a space inside a word split by a tag", () => {
    // <em>word</em>s is one word; spacing tags out would make it two.
    assert.equal(textFromHtml("<p>a <b>word</b>s end</p>"), "a words end");
  });

  it("separates paragraphs with a blank line", () => {
    assert.equal(textFromHtml("<p>One.</p><p>Two.</p>"), "One.\n\nTwo.");
  });

  it("treats a line break as a single newline", () => {
    assert.equal(textFromHtml("<p>One<br>Two</p>"), "One\nTwo");
  });

  it("throws away scripts and styles entirely", () => {
    const html = "<style>p{color:red}</style><script>alert(1)</script><p>Real text.</p>";
    assert.equal(textFromHtml(html), "Real text.");
  });

  it("throws away comments", () => {
    assert.equal(textFromHtml("<p>A<!-- hidden -->B</p>"), "AB");
  });

  it("never builds a node, so a script cannot run", () => {
    // Regex-only by design: this also parses EPUB chapters, which are files
    // from a stranger's zip.
    assert.ok(!textFromHtml("<img src=x onerror=alert(1)>").includes("alert"));
  });

  it("decodes entities in the text it keeps", () => {
    assert.equal(textFromHtml("<p>Caf&eacute;? No &mdash; caf&#233;.</p>"), "Café? No — café.");
  });

  it("returns nothing for markup with no prose", () => {
    assert.equal(textFromHtml("<div><span></span></div>"), "");
  });
});

describe("textFromDocxXml", () => {
  it("joins the runs of one paragraph without gaps", () => {
    // Word splits a sentence at every formatting change; joining with spaces
    // would put one inside "formatting".
    const xml = "<w:p><w:r><w:t>Format</w:t></w:r><w:r><w:t>ting</w:t></w:r></w:p>";
    assert.equal(textFromDocxXml(xml), "Formatting");
  });

  it("separates paragraphs with a blank line", () => {
    const xml = "<w:p><w:r><w:t>One.</w:t></w:r></w:p><w:p><w:r><w:t>Two.</w:t></w:r></w:p>";
    assert.equal(textFromDocxXml(xml), "One.\n\nTwo.");
  });

  it("honours a break inside a paragraph", () => {
    const xml = "<w:p><w:r><w:t>A</w:t><w:br/><w:t>B</w:t></w:r></w:p>";
    assert.equal(textFromDocxXml(xml), "A\nB");
  });

  it("turns a tab into a space", () => {
    const xml = "<w:p><w:r><w:t>A</w:t><w:tab/><w:t>B</w:t></w:r></w:p>";
    assert.equal(textFromDocxXml(xml), "A B");
  });

  it("keeps attributes on w:t from leaking into the text", () => {
    const xml = '<w:p><w:r><w:t xml:space="preserve">Hello </w:t><w:t>there</w:t></w:r></w:p>';
    assert.equal(textFromDocxXml(xml), "Hello there");
  });

  it("returns nothing for a document with no paragraphs", () => {
    assert.equal(textFromDocxXml("<w:document></w:document>"), "");
  });
});

describe("textFromRtf", () => {
  it("reads plain content", () => {
    assert.equal(textFromRtf("{\\rtf1\\ansi Hello there.}"), "Hello there.");
  });

  it("breaks paragraphs on \\par", () => {
    assert.equal(textFromRtf("{\\rtf1 One.\\par Two.}"), "One.\n\nTwo.");
  });

  it("drops the font and colour tables", () => {
    const rtf = "{\\rtf1{\\fonttbl{\\f0 Times New Roman;}}{\\colortbl;\\red0\\green0\\blue0;}Body text.}";
    assert.equal(textFromRtf(rtf), "Body text.");
  });

  it("drops a metadata group marked skippable", () => {
    assert.equal(textFromRtf("{\\rtf1{\\*\\generator Word}Real.}"), "Real.");
  });

  it("decodes a hex escape", () => {
    assert.equal(textFromRtf("{\\rtf1 caf\\'e9.}"), "café.");
  });

  it("decodes a unicode escape and discards its fallback", () => {
    assert.equal(textFromRtf("{\\rtf1 a\\u8212?b}"), "a—b");
  });

  it("unescapes a literal brace", () => {
    assert.equal(textFromRtf("{\\rtf1 a\\{b\\}c}"), "a{b}c");
  });

  it("does not leave control words in the prose", () => {
    assert.ok(!textFromRtf("{\\rtf1\\ansi\\deff0\\fs24 Text.}").includes("\\"));
  });
});

describe("spineOrder", () => {
  const opf = `
    <package>
      <manifest>
        <item id="c2" href="text/ch2.xhtml"/>
        <item id="c1" href="text/ch1.xhtml"/>
        <item id="css" href="style.css"/>
      </manifest>
      <spine>
        <itemref idref="c1"/>
        <itemref idref="c2"/>
      </spine>
    </package>`;

  it("returns chapters in reading order, not zip order", () => {
    // The zip lists ch2 first here; the spine is the only thing that knows.
    assert.deepEqual(spineOrder(opf), ["text/ch1.xhtml", "text/ch2.xhtml"]);
  });

  it("ignores manifest items the spine does not reference", () => {
    assert.ok(!spineOrder(opf).includes("style.css"));
  });

  it("skips an itemref pointing at nothing", () => {
    const broken = opf.replace('idref="c2"', 'idref="missing"');
    assert.deepEqual(spineOrder(broken), ["text/ch1.xhtml"]);
  });

  it("returns nothing for a package with no spine", () => {
    assert.deepEqual(spineOrder("<package></package>"), []);
  });
});

describe("resolveHref", () => {
  it("resolves against the package document's folder", () => {
    assert.equal(resolveHref("OEBPS/content.opf", "text/ch1.xhtml"), "OEBPS/text/ch1.xhtml");
  });

  it("handles a package document at the zip root", () => {
    assert.equal(resolveHref("content.opf", "ch1.xhtml"), "ch1.xhtml");
  });

  it("walks up a relative path", () => {
    assert.equal(resolveHref("OEBPS/text/content.opf", "../images/../ch1.xhtml"), "OEBPS/ch1.xhtml");
  });

  it("drops a fragment", () => {
    assert.equal(resolveHref("OEBPS/content.opf", "ch1.xhtml#part2"), "OEBPS/ch1.xhtml");
  });
});

describe("opfPathFrom", () => {
  it("finds the package document", () => {
    const xml = `<container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="x"/></rootfiles></container>`;
    assert.equal(opfPathFrom(xml), "OEBPS/content.opf");
  });

  it("returns null when there is none", () => {
    assert.equal(opfPathFrom("<container></container>"), null);
  });
});

describe("epubTitle", () => {
  it("takes the title the book gives itself", () => {
    assert.equal(epubTitle("<metadata><dc:title>Hoax</dc:title></metadata>"), "Hoax");
  });

  it("returns null rather than an empty string", () => {
    assert.equal(epubTitle("<metadata><dc:title>  </dc:title></metadata>"), null);
    assert.equal(epubTitle("<metadata></metadata>"), null);
  });
});

describe("tidy", () => {
  it("collapses runs of blank lines to one break", () => {
    assert.equal(tidy("A\n\n\n\n\nB"), "A\n\nB");
  });

  it("normalises Windows line endings", () => {
    assert.equal(tidy("A\r\n\r\nB"), "A\n\nB");
  });

  it("leaves a single paragraph break intact, because pagination needs it", () => {
    assert.equal(tidy("A\n\nB"), "A\n\nB");
  });
});

describe("named entities", () => {
  it("decodes the punctuation a typesetter uses", () => {
    assert.equal(decodeEntities("one &mdash; two &hellip; &lsquo;three&rsquo;"), "one — two … ‘three’");
  });

  it("keeps case, because &Auml; and &auml; are different letters", () => {
    assert.equal(decodeEntities("&Auml; &auml;"), "Ä ä");
  });

  it("leaves an unknown name alone rather than eating it", () => {
    // Better a visible blemish than a silently deleted word.
    assert.equal(decodeEntities("a &notanentity; b"), "a &notanentity; b");
  });

  it("still decodes the ampersand last", () => {
    assert.equal(decodeEntities("&amp;mdash;"), "&mdash;");
  });
});
