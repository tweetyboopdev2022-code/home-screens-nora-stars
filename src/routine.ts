export type Bucket = 'morning' | 'after' | 'bedtime';
export const BUCKETS: { id: Bucket; label: string; emoji: string }[] = [
  { id: 'morning', label: 'Morning', emoji: '🌅' },
  { id: 'after', label: 'After school', emoji: '🎒' },
  { id: 'bedtime', label: 'Bedtime', emoji: '🌙' },
];
export function bucketOf(content: string, section = ''): Bucket {
  const s = section.toLowerCase();
  if (/morning|matin/.test(s)) return 'morning';
  if (/bed|night|soir/.test(s)) return 'bedtime';
  if (/after|school|afternoon/.test(s)) return 'after';
  const c = content.toLowerCase();
  if (/bedtime|night|pyjama|pajama|bath|shower|floss/.test(c)) return 'bedtime';
  if (/morning|make (the |your )?bed|breakfast|get dressed|lunch ?box/.test(c)) return 'morning';
  return 'after';
}
export function bucketNow(hour: number, morningUntil = 11, bedtimeFrom = 17): Bucket {
  return hour < morningUntil ? 'morning' : hour >= bedtimeFrom ? 'bedtime' : 'after';
}
/** Name without the "(morning)" style hint, since the section already says it. */
export const shortName = (c: string) => c.replace(/\s*\((morning|bedtime|night|after school|evening)\)\s*/i, ' ').replace(/\s+/g, ' ').trim();
const EMOJI: [RegExp, string][] = [
  [/teeth|brush/i, '🪥'], [/bed\b|make bed/i, '🛏️'], [/dress|clothes/i, '👕'], [/breakfast|eat/i, '🥣'], [/backpack|bag/i, '🎒'],
  [/homework|study/i, '📚'], [/read/i, '📖'], [/bath|shower/i, '🛁'], [/pyjama|pajama/i, '🌙'], [/toy|tidy|clean/i, '🧸'],
  [/dish|table/i, '🍽️'], [/cat|dog|pet|feed/i, '🐾'], [/piano|music|practice/i, '🎹'], [/hair/i, '💇'], [/water|plant/i, '🪴'],
];
export const emojiFor = (c: string) => EMOJI.find(([r]) => r.test(c))?.[1] ?? '⭐';
/** A repeating chore that's already been ticked today has its due date pushed past today. */
export const isDone = (due: { date?: string } | null | undefined, today: string) => !!due?.date && due.date > today;
