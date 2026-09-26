import { nextPollDelayMs } from './polling';

describe('nextPollDelayMs', () => {
  it('grows by half on each attempt and stops at the cap', () => {
    expect(nextPollDelayMs(0, 2000, 10000)).toBe(2000);
    expect(nextPollDelayMs(1, 2000, 10000)).toBe(3000);
    expect(nextPollDelayMs(2, 2000, 10000)).toBe(4500);
    expect(nextPollDelayMs(10, 2000, 10000)).toBe(10000);
  });

  it('honours the wait the backend asked for', () => {
    expect(nextPollDelayMs(0, 2000, 10000, 45)).toBe(45000);
  });
});
