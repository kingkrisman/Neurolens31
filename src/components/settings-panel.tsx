import { useRef, useState } from "react";
import { toast } from "sonner";
import { FONT_CLASS, NAMED_PRESETS, READING_PROFILES, RHYTHM_CHOICES, type ReadingMode } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Label, Slider, Switch } from "@/components/ui/field";
import { Panel, PanelHeader, PanelWell } from "@/components/ui/surfaces";
import { SchemePicker, ContrastMeter } from "@/components/scheme-picker";
import { FontPicker } from "@/components/font-picker";
import { ContrastLab } from "@/components/contrast-lab";
import { AccessibleBionic } from "@/components/accessible-bionic";
import { FIXATION_PRESETS, nearestFixationPreset, processBionicText } from "@/lib/bionic";
import { DEMO_SENTENCE } from "@/lib/samples";
import { cn } from "@/lib/utils";
import { motionPermissionNeeded, requestMotionPermission } from "@/lib/device-motion";
import { exportEverything, exportHighlights } from "@/lib/data-export";
import { PageEnter, ScrollScene } from "@/components/gsap-motion";

export function SettingsPanel() {
  const clearData = useAppStore((s) => s.clearData);
  const applySavedProfile = useAppStore((s) => s.applySavedProfile);
  const saveCurrentProfile = useAppStore((s) => s.saveCurrentProfile);
  const savedProfiles = useAppStore((s) => s.savedProfiles);
  const deleteSavedProfile = useAppStore((s) => s.deleteSavedProfile);
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const targetWpm = useAppStore((s) => s.targetWpm);
  const setTargetWpm = useAppStore((s) => s.setTargetWpm);
  const [holding, setHolding] = useState(false);
  const [profileName, setProfileName] = useState("");
  const timer = useRef<number | null>(null);

  function startHold() {
    setHolding(true);
    timer.current = window.setTimeout(() => {
      clearData();
      setHolding(false);
      toast.success("Local data cleared");
    }, 2000);
  }

  function endHold() {
    setHolding(false);
    if (timer.current) window.clearTimeout(timer.current);
  }

  const preview = profile.bionicStrength > 0 ? processBionicText(DEMO_SENTENCE, profile.bionicStrength, profile.rhythmOptimization) : DEMO_SENTENCE;

  return (
    <PageEnter className="mx-auto h-full max-w-3xl px-4 py-10 sm:px-8 sm:py-14">
      <h1 data-enter className="text-5xl">Settings</h1>
      <p data-enter className="mt-3 text-muted">
        These controls write to the reader immediately. Nothing is stored off this device.
      </p>

      <div className="mt-10">
        <ScrollScene>
        <div className="space-y-3">
        <h2 className="mt-8 mb-1 px-1 text-xs font-medium tracking-wide text-muted uppercase first:mt-0">Reading</h2>
        <Panel>
          <PanelHeader as="h3" title="Mode" description="A named starting point. You can still tune every slider below." />
          <PanelWell className="grid grid-cols-2 gap-1.5 p-2">
            {(() => {
              const ids = Object.keys(READING_PROFILES) as ReadingMode[];
              return ids.map((id, index) => {
                const selected = mode === id;
                // An odd count leaves the last chip alone in a half-width cell;
                // let it span so the group ends on a straight edge.
                const spans = index === ids.length - 1 && ids.length % 2 === 1;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setMode(id)}
                    className={cn(
                      "min-w-0 rounded-md px-3 py-3 text-left text-sm font-medium text-pretty whitespace-normal transition-[background-color,box-shadow,color,transform] duration-[140ms] ease-[var(--ease-out)] active:scale-[0.97] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-fg)_18%,transparent)]",
                      // Every option carries a resting surface so the set reads as
                      // seven controls, not one button beside six inert labels.
                      selected
                        ? "bg-fg text-primary-fg shadow-border"
                        : "bg-surface text-fg shadow-border hover:shadow-border-hover",
                      spans && "col-span-2",
                    )}
                  >
                    {READING_PROFILES[id].name}
                  </button>
                );
              });
            })()}
          </PanelWell>
        </Panel>

        <Panel>
          <PanelHeader as="h3" title="Live preview" description="The sentence updates as you move the sliders." />
          <PanelWell className="px-5 py-6">
            <p
              className={cn("text-left leading-relaxed", FONT_CLASS[profile.fontFamily] ?? "font-sans")}
              style={{
                fontSize: profile.fontSize,
                lineHeight: profile.lineHeight,
                letterSpacing: `${profile.letterSpacing}em`,
                wordSpacing: `${profile.wordSpacing}em`,
              }}
            >
              {profile.bionicStrength > 0 ? (
                <AccessibleBionic text={DEMO_SENTENCE} html={preview} />
              ) : (
                DEMO_SENTENCE
              )}
            </p>
          </PanelWell>
        </Panel>

        <h2 className="mt-8 mb-1 px-1 text-xs font-medium tracking-wide text-muted uppercase first:mt-0">Appearance</h2>
        <Panel>
          <PanelHeader as="h3" title="Color" description="Cream, peach, and butter are the evidence-backed pastels for dyslexia — warmer pages, less glare. High-contrast white is the one to avoid." />
          <PanelWell className="px-4 py-4">
            <SchemePicker value={profile.theme} onChange={(theme) => setProfile({ ...profile, theme })} />
            <ContrastMeter theme={profile.theme} fontSize={profile.fontSize} />
            <details className="mt-4 border-t border-border pt-3">
              <summary className="cursor-pointer text-sm font-medium">Contrast lab</summary>
              <div className="mt-3">
                <ContrastLab />
              </div>
            </details>
          </PanelWell>
        </Panel>

        <Panel>
          <PanelHeader as="h3"
            title="Type"
            description="Size and spacing move the needle. Lexend reduces crowding. Atkinson keeps I, l, and 1 from collapsing. OpenDyslexic is a preference — trials have not shown it faster or more accurate than a clear sans."
          />
          <PanelWell className="space-y-5 p-3">
            <FontPicker
              value={profile.fontFamily}
              onChange={(fontFamily) => setProfile({ ...profile, fontFamily })}
            />
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <Label>Size</Label>
                <span className="tabular-nums text-muted">{profile.fontSize}px</span>
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
              <div className="mb-1 flex items-center justify-between text-sm">
                <Label>Line height</Label>
                <span className="tabular-nums text-muted">{profile.lineHeight.toFixed(1)}</span>
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
              <div className="mb-1 flex items-center justify-between text-sm">
                <Label>Letter spacing</Label>
                <span className="tabular-nums text-muted">{profile.letterSpacing.toFixed(2)}</span>
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
              <div className="mb-1 flex items-center justify-between text-sm">
                <Label>Word spacing</Label>
                <span className="tabular-nums text-muted">{profile.wordSpacing.toFixed(2)}</span>
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
          </PanelWell>
        </Panel>

        <Panel>
          <PanelHeader as="h3"
            title="Fixation"
            description="Bionic reading marks the letters the eye lands on first, so the rest of the word can be skipped. Stronger marks help tired or wandering attention; lighter marks stay closer to ordinary type."
          />
          <PanelWell className="space-y-5 p-3">
            <div className="flex flex-wrap gap-1.5">
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
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <Label>Strength</Label>
                <span className="tabular-nums text-muted">{Math.round(profile.bionicStrength * 100)}%</span>
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
            <div>
              <p className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Rhythm</p>
              <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-3">
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
                      "flex min-h-11 min-w-0 flex-col items-start justify-center rounded-md px-3 py-2 text-left sm:items-center sm:text-center",
                      profile.rhythmCurve === curve.id ? "bg-fg text-primary-fg" : "bg-fg/4 hover:bg-fg/8",
                    )}
                  >
                    <span className="text-sm font-medium whitespace-nowrap">{curve.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex min-h-11 items-center justify-between gap-3 px-1 py-1">
              <Label htmlFor="plain-settings">Plain words (swap dense wording)</Label>
              <Switch
                id="plain-settings"
                checked={Boolean(profile.plainLanguage)}
                onCheckedChange={(checked) => setProfile({ ...profile, plainLanguage: checked })}
              />
            </div>
            <div className="flex min-h-11 items-start justify-between gap-3 px-1 py-2">
              <span className="flex min-w-0 flex-col">
                <Label htmlFor="motion-cues-settings">Motion cues</Label>
                <span id="motion-cues-settings-hint" className="mt-0.5 text-xs leading-snug text-pretty text-muted">
                  For motion sickness: stops parallax and scroll drift, and runs markers along the
                  screen edges that move against your travel. Uses the motion sensor where one
                  exists, so it works in a car or on a train. Separate from your system’s
                  reduced-motion setting.
                </span>
              </span>
              <Switch
                id="motion-cues-settings"
                checked={Boolean(profile.motionCues)}
                onCheckedChange={(checked) => {
                  setProfile({ ...profile, motionCues: checked });
                  if (checked && motionPermissionNeeded()) void requestMotionPermission();
                }}
                aria-describedby="motion-cues-settings-hint"
              />
            </div>
            <div className="flex min-h-11 items-start justify-between gap-3 px-1 py-2">
              <span className="flex min-w-0 flex-col">
                <Label htmlFor="companion-settings">Neuro, the companion</Label>
                <span id="companion-settings-hint" className="mt-0.5 text-xs leading-snug text-pretty text-muted">
                  A face you can drag anywhere and ask to change how the page reads. Turning this off
                  removes it everywhere; this is where it comes back.
                </span>
              </span>
              <Switch
                id="companion-settings"
                checked={profile.companion !== false}
                onCheckedChange={(checked) => setProfile({ ...profile, companion: checked })}
                aria-describedby="companion-settings-hint"
              />
            </div>
            <div className="flex min-h-11 items-center justify-between gap-3 px-1 py-1">
              <Label htmlFor="justify-settings">Justify text</Label>
              <Switch
                id="justify-settings"
                checked={profile.align === "justify"}
                onCheckedChange={(checked) => setProfile({ ...profile, align: checked ? "justify" : "left" })}
              />
            </div>
            <div className="flex min-h-11 items-center justify-between gap-3 px-1 py-1">
              <Label htmlFor="syllables-settings">Syllables</Label>
              <Switch
                id="syllables-settings"
                checked={Boolean(profile.syllables)}
                onCheckedChange={(checked) => setProfile({ ...profile, syllables: checked })}
              />
            </div>
            <div className="flex min-h-11 items-center justify-between gap-3 px-1 py-1">
              <Label htmlFor="letters-settings">Letter guide (b / d)</Label>
              <Switch
                id="letters-settings"
                checked={Boolean(profile.letterGuide)}
                onCheckedChange={(checked) => setProfile({ ...profile, letterGuide: checked })}
              />
            </div>
            <div className="flex min-h-11 items-center justify-between gap-3 px-1 py-1">
              <Label htmlFor="words-settings">Word highlight</Label>
              <Switch
                id="words-settings"
                checked={Boolean(profile.wordGuide)}
                onCheckedChange={(checked) => setProfile({ ...profile, wordGuide: checked })}
              />
            </div>
            <div className="flex min-h-11 items-center justify-between gap-3 px-1 py-1">
              <Label htmlFor="lookup-settings">Tap a word for its definition</Label>
              <Switch
                id="lookup-settings"
                checked={profile.lookup !== false}
                onCheckedChange={(checked) => setProfile({ ...profile, lookup: checked })}
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <Label>Target pace</Label>
                <span className="tabular-nums text-muted">{targetWpm} WPM</span>
              </div>
              <Slider
                min={120}
                max={420}
                step={10}
                value={[targetWpm]}
                onValueChange={([value]) => setTargetWpm(value ?? 220)}
                aria-label="Target words per minute"
              />
            </div>
          </PanelWell>
        </Panel>

        <h2 className="mt-8 mb-1 px-1 text-xs font-medium tracking-wide text-muted uppercase first:mt-0">Your setups</h2>
        <Panel>
          <PanelHeader as="h3" title="Saved setups" description="Apply a named setup, or keep the one you just tuned." />
          <PanelWell className="flex flex-col gap-1.5 p-2">
            {NAMED_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                variant="outline"
                className="justify-between"
                onClick={() => {
                  applySavedProfile(preset);
                  toast.success(preset.name);
                }}
              >
                <span>{preset.name}</span>
                <span className="text-xs text-muted">{preset.targetWpm} WPM</span>
              </Button>
            ))}
            {savedProfiles.map((preset) => (
              <div key={preset.id} className="flex gap-2">
                <Button variant="outline" className="flex-1 justify-between" onClick={() => applySavedProfile(preset)}>
                  <span>{preset.name}</span>
                  <span className="text-xs text-muted">{preset.targetWpm} WPM</span>
                </Button>
                <Button variant="ghost" onClick={() => deleteSavedProfile(preset.id)}>
                  Remove
                </Button>
              </div>
            ))}
            <div className="mt-2 flex gap-2">
              <input
                value={profileName}
                onChange={(event) => setProfileName(event.target.value)}
                placeholder="Name this setup"
                aria-label="Name this setup"
                className="h-11 min-w-0 flex-1 rounded-md bg-bg px-3 text-sm shadow-border outline-none"
              />
              <Button
                variant="outline"
                onClick={() => {
                  if (!profileName.trim()) {
                    toast.error("Name this setup first");
                    return;
                  }
                  saveCurrentProfile(profileName);
                  setProfileName("");
                  toast.success("Setup saved");
                }}
              >
                Save
              </Button>
            </div>
          </PanelWell>
        </Panel>

        <h2 className="mt-8 mb-1 px-1 text-xs font-medium tracking-wide text-muted uppercase first:mt-0">Data</h2>

        {/* Export sits above Reset deliberately. The destructive control is the
            one someone arrives at this section for, and offering a way to keep
            the data before the way to destroy it is the ordering that stops a
            term of highlights disappearing to a mis-tap. */}
        <Panel>
          <PanelHeader as="h3"
            title="Export"
            description="Everything NeuroLens knows lives in this browser. Clearing site data, switching browsers, or losing this machine takes it with them — these files are how you keep it."
          />
          <PanelWell className="flex flex-wrap gap-2 px-4 py-4">
            <Button
              variant="outline"
              onClick={() => {
                const marks = useAppStore.getState().highlights;
                const count = Object.values(marks).reduce((sum, list) => sum + list.length, 0);
                if (!count) {
                  toast("Nothing marked yet.");
                  return;
                }
                // The key is the opening of the passage, which is the only title
                // available for text that was pasted rather than opened from a
                // shelf. A session title is used where one exists.
                const sessions = useAppStore.getState().sessions;
                exportHighlights(marks, (key) => {
                  const match = sessions.find((item) => item.content.startsWith(key));
                  return match?.title ?? key.slice(0, 60);
                });
                toast.success(`${count} highlight${count === 1 ? "" : "s"} exported`);
              }}
            >
              Highlights as Markdown
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const state = useAppStore.getState();
                exportEverything({
                  sessions: state.sessions,
                  highlights: state.highlights,
                  bookmarks: state.bookmarks,
                  savedProfiles: state.savedProfiles,
                  profile: state.profile,
                  targetWpm: state.targetWpm,
                });
                toast.success("Backup downloaded");
              }}
            >
              Everything as JSON
            </Button>
          </PanelWell>
        </Panel>

        <Panel>
          <PanelHeader as="h3"
            title="Reset"
            description="Hold to clear saved settings, notes, bookmarks, and reading history. Release to cancel."
          />
          <PanelWell className="px-4 py-4">
            <Button
              variant="destructive"
              className="relative overflow-hidden"
              onPointerDown={startHold}
              onPointerUp={endHold}
              onPointerLeave={endHold}
              onPointerCancel={endHold}
            >
              <span className="hold-fill absolute inset-0 bg-danger/20" data-holding={holding ? "true" : "false"} />
              <span className="relative">{holding ? "Hold to confirm" : "Clear local data"}</span>
            </Button>
          </PanelWell>
        </Panel>

        <Panel className="mb-8">
          <PanelHeader as="h3" title="About NeuroLens" />
          <PanelWell className="px-4 py-4">
            <p className="text-sm leading-relaxed text-muted">
              An adaptive reading environment. Paste text, open a PDF page by page, look up a Bible chapter, search
              Project Gutenberg, or open a poem. Adaptive watches pace, pauses, rereads, and feel — it recommends, and
              it never silently rewrites a locked setting.
            </p>
            <p className="mt-4 text-xs text-subtle">Version 4.0 · WEB · Gutendex · PoetryDB</p>
          </PanelWell>
        </Panel>
        </div>
        </ScrollScene>
      </div>
    </PageEnter>
  );
}
