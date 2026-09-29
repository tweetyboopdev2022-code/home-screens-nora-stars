import React from 'react';
import type { PluginComponentProps } from './hs-plugin';
import { frame, ink, Header, Icon, I, sdk, dayKey, useNow, Fit, useBox } from './ui';

const API = 'https://api.todoist.com/api/v1';
const AUTH = { header: { Authorization: 'Bearer {{todoist_token}}' } };
async function call(url: string) {
  const res: Response = await sdk().pluginFetch('nora-stars', { url, cacheTtlMs: 60000, secretInjections: AUTH });
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

export default function Stars({ config, style, timezone: tz }: PluginComponentProps) {
  const now = useNow(60000);
  const name = String(config.name || 'Nora'); const projectName = String(config.projectName || name);
  const goal = Math.max(1, Number(config.weeklyGoal ?? 15)); const reward = String(config.reward || '');
  const accent = String(config.accentColor || '#db2777');
  const [week, setWeek] = React.useState<number | null>(null);
  const [todayN, setTodayN] = React.useState(0);
  const [st, setSt] = React.useState(0);
  const [err, setErr] = React.useState<string | null>(null);
  const tick = Math.floor(now.getTime() / 300000);

  React.useEffect(() => { (async () => {
    try {
      const pj = await call(`${API}/projects?limit=200`);
      const p = (pj.results ?? pj).find((x: any) => String(x.name).toLowerCase() === projectName.toLowerCase());
      if (!p) { setErr(`No Todoist project “${projectName}”`); return; }
      const since = new Date(now.getTime() - 30 * 86400000);
      // Repeating chores never show as "completed" tasks (Todoist just moves the due date),
      // so count completion events from the activity log (no date_from: the free plan refuses
      // ranges older than its ~1 week history); fall back to completed tasks.
      let times: number[] = [];
      try {
        let cursor = ''; 
        for (let page = 0; page < 5; page++) {
          const a = await call(`${API}/activities?object_type=item&event_type=completed&parent_project_id=${p.id}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
          times.push(...(a.results ?? a.events ?? []).map((e: any) => new Date(e.event_date).getTime()));
          cursor = a.next_cursor; if (!cursor) break;
        }
      } catch { times = []; }
      if (!times.length) {
        const j = await call(`${API}/tasks/completed/by_completion_date?since=${encodeURIComponent(since.toISOString())}&until=${encodeURIComponent(new Date().toISOString())}&project_id=${p.id}&limit=200`);
        times = (j.items ?? j.results ?? []).map((i: any) => new Date(i.completed_at).getTime());
      }
      times = times.filter((t) => Number.isFinite(t) && t >= since.getTime());
      const ws = weekStartDate(now, Number(config.weekStart ?? 1)).getTime();
      const days = new Set(times.map((t) => dayKey(new Date(t), tz)));
      setWeek(times.filter((t) => t >= ws).length);
      setTodayN(times.filter((t) => dayKey(new Date(t), tz) === dayKey(now, tz)).length);
      setSt(streak(days, now, tz)); setErr(null);
    } catch (e) { setErr(/HTTP (401|403|500)/.test(String((e as Error).message)) ? 'Add your Todoist API token in Plugins → nora-stars.' : 'Can’t reach Todoist right now.'); }
  })(); }, [tick, projectName]);  // eslint-disable-line react-hooks/exhaustive-deps

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
