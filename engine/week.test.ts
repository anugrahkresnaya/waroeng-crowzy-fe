import { describe, expect, it } from 'vitest';
import { content } from './content';
import { Game } from './game';
import { replay } from './replay';
import { isValidBlockPlan } from './schema';
import { playAnyDay, sleepThrough } from './testing/bot';
import { quietContent } from './testing/fixtures';

const fresh = (seed = 1, c = content) => new Game(c, { seed });

/** A game at the end of a shop day, ready for the evening. */
function atSummary(seed = 1) {
  const g = fresh(seed, quietContent());
  g.dispatch({ type: 'open', prepared: true });
  g.dispatch({ type: 'closeWarung' });
  return g;
}

describe('the weekly plan', () => {
  it('starts with the default plan and a work day on Monday', () => {
    const g = fresh();
    expect(g.state.workDays).toEqual([true, true, true, true, true, false, true]);
    expect(g.state.phase).toBe('idle');
    expect(g.state.offPlan.siang).toEqual(['narik-ojol']);
  });

  it('allows at most two days off a week, without a minimum', () => {
    const g = fresh();
    expect(g.dispatch({ type: 'setPlan', day: 2, work: false }).ok).toBe(true);
    expect(g.state.workDays.filter((w) => !w)).toHaveLength(2);
    expect(g.dispatch({ type: 'setPlan', day: 3, work: false })).toEqual({ ok: false, error: 'too_many_days_off' });
    expect(g.dispatch({ type: 'setPlan', day: 2, work: true }).ok).toBe(true);
    expect(g.dispatch({ type: 'setPlan', day: 5, work: true }).ok).toBe(true);
    expect(g.state.workDays.every(Boolean)).toBe(true);
    expect(g.dispatch({ type: 'setPlan', day: 9, work: true })).toEqual({ ok: false, error: 'invalid_amount' });
  });

  it('cannot be changed while the shop is open', () => {
    const g = fresh();
    g.dispatch({ type: 'open', prepared: false });
    expect(g.dispatch({ type: 'setPlan', day: 2, work: false })).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('validates day-off blocks: one heavy activity, or up to two light ones', () => {
    const g = fresh();
    expect(g.dispatch({ type: 'setBlock', block: 'sore', activities: ['istirahat-panjang'] }).ok).toBe(true);
    expect(g.dispatch({ type: 'setBlock', block: 'sore', activities: ['cek-chat', 'istirahat'] }).ok).toBe(true);
    expect(g.state.offPlan.sore).toEqual(['cek-chat', 'istirahat']);
    const bad = (activities: string[], block = 'sore') => g.dispatch({ type: 'setBlock', block, activities });
    expect(bad(['cek-chat', 'istirahat', 'cuci-baju'])).toEqual({ ok: false, error: 'invalid_activities' });
    expect(bad(['narik-ojol', 'cek-chat'])).toEqual({ ok: false, error: 'invalid_activities' });
    expect(bad(['narik-ojol', 'bantu-keluarga'])).toEqual({ ok: false, error: 'invalid_activities' });
    expect(bad(['cek-chat', 'cek-chat'])).toEqual({ ok: false, error: 'invalid_activities' });
    expect(bad(['ke-pasar'])).toEqual({ ok: false, error: 'invalid_activities' });
    expect(bad(['tidak-ada'])).toEqual({ ok: false, error: 'invalid_activities' });
    expect(bad(['cek-chat'], 'subuh')).toEqual({ ok: false, error: 'invalid_block' });
    expect(g.state.offPlan.sore).toEqual(['cek-chat', 'istirahat']);
  });

  it('the shipped default plan is valid', () => {
    for (const list of Object.values(content.balance.defaultOffPlan)) {
      expect(isValidBlockPlan(list, (id) => content.activityById[id])).toBe(true);
    }
  });
});

describe('the evening', () => {
  it('goes summary, free time, tomorrow question, then the next day', () => {
    const g = atSummary();
    expect(g.state.phase).toBe('ended');
    expect(g.dispatch({ type: 'spendFreeTime', activities: ['tv'] })).toEqual({ ok: false, error: 'wrong_phase' });
    g.dispatch({ type: 'goToNight' });
    expect(g.state.phase).toBe('night');
    expect(g.state.minute).toBe(1320);

    const mood = g.state.mood;
    const hunger = g.state.hunger;
    const res = g.dispatch({ type: 'spendFreeTime', activities: ['tv', 'makan'] });
    expect(res.ok && res.events.map((e) => e.type)).toEqual(['free_time_done']);
    expect(g.state.phase).toBe('bed');
    expect(g.state.minute).toBe(1440);
    expect(g.state.mood).toBe(mood + 8 + 4);
    expect(g.state.hunger).toBe(hunger - 35);
    expect(g.state.bank).toBe(0); // dinner costs money, but the bank cannot go below zero
  });

  it('rejects too many, repeated or unknown free-time activities and leaves state alone', () => {
    const g = atSummary();
    g.dispatch({ type: 'goToNight' });
    const before = JSON.stringify(g.state);
    for (const activities of [['chat', 'tv', 'makan', 'game', 'chat'], ['tv', 'tv'], ['tidur']]) {
      expect(g.dispatch({ type: 'spendFreeTime', activities })).toEqual({ ok: false, error: 'invalid_activities' });
    }
    expect(JSON.stringify(g.state)).toBe(before);
    expect(g.dispatch({ type: 'spendFreeTime', activities: ['chat', 'tv', 'makan', 'game'] }).ok).toBe(true);
  });

  it('keeps mood and hunger between 0 and 100', () => {
    const g = atSummary();
    g.state.mood = 98;
    g.state.hunger = 2;
    g.dispatch({ type: 'goToNight' });
    g.dispatch({ type: 'spendFreeTime', activities: ['game', 'tv', 'makan'] });
    expect(g.state.mood).toBe(100);
    expect(g.state.hunger).toBe(0);
  });

  it('a good day lifts mood, hunger rises with open hours and sleep', () => {
    const g = fresh(1, quietContent());
    g.dispatch({ type: 'open', prepared: true });
    g.state.stats.moods.happy = 20;
    g.state.minute = content.balance.closeMinute - 1;
    const mood = g.state.mood;
    const hunger = g.state.hunger;
    g.tick();
    expect(g.state.phase).toBe('ended');
    expect(g.state.mood).toBe(mood + 6);
    expect(g.state.hunger).toBeCloseTo(hunger + 2.5 * 15, 5);
  });
});

describe('tomorrow', () => {
  it('follows the plan when nothing is decided, a work day on Tuesday', () => {
    const g = atSummary();
    sleepThrough(g);
    expect(g.state.day).toBe(1);
    expect(g.state.phase).toBe('idle');
    expect(g.state.planConfirmed).toBe(false);
  });

  it('closing on a planned work day costs a little reputation', () => {
    const g = atSummary();
    const rep = g.state.reputation;
    g.dispatch({ type: 'goToNight' });
    g.dispatch({ type: 'spendFreeTime', activities: [] });
    g.dispatch({ type: 'decideTomorrow', open: false });
    const res = g.dispatch({ type: 'nextDay' });
    expect(res.ok && res.events.map((e) => e.type)).toEqual(['unplanned_closure', 'new_day']);
    expect(g.state.reputation).toBe(rep + content.balance.reputation.unplannedClosure);
    expect(g.state.phase).toBe('dayoff');
    expect(g.state.minute).toBe(300);
  });

  it('a planned day off costs nothing, and working a day off is allowed', () => {
    const planned = fresh(1, quietContent());
    planned.dispatch({ type: 'setPlan', day: 1, work: false });
    planned.dispatch({ type: 'open', prepared: false });
    planned.dispatch({ type: 'closeWarung' });
    const rep = planned.state.reputation;
    sleepThrough(planned);
    expect(planned.state.phase).toBe('dayoff');
    expect(planned.state.reputation).toBe(rep);

    const worked = fresh(1, quietContent());
    worked.dispatch({ type: 'setPlan', day: 1, work: false });
    worked.dispatch({ type: 'open', prepared: false });
    worked.dispatch({ type: 'closeWarung' });
    sleepThrough(worked, { open: true });
    expect(worked.state.phase).toBe('idle');
    expect(worked.state.reputation).toBe(rep);
  });

  it('asks for the weekly plan again every Sunday night', () => {
    const g = fresh(1, quietContent());
    g.state.day = 5; // Saturday, a day off by default
    g.state.phase = 'dayoff';
    while (g.state.phase === 'dayoff') g.dispatch({ type: 'runBlock' });
    g.dispatch({ type: 'spendFreeTime', activities: [] });
    g.dispatch({ type: 'confirmPlan' });
    expect(g.state.planConfirmed).toBe(true);
    g.dispatch({ type: 'nextDay' }); // into Sunday
    expect(g.state.day % 7).toBe(6);
    expect(g.state.planConfirmed).toBe(false);
    expect(g.dispatch({ type: 'confirmPlan' })).toEqual({ ok: false, error: 'wrong_phase' });
  });
});

describe('a day off', () => {
  it('starts at 05.00 when Monday is a day off', () => {
    const c = quietContent();
    c.balance.defaultWorkDays = [false, true, true, true, true, true, true];
    const g = new Game(c, { seed: 1 });
    expect(g.state.phase).toBe('dayoff');
    expect(g.state.minute).toBe(300);
  });

  it('runs the four blocks in order, applies their effects and ends in the evening', () => {
    const c = quietContent();
    c.balance.defaultWorkDays = [false, true, true, true, true, true, true];
    const g = new Game(c, { seed: 4 });
    const bank = g.state.bank;
    const mood = g.state.mood;
    const seen: string[] = [];
    while (g.state.phase === 'dayoff') {
      const r = g.dispatch({ type: 'runBlock' });
      expect(r.ok).toBe(true);
      if (r.ok) for (const e of r.events) if (e.type === 'block_done') seen.push(e.block);
    }
    expect(seen).toEqual(['pagi', 'siang', 'sore', 'malam']);
    expect(g.state.phase).toBe('night');
    expect(g.state.minute).toBe(1320);
    expect(g.state.bank).toBeGreaterThan(bank); // narik ojol pays more than it costs
    expect(g.state.mood).toBeGreaterThan(mood);
    expect(g.dispatch({ type: 'runBlock' })).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('is unaffected by shop commands', () => {
    const c = quietContent();
    c.balance.defaultWorkDays = [false, true, true, true, true, true, true];
    const d = new Game(c, { seed: 1 });
    expect(d.dispatch({ type: 'open', prepared: true })).toEqual({ ok: false, error: 'wrong_phase' });
    expect(d.dispatch({ type: 'exchangeCash', amount: 50000 })).toEqual({ ok: false, error: 'wrong_phase' });
  });
});

describe('a whole week', () => {
  function playWeek(seed: number) {
    const g = fresh(seed);
    for (let i = 0; i < 7; i++) {
      playAnyDay(g);
      sleepThrough(g);
    }
    return g;
  }

  it('plays seven days, with the Saturday off, and ends on Monday of week two', () => {
    const g = playWeek(5);
    expect(g.state.day).toBe(7);
    expect(g.state.phase).toBe('idle');
    expect(g.state.mood).toBeGreaterThanOrEqual(0);
    expect(g.state.mood).toBeLessThanOrEqual(100);
    expect(g.state.hunger).toBeGreaterThanOrEqual(0);
    expect(g.state.hunger).toBeLessThanOrEqual(100);
    expect(Object.values(g.state.drawer).every((n) => n >= 0)).toBe(true);
    expect(g.state.bank).toBeGreaterThanOrEqual(0);
  });

  it('is deterministic and replays exactly, across days and phases', () => {
    const a = playWeek(9);
    const b = playWeek(9);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    expect(JSON.stringify(replay(content, 9, a.log).state)).toBe(JSON.stringify(a.state));
  });

  it('a snapshot taken mid-evening resumes to the same week', () => {
    const a = fresh(2);
    playAnyDay(a);
    a.dispatch({ type: 'goToNight' });
    const saved = JSON.parse(JSON.stringify(a.snapshot()));
    const b = Game.fromSnapshot(content, saved);
    for (const g of [a, b]) {
      g.dispatch({ type: 'spendFreeTime', activities: ['chat', 'makan'] });
      g.dispatch({ type: 'nextDay' });
      playAnyDay(g);
    }
    expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
  });
});
