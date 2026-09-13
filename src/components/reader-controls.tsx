import { Lock, Maximize2, Unlock, X } from "lucide-react";
import { NAMED_PRESETS, READING_PROFILES, RHYTHM_CHOICES, type LockableSetting, type ReadingMode } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input, Label, Slider, Switch } from "@/components/ui/field";
import { Separator } from "@/components/ui/surfaces";
import { SchemePicker, ContrastMeter } from "@/components/scheme-picker";
import { FontPicker } from "@/components/font-picker";
import { PanelScroller } from "@/components/panel-scroller";
import { FIXATION_PRESETS, nearestFixationPreset } from "@/lib/bionic";
import { cn } from "@/lib/utils";
import { motionPermissionNeeded, requestMotionPermission } from "@/lib/device-motion";
import { useState } from "react";

const MODES: ReadingMode[] = ["default", "adhd", "dyslexia", "focus", "academic", "speed", "adaptive"];

const JUMP = [
  { id: "rc-mode", label: "Mode" },
  { id: "rc-type", label: "Type" },
  { id: "rc-color", label: "Color" },
  { id: "rc-guides", label: "Guides" },
  { id: "rc-pace", label: "Pace" },
] as const;

function LockToggle({ setting }: { setting: LockableSetting }) {
  const locked = useAppStore((s) => s.lockedSettings.includes(setting));
  const toggleLock = useAppStore((s) => s.toggleLock);
  return (
    <button
      type="button"
      className="icon-group shrink-0 text-subtle hover:text-fg"
      aria-label={locked ? "Unlock setting" : "Lock setting from Adaptive"}
      aria-pressed={locked}
      onClick={() => toggleLock(setting)}
    >
      {locked ? <Lock size={13} className="icon-motion icon-lift" /> : <Unlock size={13} className="icon-motion icon-lift" />}
    </button>
  );
}

function jumpTo(id: string) {
  const node = document.getElementById(id);
  const scroller = document.querySelector<HTMLElement>(".controls-scroll");
  if (!node || !scroller) return;
  const top = node.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 12;
  scroller.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

export function ReaderControls({ onClose }: { onClose: () => void }) {
  const mode = useAppStore((s) => s.mode);
  const profile = useAppStore((s) => s.profile);
  const setMode = useAppStore((s) => s.setMode);
  const setProfile = useAppStore((s) => s.setProfile);
  const autoScrolling = useAppStore((s) => s.autoScrolling);
  const setAutoScrolling = useAppStore((s) => s.setAutoScrolling);
  const targetWpm = useAppStore((s) => s.targetWpm);
  const setTargetWpm = useAppStore((s) => s.setTargetWpm);
  const currentWpm = useAppStore((s) => s.reading.currentWpm);
  const reading = useAppStore((s) => s.reading);
  const lastAdaptiveChange = useAppStore((s) => s.lastAdaptiveChange);
  const undoAdaptiveChange = useAppStore((s) => s.undoAdaptiveChange);
  const applySavedProfile = useAppStore((s) => s.applySavedProfile);
  const saveCurrentProfile = useAppStore((s) => s.saveCurrentProfile);
  const savedProfiles = useAppStore((s) => s.savedProfiles);
  const [profileName, setProfileName] = useState("");

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-col gap-3 px-4 pt-3 pb-2">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 text-sm font-medium text-pretty">Reading options</p>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Full screen"
              title="Fullscreen"
              onClick={() => {
                const next = document.fullscreenElement
                  ? document.exitFullscreen()
                  : document.documentElement.requestFullscreen();
                void Promise.resolve(next).catch(() => {});
              }}
            >
              <Maximize2 size={16} className="icon-motion icon-lift" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close options">
              <X size={16} className="icon-motion icon-turn" />
            </Button>
          </div>
        </div>
        <nav aria-label="Options sections" className="flex flex-wrap gap-1.5">
          {JUMP.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => jumpTo(item.id)}
              className="h-8 shrink-0 rounded-full bg-fg/6 px-2.5 text-xs font-medium whitespace-nowrap hover:bg-fg/10"
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>
      <Separator />
      <PanelScroller>
        <div className="space-y-8 pr-2 pb-8">
        <section id="rc-mode" className="rc-section">
          <p className="mb-3 text-xs font-medium tracking-wide text-muted uppercase">Mode</p>
          {/* Two columns in the mobile bottom sheet: seven stacked rows pushed
              everything below them off the sheet and made Mode feel like the
              whole panel. The desktop drawer is too narrow for two. */}
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-1">
            {MODES.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={mode === id}
                onClick={() => setMode(id)}
                className={cn(
                  "flex min-h-11 min-w-0 items-center rounded-md px-3 py-2 text-left text-sm font-medium text-pretty transition-[background-color,transform] duration-[140ms] ease-[var(--ease-out)] active:scale-[0.97]",
                  mode === id ? "bg-fg text-primary-fg" : "bg-fg/4 text-fg hover:bg-fg/8",
                )}
              >
                {READING_PROFILES[id].name}
              </button>
            ))}
          </div>
          {mode === "adaptive" && (
            <p className="mt-3 text-xs leading-relaxed text-pretty text-muted">
              NeuroLens learns how you read and recommends adjustments — pace, spacing, focus, and contrast. Locked
              settings will not be changed.
            </p>
          )}
          {lastAdaptiveChange && (
            <Button variant="outline" className="mt-3 h-auto min-h-11 w-full whitespace-normal" onClick={undoAdaptiveChange}>
              Undo last recommendation
            </Button>
          )}
        </section>

        <section>
          <p className="mb-3 text-xs font-medium tracking-wide text-muted uppercase">Profiles</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-1">
            {NAMED_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applySavedProfile(preset)}
                className="flex min-h-11 min-w-0 items-center rounded-md bg-fg/4 px-3 py-2 text-left text-sm font-medium text-pretty hover:bg-fg/8"
              >
                {preset.name}
              </button>
            ))}
            {savedProfiles.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applySavedProfile(preset)}
                className="flex min-h-11 min-w-0 items-center rounded-md bg-fg/4 px-3 py-2 text-left text-sm font-medium text-pretty hover:bg-fg/8"
              >
                {preset.name}
              </button>
            ))}
          </div>
          <div className="mt-3 flex min-w-0 items-center gap-2">
            <Input
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
              placeholder="Name this setup"
              aria-label="Name this setup"
              className="h-9 min-w-0 flex-1"
            />
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 whitespace-nowrap"
              onClick={() => {
                saveCurrentProfile(profileName);
                setProfileName("");
              }}
            >
              Save
            </Button>
          </div>
        </section>

        <section id="rc-type" className="rc-section space-y-5">
          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Typeface</p>
            <FontPicker
              compact
              value={profile.fontFamily}
              onChange={(fontFamily) => setProfile({ ...profile, fontFamily })}
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="inline-flex min-w-0 items-center gap-2">
                <Label className="text-pretty">Size</Label>
                <LockToggle setting="fontSize" />
              </span>
              <span className="shrink-0 tabular-nums text-muted">{profile.fontSize}px</span>
            </div>
            <Slider
              min={14}
              max={28}
              step={1}
              value={[profile.fontSize]}
              onValueChange={([value]) => setProfile({ ...profile, fontSize: value ?? 18 })}
              aria-label="Type size"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="inline-flex min-w-0 items-center gap-2">
                <Label className="text-pretty">Line height</Label>
                <LockToggle setting="lineHeight" />
              </span>
              <span className="shrink-0 tabular-nums text-muted">{profile.lineHeight.toFixed(1)}</span>
            </div>
            <Slider
              min={1.4}
              max={2.2}
              step={0.1}
              value={[profile.lineHeight]}
              onValueChange={([value]) => setProfile({ ...profile, lineHeight: value ?? 1.6 })}
              aria-label="Line height"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <Label className="text-pretty">Letter spacing</Label>
              <span className="shrink-0 tabular-nums text-muted">{profile.letterSpacing.toFixed(2)}</span>
            </div>
            <Slider
              min={0}
              max={0.12}
              step={0.01}
              value={[profile.letterSpacing]}
              onValueChange={([value]) => setProfile({ ...profile, letterSpacing: value ?? 0 })}
              aria-label="Letter spacing"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <Label className="text-pretty">Word spacing</Label>
              <span className="shrink-0 tabular-nums text-muted">{profile.wordSpacing.toFixed(2)}</span>
            </div>
            <Slider
              min={0}
              max={0.2}
              step={0.02}
              value={[profile.wordSpacing]}
              onValueChange={([value]) => setProfile({ ...profile, wordSpacing: value ?? 0 })}
              aria-label="Word spacing"
            />
          </div>
        </section>

        <section id="rc-color" className="rc-section space-y-5">
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-medium tracking-wide text-muted uppercase">Color scheme</p>
              <LockToggle setting="theme" />
            </div>
            <SchemePicker compact value={profile.theme} onChange={(theme) => setProfile({ ...profile, theme })} />
            <ContrastMeter theme={profile.theme} fontSize={profile.fontSize} />
          </div>
        </section>

        <section id="rc-guides" className="rc-section space-y-5">
          <div>
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <Label className="text-pretty">Fixation</Label>
              <span className="shrink-0 tabular-nums text-muted">{nearestFixationPreset(profile.bionicStrength).label}</span>
            </div>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {FIXATION_PRESETS.map((preset) => {
                const selected = nearestFixationPreset(profile.bionicStrength).id === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setProfile({ ...profile, bionicStrength: preset.value })}
                    className={cn(
                      "h-11 min-w-[4.5rem] flex-1 rounded-md px-2 text-xs font-medium whitespace-nowrap sm:text-sm",
                      selected ? "bg-fg text-primary-fg" : "bg-fg/4 hover:bg-fg/8",
                    )}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <Slider
              min={0}
              max={0.8}
              step={0.05}
              value={[profile.bionicStrength]}
              onValueChange={([value]) => setProfile({ ...profile, bionicStrength: value ?? 0 })}
              aria-label="Fixation strength"
            />
          </div>
          <ToggleRow
            id="plain-words"
            label="Plain words"
            checked={Boolean(profile.plainLanguage)}
            onChange={(checked) => setProfile({ ...profile, plainLanguage: checked })}
          />
          <ToggleRow
            id="motion-cues"
            label="Motion cues"
            hint="Stops parallax and scroll drift, and anchors the page with a fixed horizon line. For motion sickness."
            checked={Boolean(profile.motionCues)}
            onChange={(checked) => {
              setProfile({ ...profile, motionCues: checked });
              // iOS will not deliver a single sample until it has been asked,
              // and it will only allow the asking from inside a gesture — so
              // the request has to happen here, on the tap, and nowhere else.
              // Refusal is not an error: the cues fall back to scroll.
              if (checked && motionPermissionNeeded()) void requestMotionPermission();
            }}
          />
          <ToggleRow
            id="justify"
            label="Justify text"
            checked={profile.align === "justify"}
            onChange={(checked) => setProfile({ ...profile, align: checked ? "justify" : "left" })}
          />
          <ToggleRow
            id="syllables"
            label="Syllables"
            checked={Boolean(profile.syllables)}
            onChange={(checked) => setProfile({ ...profile, syllables: checked })}
          />
          <ToggleRow
            id="letter-guide"
            label="Letter guide"
            checked={Boolean(profile.letterGuide)}
            onChange={(checked) => setProfile({ ...profile, letterGuide: checked })}
          />
          <ToggleRow
            id="word-guide"
            label="Word highlight"
            checked={Boolean(profile.wordGuide)}
            onChange={(checked) => setProfile({ ...profile, wordGuide: checked })}
          />
          <ToggleRow
            id="lookup"
            label="Tap definitions"
            checked={profile.lookup !== false}
            onChange={(checked) => setProfile({ ...profile, lookup: checked })}
          />
          <ToggleRow
            id="dim-chrome"
            label="Dim chrome"
            checked={Boolean(profile.dimChrome)}
            onChange={(checked) => setProfile({ ...profile, dimChrome: checked })}
          />
          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Rhythm</p>
            <div className="flex flex-col gap-1.5">
              {RHYTHM_CHOICES.map((curve) => (
                <button
                  key={curve.id}
                  type="button"
                  aria-pressed={profile.rhythmCurve === curve.id}
                  onClick={() =>
                    setProfile({
                      ...profile,
                      rhythmCurve: curve.id,
                      rhythmOptimization: curve.id !== "steady",
                    })
                  }
                  className={cn(
                    "flex min-h-11 min-w-0 flex-col items-start justify-center rounded-md px-3 py-2 text-left",
                    profile.rhythmCurve === curve.id ? "bg-fg text-primary-fg" : "bg-fg/4 hover:bg-fg/8",
                  )}
                >
                  <span className="text-sm font-medium whitespace-nowrap">{curve.label}</span>
                  <span
                    className={cn(
                      "text-xs leading-snug text-pretty",
                      profile.rhythmCurve === curve.id ? "text-primary-fg/75" : "text-muted",
                    )}
                  >
                    {curve.hint}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-pretty text-muted">
              Auto-scroll and the speed reader rest on true sentence ends, not abbreviations.
            </p>
          </div>
        </section>

        <section id="rc-pace" className="rc-section">
          <p className="mb-3 text-xs font-medium tracking-wide text-muted uppercase">Pace</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0 rounded-md bg-fg/4 px-3 py-3">
              <p className="text-[11px] tracking-wide text-muted uppercase">Target WPM</p>
              <p className="mt-1 text-2xl font-medium tabular-nums">{targetWpm}</p>
            </div>
            <div className="min-w-0 rounded-md bg-fg/4 px-3 py-3">
              <p className="text-[11px] tracking-wide text-muted uppercase">Current WPM</p>
              <p className="mt-1 text-2xl font-medium tabular-nums">{currentWpm ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="inline-flex min-w-0 items-center gap-2">
                <Label className="text-pretty">Target WPM</Label>
                <LockToggle setting="targetWpm" />
              </span>
              <span className="shrink-0 tabular-nums text-muted">{targetWpm}</span>
            </div>
            <Slider
              min={120}
              max={480}
              step={10}
              value={[targetWpm]}
              onValueChange={([value]) => setTargetWpm(value ?? 220)}
              aria-label="Target words per minute"
            />
          </div>
          <div className="mt-4">
            <ToggleRow
              id="autoscroll"
              label="Scroll at target pace"
              checked={autoScrolling}
              onChange={(checked) => {
                setAutoScrolling(checked);
                if (checked) onClose();
              }}
            />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-pretty text-muted">
            {Math.round(reading.progress * 100)}% through this page
            {reading.pauses.length > 0 ? ` · ${reading.pauses.length} pause${reading.pauses.length === 1 ? "" : "s"}` : ""}
            {reading.rereads.length > 0 ? ` · ${reading.rereads.length} reread${reading.rereads.length === 1 ? "" : "s"}` : ""}
          </p>
        </section>
        </div>
      </PanelScroller>
    </div>
  );
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
  lock,
}: {
  id: string;
  label: string;
  /** One line saying what the toggle does, for settings whose name is not enough. */
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  lock?: LockableSetting;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 py-1">
      <span className="inline-flex min-w-0 flex-col">
        <span className="inline-flex min-w-0 items-center gap-2">
          <Label htmlFor={id} className="text-pretty">
            {label}
          </Label>
          {lock ? <LockToggle setting={lock} /> : null}
        </span>
        {hint ? (
          <span id={`${id}-hint`} className="mt-0.5 text-xs leading-snug text-pretty text-muted">
            {hint}
          </span>
        ) : null}
      </span>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
    </div>
  );
}
