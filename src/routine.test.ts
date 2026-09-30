import { describe, it, expect } from 'vitest';
import { bucketOf, bucketNow, shortName, isDone, emojiFor } from './routine';
describe('routine', () => {
  it('buckets', () => {
    expect(bucketOf('Make bed')).toBe('morning'); expect(bucketOf('Brush teeth (morning)')).toBe('morning');
    expect(bucketOf('Brush teeth (bedtime)')).toBe('bedtime'); expect(bucketOf('Homework')).toBe('after');
    expect(bucketOf('Anything', 'Bedtime')).toBe('bedtime');
  });
  it('now', () => { expect(bucketNow(8)).toBe('morning'); expect(bucketNow(15)).toBe('after'); expect(bucketNow(19)).toBe('bedtime'); });
  it('names', () => { expect(shortName('Brush teeth (bedtime)')).toBe('Brush teeth'); expect(emojiFor('Brush teeth')).toBe('🪥'); });
  it('done', () => { expect(isDone({ date: '2026-10-01' }, '2026-09-30')).toBe(true); expect(isDone({ date: '2026-09-29' }, '2026-09-30')).toBe(false); });
});
