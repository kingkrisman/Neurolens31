import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAX_UPLOAD_BYTES, processDocument } from "./document-processor.ts";

describe("processDocument", () => {
  it("reads a plain text file without touching PDF.js", async () => {
    const file = new File(["The quick brown fox reads the page."], "notes.txt", { type: "text/plain" });
    const doc = await processDocument(file);
    assert.equal(doc.metadata.format, "TXT");
    assert.equal(doc.title, "notes");
    assert.match(doc.content, /quick brown fox/);
    assert.equal(doc.metadata.wordCount, 7);
    assert.equal(doc.metadata.estimatedReadTime, 1);
  });

  it("reads markdown by extension even when the MIME type is empty", async () => {
    const file = new File(["# Heading\n\nA short paragraph."], "essay.md");
    assert.equal(file.type, "");
    const doc = await processDocument(file);
    assert.equal(doc.metadata.format, "MD");
    assert.equal(doc.title, "essay");
    assert.match(doc.content, /Heading/);
  });

  it("treats a text MIME type without an extension as text", async () => {
    const file = new File(["just words"], "untitled", { type: "text/plain" });
    const doc = await processDocument(file);
    assert.equal(doc.metadata.format, "TXT");
    assert.equal(doc.content, "just words");
  });

  it("rejects unsupported formats with a clear error", async () => {
    const file = new File(["PK"], "slides.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    await assert.rejects(() => processDocument(file), /Unsupported file format/);
  });

  it("does not crash when File.type is missing on a .txt name", async () => {
    const file = new File(["hello there"], "plain.txt");
    const doc = await processDocument(file);
    assert.equal(doc.content, "hello there");
  });

  it("rejects an empty text file instead of opening a blank page", async () => {
    const file = new File(["   \n"], "blank.txt", { type: "text/plain" });
    await assert.rejects(() => processDocument(file), /empty/i);
  });

  it("caps uploads at 20 MB", () => {
    assert.equal(MAX_UPLOAD_BYTES, 20 * 1024 * 1024);
  });

  it("rejects a file that reports a size over the ceiling", async () => {
    const file = new File(["tiny"], "huge.txt", { type: "text/plain" });
    Object.defineProperty(file, "size", { value: MAX_UPLOAD_BYTES + 1 });
    await assert.rejects(() => processDocument(file), /20 MB/);
  });
});
