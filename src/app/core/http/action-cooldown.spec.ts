import { ActionCooldown } from './action-cooldown';

describe('ActionCooldown', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stays active for the requested wait and then releases the action', () => {
    const cooldown = new ActionCooldown();

    cooldown.start(3);
    expect(cooldown.active()).toBe(true);
    expect(cooldown.secondsLeft()).toBe(3);

    vi.advanceTimersByTime(1000);
    expect(cooldown.secondsLeft()).toBe(2);

    vi.advanceTimersByTime(2000);
    expect(cooldown.active()).toBe(false);
    expect(cooldown.secondsLeft()).toBe(0);
  });

  it('restarting replaces the previous wait', () => {
    const cooldown = new ActionCooldown();

    cooldown.start(60);
    cooldown.start(2);
    vi.advanceTimersByTime(2000);

    expect(cooldown.active()).toBe(false);
  });

  it('stop releases the action at once', () => {
    const cooldown = new ActionCooldown();

    cooldown.start(30);
    cooldown.stop();

    expect(cooldown.active()).toBe(false);
  });
});
