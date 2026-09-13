import { useEffect, useMemo, useState } from "react";
import type { ThemeId } from "@/lib/types";
import {
  SCHEME_TOKENS,
  describePair,
  formatContrastRatio,
  isHexColor,
  linearizeChannel,
  normalizeHex,
} from "@/lib/contrast";
import {
  CVD_HINTS,
  type CvdKind,
  simulateHex,
  simulatedContrast,
} from "@/lib/color-vision";
import { WCAG_22_READER, evaluatePairCriteria, evaluateTextSpacing, TEXT_SPACING_1_4_12 } from "@/lib/wcag";
import { useAppStore } from "@/lib/store";
import { Input, Label } from "@/components/ui/field";
import { Segmented } from "@/components/segmented";

function Level({ value }: { value: "fail" | "AA" | "AAA" | "pass" | "info" | boolean }) {
  if (value === true || value === "pass") return <span className="text-success">pass</span>;
  if (value === false || value === "fail") return <span className="text-danger">fail</span>;
  if (value === "info") return <span className="text-muted">note</span>;
  return <span>{value}</span>;
}

const CVD_OPTIONS: { id: CvdKind; label: string }[] = [
  { id: "none", label: "Typical" },
  { id: "protanopia", label: "Red-blind" },
  { id: "deuteranopia", label: "Green-blind" },
  { id: "tritanopia", label: "Blue-blind" },
];

function verdict(level: "fail" | "AA" | "AAA"): string {
  if (level === "AAA") return "Easy to read";
  if (level === "AA") return "Readable";
  return "Harder than recommended";
}

export function ContrastLab() {
  const profile = useAppStore((s) => s.profile);
  const cvd = useAppStore((s) => s.cvdPreview);
  const setCvd = useAppStore((s) => s.setCvdPreview);
  const tokens = SCHEME_TOKENS[profile.theme as ThemeId] ?? SCHEME_TOKENS.paper;
  const [fg, setFg] = useState(tokens.fg);
  const [bg, setBg] = useState(tokens.bg);

  useEffect(() => {
    setFg(tokens.fg);
    setBg(tokens.bg);
  }, [tokens.fg, tokens.bg]);

  const pair = useMemo(() => {
    if (!isHexColor(fg) || !isHexColor(bg)) return null;
    return describePair(fg, bg);
  }, [fg, bg]);

  const seenFg = pair ? simulateHex(pair.fg, cvd) : tokens.fg;
  const seenBg = pair ? simulateHex(pair.bg, cvd) : tokens.bg;
  const seenRatio = pair ? simulatedContrast(pair.fg, pair.bg, cvd) : 0;
  const spacing = evaluateTextSpacing(profile);
  const live = pair
    ? evaluatePairCriteria({
        ratio: pair.ratio,
        fontSizePx: profile.fontSize,
        cvd,
        fg: pair.fg,
        bg: pair.bg,
      })
    : [];
  const liveById = Object.fromEntries(live.map((row) => [row.id, row]));
  const seenLevel = seenRatio >= 7 ? "AAA" : seenRatio >= 4.5 ? "AA" : "fail";

  return (
    <div>
      <p className="text-sm leading-relaxed text-pretty text-muted">
        Check this pair. Changing rooms above updates the page. These boxes only test a pair.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="lab-fg">Ink</Label>
          <div className="mt-1 flex items-center gap-2">
            <span
              className="scheme-dot size-8 shrink-0 rounded-md"
              style={{ background: isHexColor(fg) ? normalizeHex(fg) : tokens.fg }}
            />
            <Input id="lab-fg" value={fg} onChange={(event) => setFg(event.target.value)} spellCheck={false} />
          </div>
        </div>
        <div>
          <Label htmlFor="lab-bg">Paper</Label>
          <div className="mt-1 flex items-center gap-2">
            <span
              className="scheme-dot size-8 shrink-0 rounded-md"
              style={{ background: isHexColor(bg) ? normalizeHex(bg) : tokens.bg }}
            />
            <Input id="lab-bg" value={bg} onChange={(event) => setBg(event.target.value)} spellCheck={false} />
          </div>
        </div>
      </div>

      {pair ? (
        <div className="mt-4 rounded-md px-4 py-5" style={{ background: seenBg, color: seenFg }}>
          <p className="text-lg font-medium">The quick brown fox reads the page.</p>
          <p className="mt-2 text-sm" style={{ color: seenFg, opacity: 0.8 }}>
            {verdict(seenLevel)} · {formatContrastRatio(seenRatio)}
            {cvd !== "none" ? " with this vision" : ""}
          </p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">Use six-digit hex, like #1c1611.</p>
      )}

      <div className="mt-5">
        <p className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Color vision</p>
        <Segmented
          value={cvd}
          onChange={setCvd}
          label="Color vision simulation"
          options={CVD_OPTIONS}
          className="h-9 w-full"
        />
        <p className="mt-2 text-xs leading-relaxed text-pretty text-muted">{CVD_HINTS[cvd]}</p>
      </div>

      {pair ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs tracking-wide text-muted uppercase">This pair</dt>
            <dd className="mt-1 font-medium">
              {verdict(pair.normal)} · {formatContrastRatio(pair.ratio)}
            </dd>
          </div>
          <div>
            <dt className="text-xs tracking-wide text-muted uppercase">Controls</dt>
            <dd className="mt-1 font-medium">
              <Level value={pair.ui} />
            </dd>
          </div>
        </dl>
      ) : null}

      <details className="mt-6">
        <summary className="cursor-pointer text-sm font-medium">How the score is counted</summary>
        <p className="mt-2 text-xs leading-relaxed text-pretty text-muted">
          Contrast is a luminance ratio, not a guess about how a color looks. Body text needs 4.5:1 for AA and 7:1
          for AAA.
        </p>
        {pair ? (
          <p className="mt-3 font-mono text-xs leading-relaxed text-muted">
            Ink L {pair.fgLum.toFixed(3)} · paper L {pair.bgLum.toFixed(3)}
            <br />
            ({Math.max(pair.fgLum, pair.bgLum).toFixed(3)} + 0.05) / ({Math.min(pair.fgLum, pair.bgLum).toFixed(3)} +
            0.05) = {pair.ratio.toFixed(2)}
            <br />
            Linear ink ({pair.fgRgb.map((c) => linearizeChannel(c).toFixed(3)).join(", ")})
          </p>
        ) : null}
      </details>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium">Checks on this page</summary>
        <p className="mt-2 text-xs leading-relaxed text-pretty text-muted">
          Contrast is three criteria. The rest is whether the page still works when color, space, or target size
          change.
        </p>
        <div className="mt-3 divide-y divide-border rounded-md bg-fg/4">
          {WCAG_22_READER.map((criterion) => {
            const liveRow = liveById[criterion.id];
            return (
              <div key={criterion.id} className="px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium">
                    <span className="font-mono text-xs text-muted">{criterion.id}</span>
                    <span className="mx-2">{criterion.name}</span>
                  </p>
                  {liveRow ? <Level value={liveRow.status} /> : <span className="text-xs text-muted">page</span>}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted">{criterion.summary}</p>
                {liveRow ? <p className="mt-1 text-xs leading-relaxed">{liveRow.detail}</p> : null}
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-pretty text-muted">
          Your spacing {spacing.lineHeight.toFixed(1)} / {TEXT_SPACING_1_4_12.lineHeight.toFixed(1)} line, letter{" "}
          {spacing.letterSpacingEm.toFixed(2)}em, word {spacing.wordSpacingEm.toFixed(2)}em. Reader controls are 44px.
        </p>
      </details>
    </div>
  );
}
