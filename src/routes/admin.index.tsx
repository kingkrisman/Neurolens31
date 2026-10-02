import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, CircleDashed, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/")({
  component: Analytics,
});

/**
 * What the admin sees: how many people use NeuroLens, and what they do.
 *
 * Everything here is the anonymous, bucketed record the app already keeps
 * (src/lib/analytics.ts) plus account counts — never a person, a book, or
 * a page anyone read. Readers who did not opt in to analytics are not in the
 * usage numbers at all, so those are a floor, not a census.
 */

type Range = 7 | 30 | 90;
type Count = { value: string; count: number };
type Daily = { day: string; name: string; count: number };
type Vital = { metric: string; rating: string; count: number };
type Failure = { received_at: string; area: string; message: string; release: string | null };
type Accounts = {
  total: number;
  new: number;
  reading: number;
  books: number;
  highlights: number;
  by_day: Array<{ day: string; count: number }>;
};

interface Report {
  accounts: Accounts;
  daily: Daily[];
  tabs: Count[];
  formats: Count[];
  failures: Count[];
  settings: Count[];
  auth: Count[];
  modes: Count[];
  vitals: Vital[];
  errors: Failure[];
}

async function load(days: Range): Promise<Report> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");
  const call = async <T,>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) {
      if (/function .* does not exist|Could not find the function/i.test(error.message)) {
        throw new Error("The admin database update has not been run yet (supabase/migrations/0004_admin_blog.sql).");
      }
      throw new Error(error.message);
    }
    return data as T;
  };
  const breakdown = (event: string, prop: string) =>
    call<Count[]>("admin_breakdown", { event, prop, days }).then((rows) =>
      rows.map((row) => ({ value: row.value, count: Number(row.count) })),
    );
  const [accounts, daily, tabs, formats, failures, settings, auth, modes, vitals, errors] = await Promise.all([
    call<Accounts>("admin_accounts", { days }),
    call<Daily[]>("admin_daily", { days }),
    breakdown("tab_view", "tab"),
    breakdown("file_opened", "format"),
    breakdown("file_failed", "format"),
    breakdown("setting_changed", "setting"),
    breakdown("auth", "action"),
    breakdown("recall_done", "mode"),
    call<Vital[]>("admin_vitals", { days }),
    call<Failure[]>("admin_errors", { max_rows: 25 }),
  ]);
  return {
    accounts,
    daily: daily.map((row) => ({ ...row, count: Number(row.count) })),
    tabs,
    formats,
    failures,
    settings,
    auth,
    modes,
    vitals: vitals.map((row) => ({ ...row, count: Number(row.count) })),
    errors,
  };
}

const NUMBER = new Intl.NumberFormat("en-GB");

function Analytics() {
  const [days, setDays] = useState<Range>(30);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setError(null);
    load(days).then(
      (next) => live && setReport(next),
      (failure: Error) => live && setError(failure.message),
    );
    return () => {
      live = false;
    };
  }, [days]);

  const series = useMemo(() => {
    if (!report) return null;
    const dates: string[] = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      dates.push(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10));
    }
    const of = (name: string) => {
      const map = new Map(report.daily.filter((row) => row.name === name).map((row) => [row.day, row.count]));
      return dates.map((day) => ({ day, count: map.get(day) ?? 0 }));
    };
    const signups = new Map(report.accounts.by_day.map((row) => [row.day, Number(row.count)]));
    return {
      opens: of("app_open"),
      files: of("file_opened"),
      signups: dates.map((day) => ({ day, count: signups.get(day) ?? 0 })),
    };
  }, [report, days]);

  const total = (rows: { count: number }[]) => rows.reduce((sum, row) => sum + row.count, 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl tracking-[-0.01em]">Analytics</h1>
          <p className="mt-1 text-sm text-muted">
            Usage counts only include readers who switched analytics on, so treat them as a floor.
          </p>
        </div>
        <div role="group" aria-label="Period" className="inline-flex rounded-full bg-fg/6 p-1">
          {([7, 30, 90] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={days === value}
              onClick={() => setDays(value)}
              className={cn(
                "h-8 rounded-full px-3.5 text-sm transition-colors",
                days === value ? "bg-surface font-medium text-fg shadow-border" : "text-muted hover:text-fg",
              )}
            >
              {value} days
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-8 rounded-2xl bg-danger-soft p-5 text-sm text-danger">
          {error}
        </p>
      ) : !report || !series ? (
        <p className="mt-8 flex items-center gap-2 text-sm text-muted" role="status">
          <LoaderCircle size={16} className="animate-spin" aria-hidden /> Loading…
        </p>
      ) : (
        <div className="mt-8 grid gap-6">
          <section aria-label="Headline numbers" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Accounts" value={report.accounts.total} />
            <Stat label={`New in ${days} days`} value={report.accounts.new} />
            <Stat label="Reading this period" value={report.accounts.reading} hint="Accounts whose library changed" />
            <Stat label="App opens" value={total(series.opens)} />
            <Stat label="Books in libraries" value={report.accounts.books} />
            <Stat label="Highlights" value={report.accounts.highlights} />
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="App opens per day">
              <DayBars data={series.opens} unit="opens" />
            </Panel>
            <Panel title="New accounts per day">
              <DayBars data={series.signups} unit="new accounts" />
            </Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title="Where people spend time" note="Tab views">
              <Ranked rows={report.tabs} />
            </Panel>
            <Panel title="What they open" note="File formats">
              <Ranked rows={report.formats} />
            </Panel>
            <Panel title="Settings people change">
              <Ranked rows={report.settings} limit={8} />
            </Panel>
            <Panel title="Files that failed to open" note="By format">
              <Ranked rows={report.failures} empty="None in this period." />
            </Panel>
            <Panel title="Sign-ins and sign-ups">
              <Ranked rows={report.auth} />
            </Panel>
            <Panel title="Recall cards finished" note="By reading mode">
              <Ranked rows={report.modes} />
            </Panel>
          </div>

          <Panel title="Page speed" note="Core Web Vitals, as Google rates them">
            <Vitals rows={report.vitals} />
          </Panel>

          <Panel title="Recent crash reports" note="Scrubbed on the reader's device before sending">
            {report.errors.length === 0 ? (
              <p className="text-sm text-muted">No crashes reported. </p>
            ) : (
              <ul className="divide-y divide-fg/8">
                {report.errors.map((failure, index) => (
                  <li key={index} className="grid gap-1 py-3 text-sm sm:grid-cols-[9rem_6rem_1fr] sm:gap-4">
                    <span className="text-muted tabular-nums">
                      {new Date(failure.received_at).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="text-muted">{failure.area}</span>
                    <span className="font-mono text-[13px] break-words text-fg">{failure.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-2xl bg-surface p-4 shadow-border" title={hint}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-[-0.02em] tabular-nums">{NUMBER.format(value)}</p>
    </div>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-surface p-5 shadow-border">
      <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
      {note ? <p className="mt-0.5 text-xs text-muted">{note}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** One bar per day, one colour; the value for any day on hover or focus, and the total in words. */
function DayBars({ data, unit }: { data: Array<{ day: string; count: number }>; unit: string }) {
  const max = Math.max(1, ...data.map((point) => point.count));
  const [active, setActive] = useState<number | null>(null);
  const shown = active == null ? null : data[active];
  const label = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <div>
      <p className="h-5 text-sm text-muted tabular-nums" aria-live="polite">
        {shown ? (
          <>
            <span className="font-medium text-fg">{NUMBER.format(shown.count)}</span> {unit} on {label(shown.day)}
          </>
        ) : (
          <>
            <span className="font-medium text-fg">{NUMBER.format(data.reduce((sum, point) => sum + point.count, 0))}</span>{" "}
            {unit} in total, most in a day {NUMBER.format(max === 1 && data.every((p) => p.count === 0) ? 0 : max)}
          </>
        )}
      </p>
      <div
        className="mt-3 flex h-36 items-end gap-[2px] border-b border-fg/12"
        onMouseLeave={() => setActive(null)}
        role="img"
        aria-label={`${unit} per day`}
      >
        {data.map((point, index) => (
          <button
            key={point.day}
            type="button"
            tabIndex={-1}
            aria-hidden
            onMouseEnter={() => setActive(index)}
            onFocus={() => setActive(index)}
            className="group flex h-full min-w-0 flex-1 items-end"
          >
            <span
              className={cn(
                "block w-full rounded-t-[4px] bg-accent/70 transition-colors group-hover:bg-accent",
                active === index && "bg-accent",
              )}
              style={{ height: point.count ? `${Math.max(3, (point.count / max) * 100)}%` : "0%" }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted tabular-nums">
        <span>{label(data[0]!.day)}</span>
        <span>{label(data[data.length - 1]!.day)}</span>
      </div>
    </div>
  );
}

/** A ranked list with a bar under each label: magnitude in one colour, the number in text. */
function Ranked({ rows, limit = 6, empty = "Nothing yet." }: { rows: Count[]; limit?: number; empty?: string }) {
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  const top = rows.slice(0, limit);
  const max = Math.max(...top.map((row) => row.count));
  return (
    <ul className="grid gap-3">
      {top.map((row) => (
        <li key={row.value}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-fg">{humanise(row.value)}</span>
            <span className="text-muted tabular-nums">{NUMBER.format(row.count)}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-fg/6">
            <div className="h-full rounded-full bg-accent/70" style={{ width: `${(row.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const RATING = {
  good: { label: "Good", icon: CheckCircle2, className: "text-success" },
  "needs-improvement": { label: "Needs work", icon: CircleDashed, className: "text-muted" },
  poor: { label: "Poor", icon: AlertTriangle, className: "text-danger" },
} as const;

function Vitals({ rows }: { rows: Vital[] }) {
  const metrics = ["LCP", "INP", "CLS", "FCP", "TTFB"];
  const present = metrics.filter((metric) => rows.some((row) => row.metric === metric));
  if (!present.length) return <p className="text-sm text-muted">No measurements yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[30rem] text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="py-2 font-normal">Measure</th>
            {Object.values(RATING).map((rating) => (
              <th key={rating.label} className="py-2 font-normal">
                <span className={cn("inline-flex items-center gap-1", rating.className)}>
                  <rating.icon size={13} aria-hidden /> {rating.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-fg/8">
          {present.map((metric) => {
            const counts = Object.keys(RATING).map(
              (rating) => rows.find((row) => row.metric === metric && row.rating === rating)?.count ?? 0,
            );
            const sum = counts.reduce((a, b) => a + b, 0) || 1;
            return (
              <tr key={metric}>
                <td className="py-2.5 font-medium">{metric}</td>
                {counts.map((count, index) => (
                  <td key={index} className="py-2.5 tabular-nums">
                    {Math.round((count / sum) * 100)}%{" "}
                    <span className="text-xs text-muted">({NUMBER.format(count)})</span>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const WORDS: Record<string, string> = {
  sign_in: "Sign-ins",
  sign_up: "Sign-ups",
  sign_out: "Sign-outs",
  fontFamily: "Typeface",
  fontSize: "Text size",
  lineHeight: "Line spacing",
  letterSpacing: "Letter spacing",
  wordSpacing: "Word spacing",
  bionicStrength: "Bold word starts",
  readingMask: "Reading mask",
  wordGuide: "Word guide",
  letterGuide: "Letter guide",
  plainLanguage: "Plain language",
  focusHighlight: "Focus highlight",
  rhythmOptimization: "Rhythm",
  adhd: "ADHD",
  default: "Standard",
};

function humanise(value: string): string {
  if (WORDS[value]) return WORDS[value];
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/[_-]/g, " ");
}
