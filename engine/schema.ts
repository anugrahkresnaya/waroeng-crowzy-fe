// Zod schemas for the content JSON. Bad data fails at load, never mid-game.
import { z } from 'zod';
import { DAY_PARTS } from './clock';
import { DENOMS } from './money';

const localized = z.object({ id: z.string().min(1), en: z.string().min(1) });
const positiveInt = z.number().int().positive();
const weight = z.number().min(0);

const SWINGS = ['low', 'medium', 'high'] as const;
export const INGREDIENT_CATEGORIES = ['pokok', 'protein', 'sayur', 'minuman', 'perlengkapan'] as const;

export const itemSchema = z
  .object({
    id: z.string().min(1),
    art: z.string().min(1),
    name: localized,
    category: z.enum(['makanan', 'minuman', 'lainnya']),
    /** A dish is cooked to order from ingredients; a good is bought and sold as it is. */
    kind: z.enum(['dish', 'good']),
    /** The selling price. For a dish this is only the starting menu price; the player sets it. */
    price: positiveInt.refine((n) => n % 100 === 0, 'price must be a multiple of 100'),
    /** The usual neighborhood price, shown next to the menu price. */
    reference: positiveInt.optional(),
    /** Dish only: amounts of each ingredient per normal portion, in the ingredient's base unit. */
    recipe: z.record(z.string(), z.number().positive()).optional(),
    /** Dish only: cooked ahead in batches and kept on the display. Without it a dish is cooked to order from the pantry. */
    batch: z
      .object({
        /** Portions one batch makes. */
        portions: positiveInt,
        /** Minutes of the cook's time one batch takes. */
        minutes: positiveInt,
        /** Minutes it stays good on the display. */
        freshMinutes: positiveInt,
      })
      .optional(),
    /** Dish only: cooked to order on a burner. The player plates it when it is done: too early is undercooked, too late is burnt. */
    cook: z
      .object({
        /** Game minutes on the burner until it is just right. */
        minutes: positiveInt,
        /** How many minutes either side of that still count as just right. */
        window: z.number().int().min(0),
      })
      .optional(),
    /** Good only: what one piece costs from the supplier, and how many pieces come in one pack. */
    buyPrice: positiveInt.optional(),
    pack: positiveInt.optional(),
    /** Good only: it must be kept in the freezer, and each piece takes this many freezer slots. */
    frozen: z.object({ slots: z.number().positive() }).optional(),
    /** Good only: taken on consignment (titipan). Never bought on the market; `buyPrice` is what the neighbour is owed for each one sold. */
    consign: z.boolean().optional(),
    ageRestricted: z.boolean().default(false),
  })
  .refine((i) => !(i.batch && i.cook), { message: 'a dish is cooked either in batches or to order' })
  .refine((i) => i.kind === 'dish' || (!i.batch && !i.cook), { message: 'only a dish can be cooked in batches' })
  .refine((i) => i.kind === 'good' || !i.frozen, { message: 'only a good can be frozen' })
  .refine((i) => i.kind === 'good' || !i.consign, { message: 'only a good can be consigned' })
  .refine((i) => (i.kind === 'dish' ? !!i.recipe && Object.keys(i.recipe).length > 0 : !!i.buyPrice && !!i.pack), {
    message: 'a dish needs a recipe, a good needs buyPrice and pack',
  });

export const ingredientSchema = z.object({
  id: z.string().min(1),
  art: z.string().min(1),
  category: z.enum(INGREDIENT_CATEGORIES),
  name: localized,
  /** The unit it is sold in (kg, bungkus...). */
  unit: localized,
  /** How many base units one sold unit holds (1000 g per kg, 16 eggs per kg). Recipes use base units. */
  unitSize: z.number().positive(),
  /** What one base unit is called (g, ml, butir), for showing recipes. */
  baseUnit: localized,
  /** Base price per sold unit. */
  price: positiveInt,
  swing: z.enum(SWINGS),
  /** Days it stays usable after purchase, at room temperature or in the fridge. Null means it does not spoil there. */
  life: z.object({
    room: z.number().int().min(0).nullable(),
    fridge: z.number().int().min(0).nullable(),
    /** Days in the freezer; null means it keeps. Missing means it cannot be frozen. */
    freezer: z.number().int().min(0).nullable().optional(),
  }),
});

export const supplierSchema = z.object({
  id: z.string().min(1),
  name: localized,
  /** Multiplies the market price. Reliable suppliers cost a bit more. */
  priceMul: z.number().positive(),
  deliveryFee: z.number().int().min(0),
  /** Delivery is free from this subtotal, or never when null. */
  freeAbove: z.number().int().positive().nullable(),
  minOrder: z.number().int().min(0),
  /** Chance an order arrives a day late. */
  lateChance: z.number().min(0).max(1),
});

const match = z.array(z.string().min(1)).min(1);

/** How a stretch of days changes the crowd: all arrivals, arrivals by day part, and how often an item is asked for. */
const demandEffect = z.object({
  arrivalMul: z.number().positive().default(1),
  partMul: z.partialRecord(z.enum(['morning', 'lunch', 'afternoon', 'evening', 'night']), z.number().positive()).default({}),
  itemMul: z.record(z.string(), z.number().positive()).default({}),
});

export const marketSchema = z.object({
  calendarStart: z.object({ year: z.number().int(), month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31) }),
  historyDays: positiveInt,
  /** How much of the daily noise pulls back toward zero each day. */
  reversion: z.number().min(0).max(1),
  swings: z.object({
    low: z.object({ daily: z.number().min(0), cap: z.number().min(0) }),
    medium: z.object({ daily: z.number().min(0), cap: z.number().min(0) }),
    high: z.object({ daily: z.number().min(0), cap: z.number().min(0) }),
  }),
  /** No random events before this day, so the first days are calm. */
  eventsFromDay: z.number().int().min(0),
  seasons: z.array(
    z.object({
      id: z.string().min(1),
      from: z.object({ month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31) }),
      to: z.object({ month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31) }),
      effects: z.array(z.object({ match, mul: z.number().positive() })).min(1),
    }),
  ),
  events: z.array(
    z.object({
      id: z.string().min(1),
      chancePerDay: z.number().min(0).max(1),
      /** Days between the headline and the price moving. */
      leadDays: z.number().int().min(0),
      /** How long the price effect lasts, or null for a permanent step. */
      duration: z.number().int().positive().nullable(),
      decay: z.enum(['linear', 'none']),
      /** Added chance of late deliveries while it lasts. */
      lateBoost: z.number().min(0).max(1),
      months: z.array(z.number().int().min(1).max(12)).optional(),
      effects: z.array(z.object({ match, delta: z.number() })).min(1),
    }),
  ),
  ordering: z.object({
    /** Orders placed before this minute arrive tomorrow, later ones the day after. */
    cutoffMinute: z.number().int(),
    expressFee: z.number().int().min(0),
    /** Extra delivery fee when an order holds frozen goods (cold transport). */
    frozenFee: z.number().int().min(0),
    expressMinutes: positiveInt,
    windowStart: z.number().int(),
    windowEnd: z.number().int(),
  }),
  pasar: z.object({
    /** Haggling moves the price by up to this fraction either way. */
    haggle: z.number().min(0).max(0.5),
    grosir: z.array(z.object({ min: positiveInt, off: z.number().min(0).max(0.5) })),
  }),
  /** Who comes when: fasting, holidays and long weekends move the crowd. Dates repeat yearly unless a holiday names its year. */
  demand: z.object({
    /** A headline this many days before a period or holiday starts. */
    noticeDays: z.number().int().min(1),
    /** A holiday on a Monday or Friday makes the weekend around it a long weekend. */
    longWeekend: demandEffect,
    periods: z.array(
      z.object({
        id: z.string().min(1),
        from: z.object({ month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31) }),
        to: z.object({ month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31) }),
      }).merge(demandEffect),
    ),
    holidays: z.array(
      z.object({
        id: z.string().min(1),
        year: z.number().int().optional(),
        month: z.number().int().min(1).max(12),
        day: z.number().int().min(1).max(31),
      }).merge(demandEffect),
    ),
  }),
  /** How many sold units of fridge-friendly goods fit in the small fridge. */
  fridgeCapacity: z.number().min(0),
  /** Freezer slots: a sold unit of an ingredient is one slot, and frozen goods take their own slots per piece. */
  freezerCapacity: z.number().positive(),
  freezerPrice: positiveInt,
  /** A bigger fridge to replace the small one: more cold space for the sold units of fridge-friendly stock. */
  bigFridge: z.object({ capacity: z.number().positive(), price: positiveInt }),
  portion: z.object({
    small: z.object({ mul: z.number().positive(), rep: z.number() }),
    normal: z.object({ mul: z.number().positive(), rep: z.number() }),
    large: z.object({ mul: z.number().positive(), rep: z.number() }),
  }),
});

export const customerTypeSchema = z.object({
  id: z.string().min(1),
  art: z.string().min(1),
  name: localized,
  patienceMul: z.number().positive(),
  items: z.record(z.string(), z.number().positive()),
  distinctItems: z.tuple([positiveInt, positiveInt]),
  maxQty: positiveInt,
  payment: z.object({ cash: weight, qris: weight, kasbon: weight }),
  tender: z.enum(['exact-coins', 'round-up', 'big-note']),
  ageRange: z.tuple([positiveInt, positiveInt]),
  partWeights: z.object({
    morning: weight, lunch: weight, afternoon: weight, evening: weight, night: weight,
  }),
});

const partRates = z.object({
  morning: weight, lunch: weight, afternoon: weight, evening: weight, night: weight,
});

const range = z.tuple([z.number().int().min(0), z.number().int().min(0)]);

export const activitySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['heavy', 'light']),
  name: localized,
  /** Art id for the free-time list. */
  art: z.string().optional(),
  /** False while the system it needs (for example the market) is not built yet. */
  available: z.boolean().default(true),
  effects: z.object({
    mood: z.number().optional(),
    hunger: z.number().optional(),
    /** Money earned, a seeded roll between the two numbers. */
    cash: range.optional(),
    /** Money spent, a seeded roll between the two numbers. */
    cost: range.optional(),
  }),
});

export const balanceSchema = z.object({
  openMinute: z.number().int().min(0),
  closeMinute: z.number().int().min(1),
  lineCapacity: positiveInt,
  basePatience: positiveInt,
  arrivalPerMinute: partRates,
  weekdayMul: z.array(weight).length(7),
  arrivalReputationRange: z.tuple([weight, weight]),
  qrisFeeBp: z.number().int().min(0),
  noticeShortChange: z.number().min(0).max(1),
  prepMinutes: positiveInt,
  preOpenMinutes: positiveInt,
  prepareMinutes: positiveInt,
  exchangeMinutes: positiveInt,
  exchangeFeeBp: z.number().int().min(0),
  penalties: z.object({ wrongTray: z.number().min(0), ktpCheck: z.number().min(0), decline: z.number().min(0) }),
  startReputation: z.number().min(0).max(100),
  reputation: z.object({
    happy: z.number(), neutral: z.number(), annoyed: z.number(), walkaway: z.number(), underage: z.number(),
    shortChangeCaught: z.number(), emptyOrder: z.number(), kasbonRefused: z.number(), turnedAway: z.number(), unplannedClosure: z.number(),
  }),
  startDrawer: z.record(z.string(), z.number().int().min(0)),
  maxDaysOff: z.number().int().min(0).max(7),
  defaultWorkDays: z.array(z.boolean()).length(7),
  offBlocks: z.array(z.object({ id: z.string().min(1), start: z.number().int(), end: z.number().int() })).min(1),
  defaultOffPlan: z.record(z.string(), z.array(z.string())),
  freeTime: z.object({ start: positiveInt, end: positiveInt, slotMinutes: positiveInt }),
  start: z.object({
    mood: z.number().min(0).max(100),
    hunger: z.number().min(0).max(100),
    bank: z.number().int().min(0),
    /** Ingredients on the shelf at the start, in sold units. */
    pantry: z.record(z.string(), z.number().min(0)),
    /** Resale goods on the shelf at the start, in pieces. */
    goods: z.record(z.string(), z.number().int().min(0)),
  }),
  hungerPerHour: z.number().min(0),
  sleepHunger: z.number().min(0),
  moodFromDay: z.object({ happy: z.number(), annoyed: z.number(), walkaway: z.number(), min: z.number(), max: z.number() }),
  /** What the player can do with portions left on the display at night. */
  leftovers: z.object({
    /** Obral sells them at this share of the menu price. */
    obralMul: z.number().min(0).max(1),
    /** Hunger removed by eating one portion. */
    eatHunger: z.number().min(0),
    /** Reputation gained per portion given away, up to the cap per night. */
    giveRep: z.number().min(0),
    giveRepMax: z.number().min(0),
  }),
  /** Burners on the stove: how many dishes can be cooked at once. */
  burners: positiveInt,
  /** Goods taken on consignment from a neighbour: they unlock from this day (a stand-in for the story), and the neighbour's trust is earned by selling what was taken. */
  titipan: z.object({
    unlockDay: z.number().int().min(0),
    /** Pre-open minutes each pickup takes. */
    minutes: positiveInt,
    /** By relation points: the most of each item you can take, and what the neighbour charges compared with the listed cost. */
    levels: z.array(z.object({ relation: z.number().min(0), max: positiveInt, costMul: z.number().positive() })).min(1),
    /** A day with at least this share of the pickup sold pleases the neighbour; under `unhappyShare` (of at least `unhappyMinTaken` pieces) does not. */
    happyShare: z.number().min(0).max(1),
    unhappyShare: z.number().min(0).max(1),
    unhappyMinTaken: positiveInt,
  }),
  /** The phone: battery that only drains without power, data for apps and QRIS checks, and QRIS signal during a PLN cut. */
  phone: z.object({
    start: z.object({ battery: z.number().min(0).max(100), data: z.number().min(0) }),
    /** Percent per minute while the power is out, and while it is on. */
    drainPerMinute: z.number().min(0),
    chargePerMinute: z.number().min(0),
    /** Extra percent each phone action costs while the power is out. */
    actionCost: z.number().min(0),
    lowBattery: z.number().min(0).max(100),
    lowData: z.number().min(0),
    /** Megabytes an order in the market app and a QRIS check use. */
    dataCosts: z.object({ order: z.number().min(0), qris: z.number().min(0) }),
    dataPacks: z.array(z.object({ mb: positiveInt, price: positiveInt })).min(1),
    powerbank: z.object({ price: positiveInt, capacity: positiveInt }),
    signal: z.object({
      /** Minutes into a PLN cut that the towers' batteries keep QRIS normal, then slow, then it is down. */
      backupMinutes: z.number().min(0),
      slowMinutes: z.number().min(0),
      /** Patience a customer loses while a slow QRIS goes through. */
      slowPatience: z.number().min(0),
      /** Chance that a "success" screen shown while payments cannot be checked is fake. */
      fakeChance: z.number().min(0).max(1),
    }),
  }),
  /** The prepaid electricity token: credit in rupiah, burned per open minute and per night, topped up in packs for a fee. */
  token: z.object({
    start: z.number().int().min(0),
    openPerMinute: z.number().min(0),
    perDay: z.number().min(0),
    /** Below this the player is warned. */
    lowMark: z.number().int().min(0),
    fee: z.number().int().min(0),
    packs: z.array(positiveInt).min(1),
    /** Minutes the fridge counts as warm when the token is empty at bedtime. */
    overnightMinutes: positiveInt,
  }),
  /** Recurring bills: first due after `firstDue` days, then every `everyDays`. Late past `grace` days they cost a fee and reputation each night. */
  bills: z.array(
    z.object({
      id: z.string().min(1),
      name: localized,
      amount: positiveInt,
      everyDays: positiveInt,
      firstDue: positiveInt,
      noticeDays: z.number().int().min(0),
      grace: z.number().int().min(0),
      lateFee: z.number().int().min(0),
      rep: z.number().max(0),
    }),
  ),
  /** Power cuts: when they start, how long, what a closed fridge survives, and what ice and a lantern do about it. */
  outage: z.object({
    fromDay: z.number().int().min(0),
    chancePerDay: z.number().min(0).max(1),
    /** Chance the cut is announced the day before. */
    noticeChance: z.number().min(0).max(1),
    /** Minute of the day a cut can start, and how many hours it can last. */
    starts: z.array(z.number().int().min(0).max(1439)).min(1),
    hours: z.array(positiveInt).min(1),
    /** Hours a closed fridge keeps its contents cold. A longer cut spoils what it holds. */
    fridgeHoldHours: positiveInt,
    /** Hours a well-filled freezer keeps its contents, and a thinly filled one. "Well filled" is this share of its slots. */
    freezerHoldHours: positiveInt,
    freezerPartialHours: positiveInt,
    freezerWellFilled: z.number().min(0).max(1),
    /** From this minute on, a cut means darkness. */
    darkFrom: z.number().int().min(0).max(1439),
    /** Minutes away from the counter to fetch ice or a lantern. */
    errandMinutes: positiveInt,
    ice: z.object({ price: positiveInt, holdHours: positiveInt }),
    /** Arrival multipliers in the dark without and with a lantern. */
    lantern: z.object({ price: positiveInt, darkMul: z.number().min(0).max(1), lanternMul: z.number().min(0).max(1) }),
    /** A generator keeps the shop's power on through a cut for as many hours as the bank can fuel. */
    generator: z.object({ price: positiveInt, fuelPerHour: positiveInt }),
    /** Selling cold stock to neighbours before it spoils: this share of what it cost. */
    sellOff: z.object({ mul: z.number().min(0).max(1) }),
  }),
  /** Buying a tank from a neighbour when the stove runs dry: price multiplier on the market price, and the minutes it takes. */
  gas: z.object({ nearbyMarkup: z.number().min(1), nearbyMinutes: positiveInt }),
  cooking: z.object({
    /** Reputation per cooked portion by how it came out. */
    rep: z.object({ pas: z.number(), biasa: z.number(), kurang: z.number(), gosong: z.number() }),
    /** Auto-cook takes this many times as long as doing it by hand. */
    autoMul: z.number().min(1),
    /** Perfect plates of a dish needed for each extra minute of window. */
    practicePerMinute: positiveInt,
    /** The most minutes practice can widen the window by. */
    maxPractice: z.number().int().min(0),
  }),
});

export const contentSchema = z
  .object({
    items: z.array(itemSchema).min(1),
    ingredients: z.array(ingredientSchema).min(1),
    suppliers: z.array(supplierSchema).min(1),
    market: marketSchema,
    customers: z.array(customerTypeSchema).min(1),
    balance: balanceSchema,
    activities: z.object({ dayOff: z.array(activitySchema).min(1), freeTime: z.array(activitySchema).min(1) }),
  })
  .superRefine((c, ctx) => {
    const problem = (message: string, path: (string | number)[]) => ctx.addIssue({ code: 'custom', message, path });
    const itemIds = new Set<string>();
    c.items.forEach((item, i) => {
      if (itemIds.has(item.id)) problem(`duplicate item id "${item.id}"`, ['items', i, 'id']);
      itemIds.add(item.id);
    });
    const ingredientIds = new Set<string>();
    c.ingredients.forEach((ing, i) => {
      if (ingredientIds.has(ing.id)) problem(`duplicate ingredient id "${ing.id}"`, ['ingredients', i, 'id']);
      ingredientIds.add(ing.id);
    });
    const supplierIds = new Set<string>();
    c.suppliers.forEach((s, i) => {
      if (supplierIds.has(s.id)) problem(`duplicate supplier "${s.id}"`, ['suppliers', i, 'id']);
      supplierIds.add(s.id);
    });
    const goodIds = new Set(c.items.filter((i) => i.kind === 'good').map((i) => i.id));
    c.items.forEach((item, i) => {
      for (const ing of Object.keys(item.recipe ?? {})) {
        if (!ingredientIds.has(ing)) problem(`recipe uses unknown ingredient "${ing}"`, ['items', i, 'recipe', ing]);
      }
    });
    for (const id of Object.keys(c.balance.start.pantry)) {
      if (!ingredientIds.has(id)) problem(`start pantry has unknown ingredient "${id}"`, ['balance', 'start', 'pantry', id]);
    }
    for (const id of Object.keys(c.balance.start.goods)) {
      if (!goodIds.has(id)) problem(`start goods has "${id}", which is not a resale good`, ['balance', 'start', 'goods', id]);
    }
    const categories = new Set<string>([...INGREDIENT_CATEGORIES, 'all', 'goods']);
    const validToken = (t: string) => categories.has(t) || ingredientIds.has(t) || goodIds.has(t);
    c.market.seasons.forEach((s, i) =>
      s.effects.forEach((e, j) => e.match.forEach((t) => !validToken(t) && problem(`unknown match "${t}"`, ['market', 'seasons', i, 'effects', j]))),
    );
    const demandEffects = [...c.market.demand.periods, ...c.market.demand.holidays, c.market.demand.longWeekend];
    demandEffects.forEach((d, i) => {
      for (const id of Object.keys(d.itemMul)) if (!itemIds.has(id)) problem(`demand names unknown item "${id}"`, ['market', 'demand', i, 'itemMul', id]);
    });
    c.market.events.forEach((ev, i) =>
      ev.effects.forEach((e, j) => e.match.forEach((t) => !validToken(t) && problem(`unknown match "${t}"`, ['market', 'events', i, 'effects', j]))),
    );
    if (c.market.ordering.windowEnd <= c.market.ordering.windowStart) problem('delivery window end must be after start', ['market', 'ordering']);
    const typeIds = new Set<string>();
    c.customers.forEach((t, i) => {
      if (typeIds.has(t.id)) problem(`duplicate customer type "${t.id}"`, ['customers', i, 'id']);
      typeIds.add(t.id);
      for (const itemId of Object.keys(t.items)) {
        if (!itemIds.has(itemId)) problem(`unknown item "${itemId}"`, ['customers', i, 'items', itemId]);
      }
      if (t.payment.cash + t.payment.qris + t.payment.kasbon <= 0) problem('payment weights are all zero', ['customers', i, 'payment']);
      if (DAY_PARTS.every((p) => t.partWeights[p] === 0)) problem('partWeights are all zero', ['customers', i, 'partWeights']);
      if (t.distinctItems[0] > t.distinctItems[1]) problem('distinctItems min is above max', ['customers', i, 'distinctItems']);
      if (t.ageRange[0] > t.ageRange[1]) problem('ageRange min is above max', ['customers', i, 'ageRange']);
    });
    const dayOffIds = new Map(c.activities.dayOff.map((a) => [a.id, a]));
    const freeIds = new Set<string>();
    for (const [name, list] of [['dayOff', c.activities.dayOff], ['freeTime', c.activities.freeTime]] as const) {
      const seen = new Set<string>();
      list.forEach((a, i) => {
        if (seen.has(a.id)) problem(`duplicate activity "${a.id}"`, ['activities', name, i, 'id']);
        seen.add(a.id);
        if (name === 'freeTime') freeIds.add(a.id);
      });
    }
    const blockIds = new Set(c.balance.offBlocks.map((b) => b.id));
    c.balance.offBlocks.forEach((b, i) => {
      if (b.end <= b.start) problem('block end must be after start', ['balance', 'offBlocks', i]);
    });
    for (const [block, list] of Object.entries(c.balance.defaultOffPlan)) {
      if (!blockIds.has(block)) problem(`unknown block "${block}"`, ['balance', 'defaultOffPlan', block]);
      if (!isValidBlockPlan(list, (id) => dayOffIds.get(id))) problem(`invalid plan for block "${block}"`, ['balance', 'defaultOffPlan', block]);
    }
    if (c.balance.defaultWorkDays.filter((w) => !w).length > c.balance.maxDaysOff) problem('default plan has too many days off', ['balance', 'defaultWorkDays']);
    if (c.balance.freeTime.end <= c.balance.freeTime.start) problem('free time end must be after start', ['balance', 'freeTime']);
    if (c.balance.closeMinute <= c.balance.openMinute) problem('closeMinute must be after openMinute', ['balance', 'closeMinute']);
    for (const key of Object.keys(c.balance.startDrawer)) {
      if (!(DENOMS as readonly number[]).includes(Number(key))) problem(`"${key}" is not a rupiah denomination`, ['balance', 'startDrawer', key]);
    }
  });

export type Item = z.infer<typeof itemSchema>;
export type Ingredient = z.infer<typeof ingredientSchema>;
export type Supplier = z.infer<typeof supplierSchema>;
export type MarketConfig = z.infer<typeof marketSchema>;
export type Portion = 'small' | 'normal' | 'large';
export type Swing = (typeof SWINGS)[number];
export type CustomerType = z.infer<typeof customerTypeSchema>;
export type Balance = z.infer<typeof balanceSchema>;
export type Activity = z.infer<typeof activitySchema>;

/**
 * A day-off block holds one heavy activity, or up to two light ones. Unavailable
 * and unknown activities are never allowed, and nothing may repeat.
 */
export function isValidBlockPlan(ids: readonly string[], lookup: (id: string) => Activity | undefined): boolean {
  if (new Set(ids).size !== ids.length) return false;
  const acts = ids.map(lookup);
  if (acts.some((a) => !a || !a.available)) return false;
  const heavy = acts.filter((a) => a!.kind === 'heavy').length;
  return heavy === 0 ? acts.length <= 2 : heavy === 1 && acts.length === 1;
}

/** Something the market quotes a price for: an ingredient, or a resale good bought by the pack. */
export interface Product {
  key: string;
  kind: 'ingredient' | 'good';
  id: string;
  category: string;
  base: number;
  swing: Swing;
}

/** The market key of a resale good, so it can never clash with an ingredient id. */
export const goodKey = (itemId: string) => `g-${itemId}`;

export interface Content {
  items: Item[];
  itemById: Record<string, Item>;
  ingredients: Ingredient[];
  ingredientById: Record<string, Ingredient>;
  suppliers: Supplier[];
  supplierById: Record<string, Supplier>;
  market: MarketConfig;
  products: Product[];
  productByKey: Record<string, Product>;
  customers: CustomerType[];
  typeById: Record<string, CustomerType>;
  balance: Balance;
  activities: { dayOff: Activity[]; freeTime: Activity[] };
  activityById: Record<string, Activity>;
  freeTimeById: Record<string, Activity>;
}
