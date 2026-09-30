import React from 'react';
import type { PluginComponentProps } from './hs-plugin';
import { BUCKETS, Bucket, bucketOf, bucketNow, shortName, emojiFor, isDone } from './routine';
import { frame, ink, Header, Icon, I, sdk, dayKey, useNow, Fit, useBox } from './ui';

const API = 'https://api.todoist.com/api/v1';
const AUTH = { header: { Authorization: 'Bearer {{todoist_token}}' } };
async function call(url: string, fresh = false) {
  const res: Response = await sdk().pluginFetch('nora-stars', { url, cacheTtlMs: fresh ? 0 : 60000, secretInjections: AUTH });
  if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json();
}
export function weekStartDate(now: Date, startDow: number): Date {
  const d = new Date(now); d.setHours(0, 0, 0, 0); const diff = (d.getDay() - startDow + 7) % 7; d.setDate(d.getDate() - diff); return d;
}
export function streak(dayKeys: Set<string>, now: Date, tz?: string): number {
  let n = 0; const d = new Date(now);
  if (!dayKeys.has(dayKey(d, tz))) d.setDate(d.getDate() - 1); // today not done yet doesn't break the streak
  while (dayKeys.has(dayKey(d, tz))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export function useStars(config: Record<string, unknown>, tz: string | undefined, now: Date) {
  const projectName = String(config.projectName || config.name || 'Nora');
  const [week, setWeek] = React.useState<number | null>(null);
  const [todayN, setTodayN] = React.useState(0);
  const [st, setSt] = React.useState(0);
  const [doneToday, setDoneToday] = React.useState<Set<string>>(new Set());
  const [err, setErr] = React.useState<string | null>(null);
  const tick = Math.floor(now.getTime() / 300000);
  const [bump, setBump] = React.useState(0);
  React.useEffect(() => { const on = () => setBump((b) => b + 1); window.addEventListener('nora-stars:refresh', on); return () => window.removeEventListener('nora-stars:refresh', on); }, []);

  React.useEffect(() => { (async () => {
    try {
      const pj = await call(`${API}/projects?limit=200`);
      const p = (pj.results ?? pj).find((x: any) => String(x.name).toLowerCase() === projectName.toLowerCase());
      if (!p) { setErr(`No Todoist project “${projectName}”`); return; }
      const since = new Date(now.getTime() - 30 * 86400000);
      // Repeating chores never show as "completed" tasks (Todoist just moves the due date),
      // so count completion events from the activity log (no date_from: the free plan refuses
      // ranges older than its ~1 week history); fall back to completed tasks.
      let times: number[] = []; const done: { id: string; t: number }[] = [];
      try {
        let cursor = ''; 
        for (let page = 0; page < 5; page++) {
          const a = await call(`${API}/activities?object_type=item&event_type=completed&parent_project_id=${p.id}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, bump > 0);
          const evs = a.results ?? a.events ?? [];
          times.push(...evs.map((e: any) => new Date(e.event_date).getTime()));
          done.push(...evs.map((e: any) => ({ id: String(e.object_id ?? e.task_id ?? ''), t: new Date(e.event_date).getTime() })));
          cursor = a.next_cursor; if (!cursor) break;
        }
      } catch { times = []; }
      if (!times.length) {
        const j = await call(`${API}/tasks/completed/by_completion_date?since=${encodeURIComponent(since.toISOString())}&until=${encodeURIComponent(new Date().toISOString())}&project_id=${p.id}&limit=200`);
        const items = j.items ?? j.results ?? [];
        times = items.map((i: any) => new Date(i.completed_at).getTime());
        done.push(...items.map((i: any) => ({ id: String(i.task_id ?? i.id ?? ''), t: new Date(i.completed_at).getTime() })));
      }
      times = times.filter((t) => Number.isFinite(t) && t >= since.getTime());
      const ws = weekStartDate(now, Number(config.weekStart ?? 1)).getTime();
      const days = new Set(times.map((t) => dayKey(new Date(t), tz)));
      setDoneToday(new Set(done.filter((d) => d.id && dayKey(new Date(d.t), tz) === dayKey(now, tz)).map((d) => d.id)));
      setWeek(times.filter((t) => t >= ws).length);
      setTodayN(times.filter((t) => dayKey(new Date(t), tz) === dayKey(now, tz)).length);
      setSt(streak(days, now, tz)); setErr(null);
    } catch (e) { setErr(/HTTP (401|403|500)/.test(String((e as Error).message)) ? 'Add your Todoist API token in Plugins → nora-stars.' : 'Can’t reach Todoist right now.'); }
  })(); }, [tick, projectName, bump]);  // eslint-disable-line react-hooks/exhaustive-deps

  return { week, todayN, st, err, setWeek, setTodayN, doneToday };
}

export function StarsView({ config, style, timezone: tz }: PluginComponentProps) {
  const now = useNow(60000);
  const name = String(config.name || 'Nora'); const projectName = String(config.projectName || name);
  const goal = Math.max(1, Number(config.weeklyGoal ?? 15)); const reward = String(config.reward || '');
  const accent = String(config.accentColor || '#db2777');
  const { week, todayN, st, err } = useStars(config, tz, now);
  const n = week ?? 0; const left = Math.max(0, goal - n);
  const cols = Math.min(goal, goal > 10 ? Math.ceil(goal / 3) : goal);
  const [box, size] = useBox<HTMLDivElement>();
  const fs = Number(style?.fontSize) || 18;
  const narrow = size.w > 0 && size.w < fs * 22;
  const stat = (icon: React.ReactNode, v: number, label: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45em' }}>
      {icon}
      <div><div style={{ fontSize: '1.5em', fontWeight: 600, lineHeight: 1 }}>{v}</div><div style={{ fontSize: '0.62em', opacity: 0.5, whiteSpace: 'nowrap' }}>{label}</div></div>
    </div>
  );
  return (
    <div ref={box} style={frame(style)}>
      <Header style={style} title={`${name}'s stars`} meta={week == null ? '' : `${n} this week`} />
      {err ? <div style={{ margin: 'auto', fontSize: '0.8em', opacity: 0.6 }}>{err}</div> : (
        <Fit max={2.2} min={0.5}>
          <div style={{ display: 'flex', flexDirection: narrow ? 'column' : 'row', gap: narrow ? '0.8em' : '1.2em', alignItems: 'center' }}>
            <div style={{ flex: narrow ? undefined : 1, width: narrow ? '100%' : undefined, display: 'grid', gridTemplateColumns: `repeat(${narrow ? Math.min(goal, 5) : size.h < size.w * 0.55 ? Math.ceil(goal / 2) : cols}, 1fr)`, gap: '0.35em', justifyItems: 'center' }}>
              {Array.from({ length: goal }, (_, i) => (
                <Icon key={i} d={I.star} size="100%" stroke={1.5} fill={i < n ? accent : 'none'} style={{ color: i < n ? accent : ink(style, 0.25), maxWidth: '2.2em', aspectRatio: '1' }} />
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: narrow ? 'row' : 'column', gap: narrow ? '1.4em' : '0.6em', minWidth: narrow ? undefined : '6em' }}>
              {stat(<Icon d={I.flame} size="1.6em" stroke={1.6} style={{ color: st ? '#ea580c' : ink(style, 0.3) }} />, st, 'day streak')}
              {stat(<Icon d={I.check} size="1.6em" stroke={2} style={{ color: todayN ? accent : ink(style, 0.3) }} />, todayN, 'done today')}
            </div>
          </div>
          {reward && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', marginTop: '0.8em', padding: '0.5em 0.8em', borderRadius: '0.6em', background: `color-mix(in srgb, ${accent} 12%, transparent)`, fontSize: '0.85em' }}>
              <Icon d={I.gift} size="1.2em" style={{ color: accent, flexShrink: 0 }} />
              <span>{left === 0 ? <><b style={{ fontWeight: 600 }}>Goal reached!</b> {reward} time 🎉</> : <><b style={{ fontWeight: 600 }}>{left} more star{left === 1 ? '' : 's'}</b> to {reward}</>}</span>
            </div>
          )}
        </Fit>
      )}
    </div>
  );
}

// ─── Routine view: today's chores as big tap targets, grouped Morning / After school / Bedtime ───
type HostTask = { id: string; content: string; due?: { date?: string } | null; projectName?: string; sectionName?: string; parentId?: unknown };

function Routine({ config, style, timezone: tz, stars }: PluginComponentProps & { stars: ReturnType<typeof useStars> }) {
  const now = useNow(30000);
  const today = dayKey(now, tz);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: tz }).format(now));
  const name = String(config.name || 'Nora'); const projectName = String(config.projectName || name).toLowerCase();
  const accent = String(config.accentColor || '#db2777');
  const goal = Math.max(1, Number(config.weeklyGoal ?? 15)); const reward = String(config.reward || '');
  const [tasks, setTasks] = React.useState<HostTask[] | null>(null);
  const [done, setDone] = React.useState<Map<string, number>>(new Map());   // ticked here, until Todoist catches up
  const [pick, setPick] = React.useState<{ b: Bucket; at: number } | null>(null);
  const [burst, setBurst] = React.useState(0);
  const [toast, setToast] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try { const j = await fetch('/api/todoist', { cache: 'no-store' }).then((r) => r.json()); setTasks((j.tasks ?? []).filter((t: HostTask) => String(t.projectName ?? '').toLowerCase() === projectName && !t.parentId)); }
    catch { /* keep last */ }
  }, [projectName]);
  React.useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id); }, [load]);
  React.useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2500); return () => clearTimeout(t); }, [toast]);

  const auto = bucketNow(hour, Number(config.morningUntil ?? 11), Number(config.bedtimeFrom ?? 17));
  const cur: Bucket = pick && Date.now() - pick.at < 120000 ? pick.b : auto;
  const list = (tasks ?? []).map((t) => ({ ...t, b: bucketOf(t.content, t.sectionName), ok: done.has(t.id) || stars.doneToday.has(t.id) }))
    .filter((t) => !t.due?.date || t.due.date <= today || t.ok);
  const count = (b: Bucket) => { const l = list.filter((t) => t.b === b); return { left: l.filter((t) => !t.ok).length, all: l.length }; };
  const rows = list.filter((t) => t.b === cur).sort((a, b) => Number(a.ok) - Number(b.ok));

  const tick = async (t: HostTask) => {
    if (done.has(t.id)) return;
    setDone((m) => new Map(m).set(t.id, Date.now())); setBurst((b) => b + 1);
    stars.setWeek((w) => (w ?? 0) + 1); stars.setTodayN((n) => n + 1);
    try {
      const r = await fetch('/api/todoist/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: t.id }) });
      if (!r.ok) throw new Error(String(r.status));
      setTimeout(() => { window.dispatchEvent(new Event('nora-stars:refresh')); load(); }, 4000);
    } catch {
      setDone((m) => { const n = new Map(m); n.delete(t.id); return n; });
      stars.setWeek((w) => Math.max(0, (w ?? 1) - 1)); stars.setTodayN((n) => Math.max(0, n - 1));
      setToast(`Couldn’t tick off ${shortName(t.content)}`);
    }
  };

  const bk = BUCKETS.find((b) => b.id === cur)!;
  const n = stars.week ?? 0; const left = Math.max(0, goal - n);
  const allDone = rows.length > 0 && rows.every((r) => r.ok);
  return (
    <div style={frame(style, { position: 'relative', gap: '0.6em' })}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em' }}>
        <h2 style={{ margin: 0, fontSize: '1.1em', fontWeight: 600 }}>{bk.emoji} {name}’s {bk.label.toLowerCase()}</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.3em' }}>
          {BUCKETS.filter((b) => b.id !== cur).map((b) => { const c = count(b.id); return (
            <button key={b.id} onClick={() => setPick({ b: b.id, at: Date.now() })} style={{ appearance: 'none', border: 'none', font: 'inherit', color: 'inherit', cursor: 'pointer', fontSize: '0.62em', padding: '0.35em 0.75em', borderRadius: '999px', background: ink(style, 0.07), opacity: 0.8, whiteSpace: 'nowrap' }}>
              {b.emoji} {b.label}{c.all ? ` · ${c.left ? `${c.left} left` : '✓'}` : ''}
            </button>); })}
        </div>
      </div>
      <div style={{ height: 1, background: ink(style, 0.08) }} />
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: rows.length > 3 ? '1fr 1fr' : '1fr', gridAutoRows: 'minmax(2.8em, 3.8em)', gap: '0.55em', alignContent: 'start', overflow: 'hidden' }}>
        {tasks && !rows.length && <div style={{ margin: 'auto', opacity: 0.5, fontSize: '0.9em' }}>Nothing for {bk.label.toLowerCase()} 🎉</div>}
        {rows.map((t) => (
          <button key={t.id} onClick={() => tick(t)} aria-label={`Done: ${shortName(t.content)}`} style={{ appearance: 'none', font: 'inherit', color: 'inherit', cursor: 'pointer', textAlign: 'left',
            display: 'flex', alignItems: 'center', gap: '0.7em', padding: '0 0.9em', minHeight: 0, borderRadius: '0.9em',
            border: `0.1em solid ${t.ok ? 'transparent' : ink(style, 0.12)}`, background: t.ok ? `color-mix(in srgb, ${accent} 14%, transparent)` : ink(style, 0.05), transition: 'background .3s' }}>
            <span style={{ fontSize: '1.6em', lineHeight: 1, filter: t.ok ? 'grayscale(0.4)' : 'none' }}>{emojiFor(t.content)}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: '1.05em', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: t.ok ? 0.55 : 1, textDecoration: t.ok ? 'line-through' : 'none' }}>{shortName(t.content)}</span>
            <span style={{ width: '1.7em', height: '1.7em', flexShrink: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `0.14em solid ${t.ok ? accent : ink(style, 0.35)}`, background: t.ok ? accent : 'transparent', color: '#fff' }}>
              {t.ok && <Icon d={I.check} size="1em" stroke={3} />}
            </span>
          </button>
        ))}
        {allDone && <div style={{ gridColumn: '1 / -1', alignSelf: 'center', textAlign: 'center', fontSize: '0.95em', fontWeight: 500, opacity: 0.75 }}>All done — great job, {name}! 🎉</div>}
      </div>
      {config.view !== 'routine' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8em', padding: '0.7em 0.9em', borderRadius: '0.9em', background: `color-mix(in srgb, ${accent} 10%, transparent)`, fontSize: '1.15em' }}>
          <div style={{ display: 'flex', gap: '0.12em', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
            {Array.from({ length: goal }, (_, i) => <Icon key={i} d={I.star} size="1.25em" stroke={1.6} fill={i < n ? accent : 'none'} style={{ color: i < n ? accent : ink(style, 0.25) }} />)}
          </div>
          <span style={{ fontSize: '0.72em', whiteSpace: 'nowrap' }}>
            {reward ? (left === 0 ? <b>Goal reached! {reward} 🎉</b> : <><b>{left} more</b> to {reward}</>) : `${n} this week`}
          </span>
          {stars.st > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: '0.2em', fontSize: '0.72em', fontWeight: 600, color: '#ea580c' }}><Icon d={I.flame} size="1.2em" stroke={1.8} />{stars.st}</span>}
        </div>
      )}
      {burst > 0 && <div key={burst} style={{ position: 'absolute', right: '1.2em', top: '2.6em', fontSize: '1.4em', fontWeight: 700, color: accent, pointerEvents: 'none', animation: 'nsPop 1.3s ease-out forwards' }}>+1 ⭐</div>}
      {toast && <div style={{ position: 'absolute', left: '50%', bottom: '1em', transform: 'translateX(-50%)', padding: '0.45em 0.9em', borderRadius: '999px', background: '#1c1917', color: '#fff', fontSize: '0.65em' }}>{toast}</div>}
      <style>{'@keyframes nsPop{0%{opacity:0;transform:translateY(0.4em) scale(.8)}20%{opacity:1;transform:translateY(0) scale(1.1)}100%{opacity:0;transform:translateY(-1.6em) scale(1)}}'}</style>
    </div>
  );
}

function RoutineWithStars(props: PluginComponentProps) {
  const now = useNow(60000);
  const stars = useStars(props.config, props.timezone, now);
  return <Routine {...props} stars={stars} />;
}

export default function NoraStars(props: PluginComponentProps) {
  const view = String(props.config.view ?? 'stars');
  if (view === 'routine' || view === 'both') return <RoutineWithStars {...props} />;
  return <StarsView {...props} />;
}
