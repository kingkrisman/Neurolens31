export type BlockKind = "title" | "kicker" | "lead" | "heading" | "body" | "list" | "quote";

export interface ListItem {
  marker: string;
  text: string;
}

export interface DocBlock {
  kind: BlockKind;
  text?: string;
  items?: ListItem[];
  ordered?: boolean;
}

const BULLET = /^(?:[•●◦▪▫]|[-–—*])\s+/;
const NUMBERED = /^(\d{1,3}|[ivxlcdm]{1,5})[.)]\s+/i;
const QUOTE = /^(?:>\s+|["“«]).+/;
const KICKER =
  /^(preface|introduction|foreword|prologue|epilogue|contents|acknowledgments?|dedication|afterword|note|opening)\.?$/i;

function stripBullet(line: string): ListItem {
  const bullet = line.match(BULLET);
  if (bullet) return { marker: bullet[0].trim(), text: line.slice(bullet[0].length).trim() };
  const numbered = line.match(NUMBERED);
  if (numbered) return { marker: numbered[0].trim(), text: line.slice(numbered[0].length).trim() };
  return { marker: "", text: line };
}

function isHeadingLike(line: string): boolean {
  const t = line.trim();
  if (t.length < 2 || t.length > 72) return false;
  if (BULLET.test(t) || NUMBERED.test(t)) return false;
  if ((t.match(/[.!?]/g) ?? []).length > 1) return false;
  if (/[.!?]$/.test(t) && t.length > 42) return false;
  const words = t.split(/\s+/);
  if (words.length > 12) return false;
  const titled = words.filter((word) => /^[A-Z0-9“"]/.test(word)).length;
  return titled >= Math.ceil(words.length * 0.55) || t === t.toUpperCase();
}

function isQuote(line: string): boolean {
  const t = line.trim();
  if (t.startsWith("> ")) return true;
  if (!QUOTE.test(t)) return false;
  if (t.length < 40) return false;
  return !/\b(said|asked|replied|cried|whispered)\b/i.test(t);
}

function splitNumberedBlob(text: string): ListItem[] | null {
  const re = /(?:^|\s)(\d{1,2})[.)]\s+(?=[A-Z])/g;
  const starts: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const at = match[0].startsWith(" ") ? match.index + 1 : match.index;
    starts.push(at);
  }
  if (starts.length < 2) return null;
  const items: ListItem[] = [];
  for (let i = 0; i < starts.length; i += 1) {
    const chunk = text.slice(starts[i], starts[i + 1]).trim();
    const parsed = stripBullet(chunk);
    if (parsed.text.length >= 8) items.push(parsed);
  }
  return items.length >= 2 ? items : null;
}

function chunksOf(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ").trim();
  if (!normalized) return [];
  if (normalized.includes("\n")) {
    return normalized
      .split(/\n\s*\n/)
      .map((chunk) => chunk.trim())
      .filter(Boolean);
  }
  return [normalized];
}

function classifyLone(text: string, seenLead: boolean, seenTitle: boolean): DocBlock {
  if (KICKER.test(text)) return { kind: "kicker", text };
  if (!seenTitle && isHeadingLike(text)) return { kind: "title", text };
  if (isQuote(text)) return { kind: "quote", text: text.replace(/^>\s+/, "") };
  if (isHeadingLike(text)) return { kind: "heading", text };
  if (!seenLead && text.split(/\s+/).length >= 12) return { kind: "lead", text };
  return { kind: "body", text };
}

export function parseBlocks(text: string): DocBlock[] {
  const chunks = chunksOf(text);
  const blocks: DocBlock[] = [];
  let list: { ordered: boolean; items: ListItem[] } | null = null;

  const flushList = () => {
    if (!list?.items.length) {
      list = null;
      return;
    }
    if (list.items.length === 1 && list.items[0].text.split(/\s+/).length > 18) {
      blocks.push({ kind: blocks.some((b) => b.kind === "lead") ? "body" : "lead", text: list.items[0].text });
    } else {
      blocks.push({ kind: "list", ordered: list.ordered, items: list.items });
    }
    list = null;
  };

  for (const chunk of chunks) {
    const lines = chunk
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const allList = lines.length >= 2 && lines.every((line) => BULLET.test(line) || NUMBERED.test(line));
    if (allList) {
      flushList();
      blocks.push({
        kind: "list",
        ordered: NUMBERED.test(lines[0] ?? ""),
        items: lines.map(stripBullet),
      });
      continue;
    }

    if (lines.length === 1 && (BULLET.test(lines[0]) || NUMBERED.test(lines[0]))) {
      const ordered = NUMBERED.test(lines[0]);
      const item = stripBullet(lines[0]);
      if (list && list.ordered === ordered) list.items.push(item);
      else {
        flushList();
        list = { ordered, items: [item] };
      }
      continue;
    }

    flushList();

    if (lines.length === 1) {
      const numbered = splitNumberedBlob(lines[0]);
      if (numbered) {
        const before = lines[0].slice(0, lines[0].indexOf(numbered[0].marker)).trim();
        if (before.split(/\s+/).length >= 8) {
          const seenLead = blocks.some((b) => b.kind === "lead" || b.kind === "body");
          const seenTitle = blocks.some((b) => b.kind === "title");
          blocks.push(classifyLone(before, seenLead, seenTitle));
        }
        blocks.push({ kind: "list", ordered: true, items: numbered });
        continue;
      }
    }

    const seenLead = blocks.some((b) => b.kind === "lead" || b.kind === "body");
    const seenTitle = blocks.some((b) => b.kind === "title");
    const joined = lines.join("\n");
    blocks.push(classifyLone(joined, seenLead, seenTitle));
  }
  flushList();

  if (blocks.length === 1 && blocks[0].kind === "title") {
    blocks[0] = { kind: "body", text: blocks[0].text };
  }
  return blocks;
}

export function isTitlePage(blocks: DocBlock[]): boolean {
  if (!blocks.length) return false;
  const words = blocks.reduce((sum, block) => {
    const source = block.items?.map((item) => item.text).join(" ") ?? block.text ?? "";
    return sum + source.split(/\s+/).filter(Boolean).length;
  }, 0);
  if (words > 140) return false;
  return blocks.every(
    (block) =>
      block.kind === "title" ||
      block.kind === "kicker" ||
      block.kind === "heading" ||
      ((block.text?.split(/\s+/).length ?? 99) < 18 && block.kind !== "list"),
  );
}

export function chapterRole(title: string): "front" | "contents" | "chapter" {
  if (/^(front matter|title page|opening)$/i.test(title)) return "front";
  if (/contents/i.test(title)) return "contents";
  if (/^(preface|introduction|foreword|dedication|acknowledgments?)$/i.test(title)) return "front";
  return "chapter";
}
