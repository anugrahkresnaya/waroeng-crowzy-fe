import { describe, expect, it } from 'vitest';
import { content } from './content';
import { Game } from './game';
import { phoneAlive, qrisCheck, signalOf } from './phone';
import { replay } from './replay';
import { addCustomer, kitchenContent, passDay } from './testing/fixtures';
import type { Command, Outage } from './types';

const p = content.balance.phone;
const sig = p.signal;

/** An open shop, with a customer who wants to pay by QRIS at the counter and a PLN cut that began `elapsed` minutes ago. */
function qrisShop(elapsed: number | null, patch: (g: Game) => void = () => {}) {
  const g = new Game(kitchenContent(), { seed: 1 });
  g.dispatch({ type: 'open', prepared: true });
  if (elapsed !== null) {
    g.state.minute = 600 + elapsed;
    g.state.outage = { day: 0, from: 600, hours: 8, known: false, ice: false } satisfies Outage;
  }
  patch(g);
  const c = addCustomer(g, { order: [{ itemId: 'keripik', qty: 1 }], method: 'qris', patience: 100 });
  g.dispatch({ type: 'pick', itemId: 'keripik' });
  g.dispatch({ type: 'confirmOrder' });
  return { g, c };
}
const types = (events: Array<{ type: string }>) => events.map((e) => e.type);

describe('the phone battery', () => {
  it('stays full while the power is on, and drains while it is out', () => {
    const g = new Game(kitchenContent(), { seed: 1 });
    g.dispatch({ type: 'open', prepared: true });
    for (let i = 0; i < 30; i++) g.tick();
    expect(g.state.phone.battery).toBe(100);
    g.state.token = 0;
    for (let i = 0; i < 10; i++) g.tick();
    expect(g.state.phone.battery).toBeCloseTo(100 - 10 * p.drainPerMinute, 6);
  });

  it('charges back up when the power returns, and warns once when it gets low', () => {
    const g = new Game(kitchenContent(), { seed: 1 });
    g.dispatch({ type: 'open', prepared: true });
    g.state.token = 0;
    g.state.phone.battery = p.lowBattery + p.drainPerMinute / 2;
    expect(types(g.tick())).toContain('phone_low');
    expect(types(g.tick())).not.toContain('phone_low');
    g.state.token = 10000;
    g.tick();
    expect(g.state.phone.battery).toBeGreaterThan(p.lowBattery);
  });

  it('a powerbank takes over when the battery is flat, and the phone is dead only when both are', () => {
    const g = new Game(kitchenContent(), { seed: 1 });
    g.dispatch({ type: 'open', prepared: true });
    g.state.token = 0;
    g.state.phone.battery = 0;
    g.state.phone.powerbank = 1;
    expect(phoneAlive(g.state)).toBe(true);
    for (let i = 0; i < 10; i++) g.tick();
    expect(g.state.phone.powerbank).toBe(0);
    expect(phoneAlive(g.state)).toBe(false);
  });

  it('is full again the next morning if the power is on, but not with an empty token', () => {
    const ok = new Game(kitchenContent(), { seed: 1 });
    ok.state.phone.battery = 10;
    passDay(ok);
    expect(ok.state.phone.battery).toBe(100);
    const dry = new Game(kitchenContent(), { seed: 1 });
    dry.state.token = 0;
    dry.state.phone.battery = 10;
    passDay(dry);
    expect(dry.state.phone.battery).toBe(10);
  });

  it('a powerbank is bought once, from the bank, with an errand', () => {
    const g = new Game(kitchenContent(), { seed: 1 });
    const bank = g.state.bank;
    expect(g.dispatch({ type: 'buyPowerbank' }).ok).toBe(true);
    expect(g.state.bank).toBe(bank - p.powerbank.price);
    expect(g.state.phone.powerbank).toBe(p.powerbank.capacity);
    expect(g.dispatch({ type: 'buyPowerbank' })).toEqual({ ok: false, error: 'already_owned' });
  });
});

describe('the QRIS signal in a PLN cut', () => {
  it('is normal while the towers last, then slow, then down, and back when the power is', () => {
    const at = (elapsed: number) => {
      const g = qrisShop(elapsed).g;
      return signalOf(g.state, g.content);
    };
    expect(at(0)).toBe('good');
    expect(at(sig.backupMinutes - 1)).toBe('good');
    expect(at(sig.backupMinutes)).toBe('slow');
    expect(at(sig.backupMinutes + sig.slowMinutes - 1)).toBe('slow');
    expect(at(sig.backupMinutes + sig.slowMinutes)).toBe('down');
    const g = qrisShop(null).g;
    expect(signalOf(g.state, g.content)).toBe('good');
  });

  it('a token that ran out does not affect the towers', () => {
    const g = qrisShop(null, (x) => (x.state.token = 0)).g;
    expect(signalOf(g.state, g.content)).toBe('good');
  });
});

describe('checking a QRIS payment', () => {
  it('uses a little data and puts the money in the bank', () => {
    const { g, c } = qrisShop(null);
    const data = g.state.phone.data;
    const bank = g.state.bank;
    expect(g.dispatch({ type: 'confirmQris' }).ok).toBe(true);
    expect(g.state.phone.data).toBe(data - p.dataCosts.qris);
    expect(g.state.bank).toBeGreaterThan(bank);
    expect(g.state.line).not.toContain(c);
  });

  it('a slow signal costs the customer some patience but goes through', () => {
    const { g, c } = qrisShop(sig.backupMinutes + 1);
    const patience = c.patience;
    expect(g.dispatch({ type: 'confirmQris' }).ok).toBe(true);
    expect(c.patience).toBe(Math.max(1, patience - sig.slowPatience));
  });

  it.each([
    ['signal down', () => qrisShop(sig.backupMinutes + sig.slowMinutes + 1), 'signal'],
    ['no data', () => qrisShop(null, (g) => (g.state.phone.data = 0)), 'data'],
    ['a dead phone', () => qrisShop(null, (g) => ((g.state.phone.battery = 0), (g.state.token = 0))), 'battery'],
  ] as const)('cannot be checked with %s, and refuses without changing anything', (_name, make, reason) => {
    const { g } = make();
    expect(qrisCheck(g.state, g.content)).toMatchObject({ ok: false, reason });
    const before = JSON.stringify(g.state);
    expect(g.dispatch({ type: 'confirmQris' })).toEqual({ ok: false, error: 'cannot_verify' });
    expect(JSON.stringify(g.state)).toBe(before);
  });

  it('trust and refuse are only offered when the payment cannot be checked', () => {
    const { g } = qrisShop(null);
    expect(g.dispatch({ type: 'trustQris' })).toEqual({ ok: false, error: 'can_verify' });
    expect(g.dispatch({ type: 'refuseQris' })).toEqual({ ok: false, error: 'can_verify' });
  });
});

describe('taking a customer at their word', () => {
  const down = () => qrisShop(sig.backupMinutes + sig.slowMinutes + 1);

  it('makes the sale but leaves the money waiting, and the player does not know yet', () => {
    const { g, c } = down();
    const bank = g.state.bank;
    const res = g.dispatch({ type: 'trustQris' });
    expect(types((res as { events: Array<{ type: string }> }).events)).toContain('qris_trusted');
    expect(g.state.bank).toBe(bank);
    expect(g.state.qrisPending).toHaveLength(1);
    expect(g.state.qrisPending[0].amount).toBe(c.bill);
    expect(g.state.stats.served).toBe(1);
  });

  it('once the signal is back, a real payment lands in the bank and a fake one does not', () => {
    for (const fake of [false, true]) {
      const { g, c } = down();
      g.dispatch({ type: 'trustQris' });
      g.state.qrisPending[0].fake = fake;
      const bank = g.state.bank;
      g.state.outage = null; // the power and the towers are back
      const events = g.tick();
      expect(g.state.qrisPending).toEqual([]);
      const fee = Math.ceil((c.bill * g.content.balance.qrisFeeBp) / 10000);
      expect(g.state.bank).toBe(fake ? bank : bank + c.bill - fee);
      expect(events.find((e) => e.type === 'qris_settled')).toMatchObject(fake ? { received: 0, lost: c.bill } : { received: c.bill - fee, lost: 0 });
      expect(g.state.stats.qrisFake).toBe(fake ? c.bill : 0);
    }
  });

  it('the bank statement settles it overnight even if the phone never recovered', () => {
    const { g, c } = down();
    g.dispatch({ type: 'trustQris' });
    g.state.qrisPending[0].fake = false;
    const bank = g.state.bank;
    g.dispatch({ type: 'closeWarung' });
    passDay(g);
    expect(g.state.qrisPending).toEqual([]);
    expect(g.state.bank).toBeGreaterThan(bank + c.bill - 1000 - 100000); // landed (the bank also pays the token and a day's costs)
  });

  it('is fake about as often as the content says', () => {
    let fakes = 0;
    const n = 200;
    for (let seed = 0; seed < n; seed++) {
      const g = new Game(kitchenContent(), { seed });
      g.dispatch({ type: 'open', prepared: true });
      g.state.token = 0;
      g.state.phone.battery = 0;
      addCustomer(g, { order: [{ itemId: 'keripik', qty: 1 }], method: 'qris', patience: 100 });
      g.dispatch({ type: 'pick', itemId: 'keripik' });
      g.dispatch({ type: 'confirmOrder' });
      g.dispatch({ type: 'trustQris' });
      if (g.state.qrisPending[0].fake) fakes++;
    }
    expect(fakes / n).toBeGreaterThan(sig.fakeChance - 0.1);
    expect(fakes / n).toBeLessThan(sig.fakeChance + 0.1);
  });

  it('refusing sends the customer away, costs reputation, and the sale is lost', () => {
    const { g } = down();
    const rep = g.state.reputation;
    const served = g.state.stats.served;
    const res = g.dispatch({ type: 'refuseQris' });
    expect(types((res as { events: Array<{ type: string }> }).events)).toContain('walkaway');
    expect(g.state.stats.qrisRefused).toBe(1);
    expect(g.state.stats.served).toBe(served);
    expect(g.state.reputation).toBeLessThan(rep);
    expect(g.state.qrisPending).toEqual([]);
  });
});

describe('mobile data', () => {
  it('the market app needs data and a working phone, and uses data per order', () => {
    const g = new Game(kitchenContent(), { seed: 1 });
    const order: Command = { type: 'placeOrder', supplier: 'pak-slamet', lines: [{ key: 'tisu', qty: 1 }], express: false };
    const data = g.state.phone.data;
    expect(g.dispatch(order).ok).toBe(true);
    expect(g.state.phone.data).toBe(data - p.dataCosts.order);

    g.state.phone.data = p.dataCosts.order - 1;
    const before = JSON.stringify(g.state);
    expect(g.dispatch(order)).toEqual({ ok: false, error: 'no_data' });
    expect(JSON.stringify(g.state)).toBe(before);

    g.state.phone.data = 1000;
    g.state.phone.battery = 0;
    g.state.token = 0;
    expect(g.dispatch(order)).toEqual({ ok: false, error: 'phone_dead' });
  });

  it('warns once when data runs low', () => {
    const g = new Game(kitchenContent(), { seed: 1 });
    g.state.phone.data = p.lowData + p.dataCosts.order - 1;
    const res = g.dispatch({ type: 'placeOrder', supplier: 'pak-slamet', lines: [{ key: 'tisu', qty: 1 }], express: false });
    expect(types((res as { events: Array<{ type: string }> }).events)).toContain('data_low');
  });

  it('a pack is paid in cash from the drawer, and refused if the drawer cannot make the amount', () => {
    const g = new Game(kitchenContent(), { seed: 1 });
    const cash = Object.entries(g.state.drawer).reduce((s, [k, v]) => s + Number(k) * v, 0);
    const data = g.state.phone.data;
    expect(g.dispatch({ type: 'buyData', pack: 0 }).ok).toBe(true);
    expect(g.state.phone.data).toBe(data + p.dataPacks[0].mb);
    expect(Object.entries(g.state.drawer).reduce((s, [k, v]) => s + Number(k) * v, 0)).toBe(cash - p.dataPacks[0].price);

    expect(g.dispatch({ type: 'buyData', pack: 9 })).toEqual({ ok: false, error: 'invalid_amount' });
    g.state.drawer = {};
    const before = JSON.stringify(g.state);
    expect(g.dispatch({ type: 'buyData', pack: 1 })).toEqual({ ok: false, error: 'not_in_drawer' });
    expect(JSON.stringify(g.state)).toBe(before);
  });
});

describe('replay', () => {
  it('rebuilds a run with trusted payments, a powerbank and data packs', () => {
    const c = kitchenContent();
    const g = new Game(c, { seed: 4 });
    g.dispatch({ type: 'buyPowerbank' });
    g.dispatch({ type: 'buyData', pack: 0 });
    g.dispatch({ type: 'open', prepared: true });
    for (let i = 0; i < 20; i++) g.tick();
    g.dispatch({ type: 'closeWarung' });
    const again = replay(c, 4, g.log);
    expect(again.state.tick).toBe(g.state.tick);
    expect(again.state.phone).toEqual(g.state.phone);
    expect(again.state.bank).toBe(g.state.bank);
    expect(JSON.stringify(again.state) === JSON.stringify(g.state)).toBe(true);
  });
});
