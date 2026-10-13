// Rupiah notes and coins, the cash drawer, and making change.

export const DENOMS = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100] as const;

/** denomination -> how many pieces. Keys become strings in JSON, which is fine. */
export type Pieces = Record<number, number>;

export function total(pieces: Pieces): number {
  let sum = 0;
  for (const d of DENOMS) sum += d * (pieces[d] ?? 0);
  return sum;
}

export function isValidPieces(pieces: Pieces): boolean {
  for (const [key, count] of Object.entries(pieces)) {
    if (!(DENOMS as readonly number[]).includes(Number(key))) return false;
    if (!Number.isInteger(count) || count < 0) return false;
  }
  return true;
}

export function addPieces(target: Pieces, add: Pieces): void {
  for (const d of DENOMS) {
    const n = add[d] ?? 0;
    if (n > 0) target[d] = (target[d] ?? 0) + n;
  }
}

export function hasPieces(have: Pieces, need: Pieces): boolean {
  return DENOMS.every((d) => (have[d] ?? 0) >= (need[d] ?? 0));
}

/** Removes pieces the caller already checked with hasPieces. */
export function removePieces(from: Pieces, take: Pieces): void {
  for (const d of DENOMS) {
    const n = take[d] ?? 0;
    if (n > 0) from[d] = (from[d] ?? 0) - n;
  }
}

export function clonePieces(pieces: Pieces): Pieces {
  const out: Pieces = {};
  for (const d of DENOMS) if ((pieces[d] ?? 0) > 0) out[d] = pieces[d];
  return out;
}

/** Fewest pieces for an amount with unlimited stock. Null if not a multiple of 100. */
export function exactPieces(amount: number): Pieces | null {
  if (!Number.isInteger(amount) || amount < 0 || amount % 100 !== 0) return null;
  const out: Pieces = {};
  let rest = amount;
  for (const d of DENOMS) {
    const n = Math.floor(rest / d);
    if (n > 0) {
      out[d] = n;
      rest -= n * d;
    }
  }
  return out;
}

const SEARCH_LIMIT = 20000;

/** Exact change from the pieces on hand, or null when the drawer cannot make it. */
export function makeChange(amount: number, available: Pieces): Pieces | null {
  if (!Number.isInteger(amount) || amount < 0 || amount % 100 !== 0) return null;
  const suffix: number[] = new Array(DENOMS.length + 1).fill(0);
  for (let i = DENOMS.length - 1; i >= 0; i--) {
    suffix[i] = suffix[i + 1] + DENOMS[i] * (available[DENOMS[i]] ?? 0);
  }
  const used: Pieces = {};
  let nodes = 0;
  const search = (i: number, remaining: number): boolean => {
    if (remaining === 0) return true;
    if (i >= DENOMS.length || remaining > suffix[i] || ++nodes > SEARCH_LIMIT) return false;
    const d = DENOMS[i];
    const most = Math.min(available[d] ?? 0, Math.floor(remaining / d));
    for (let n = most; n >= 0; n--) {
      used[d] = n;
      if (search(i + 1, remaining - n * d)) return true;
    }
    used[d] = 0;
    return false;
  };
  if (!search(0, amount)) return null;
  return clonePieces(used);
}

/** Pays out as much of `amount` as the drawer allows (used when a customer demands the rest). */
export function payOutBestEffort(available: Pieces, amount: number): Pieces {
  const exact = makeChange(amount, available);
  if (exact) return exact;
  const out: Pieces = {};
  let rest = amount;
  for (const d of DENOMS) {
    const n = Math.min(available[d] ?? 0, Math.floor(rest / d));
    if (n > 0) {
      out[d] = n;
      rest -= n * d;
    }
  }
  return out;
}

/** Small notes and coins handed over when big notes are exchanged (a mix that a drawer can actually use). */
export function exchangeBreakdown(net: number): Pieces {
  const out: Pieces = {};
  let rest = net;
  for (const [d, share] of [[10000, 0.4], [5000, 0.3], [2000, 0.2], [1000, 0.1]] as const) {
    const n = Math.floor((net * share) / d);
    if (n > 0) {
      out[d] = n;
      rest -= n * d;
    }
  }
  addPieces(out, exactPieces(rest) ?? {});
  return out;
}

/** Smallest single note at least `bill`; above 100.000 it rounds up to a multiple of 10.000. */
export function smallestNoteAtLeast(bill: number): Pieces {
  for (const d of [1000, 2000, 5000, 10000, 20000, 50000, 100000]) {
    if (d >= bill) return { [d]: 1 };
  }
  return exactPieces(Math.ceil(bill / 10000) * 10000) as Pieces;
}

/** `100000` notes, as many as needed to cover the bill. */
export function bigNotes(bill: number): Pieces {
  return { 100000: Math.max(1, Math.ceil(bill / 100000)) };
}
