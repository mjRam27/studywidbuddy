import { bug, type ExerciseDef } from '../exercise';

/** Intermediate: realistic modules, often two files, at least five bugs of mixed kinds. */
export const INTERMEDIATE: ExerciseDef[] = [
  {
    slug: 'order-pricing',
    title: 'Order pricing',
    level: 'INTERMEDIATE',
    topic: 'Subtotal, coupons and tax across two modules',
    brief:
      'order.js prices an order with helpers from pricing.js: subtotal, then the coupon (percent or fixed, never more than the subtotal), then 19% tax on what is left. Adding a line must return a new order.',
    estimatedMinutes: 20,
    files: {
      'pricing.js': String.raw`const TAX_RATE = 0.19;

function lineTotal(line) {
  return line.unitCents * line.qty;
}

function subtotal(lines) {
  return lines.reduce((sum, line) => sum + lineTotal(line), 0);
}

function discountCents(subtotalCents, coupon) {
  if (!coupon) return 0;
  if (coupon.type === 'percent') return Math.round((subtotalCents * coupon.value) / 100);
  return Math.min(coupon.value, subtotalCents);
}

function taxCents(amountCents) {
  return Math.round(amountCents * TAX_RATE);
}

module.exports = { lineTotal, subtotal, discountCents, taxCents };
`,
      'order.js': String.raw`const { subtotal, discountCents, taxCents } = require('./pricing');

function priceOrder(order) {
  const sub = subtotal(order.lines);
  const discount = discountCents(sub, order.coupon);
  const taxable = sub - discount;
  const tax = taxCents(taxable);
  return { subtotal: sub, discount, tax, total: taxable + tax };
}

function addLine(order, line) {
  return { ...order, lines: [...order.lines, line] };
}

module.exports = { priceOrder, addLine };
`,
    },
    tests: String.raw`const { priceOrder, addLine } = require('./order');

const order = { lines: [{ unitCents: 1000, qty: 2 }, { unitCents: 500, qty: 1 }], coupon: null };

test('prices an order without a coupon', () => {
  expect(priceOrder(order)).toEqual({ subtotal: 2500, discount: 0, tax: 475, total: 2975 });
});

test('a percent coupon comes off before tax', () => {
  expect(priceOrder({ ...order, coupon: { type: 'percent', value: 10 } })).toEqual({
    subtotal: 2500,
    discount: 250,
    tax: 428,
    total: 2678,
  });
});

test('a fixed coupon never makes the order negative', () => {
  const r = priceOrder({ lines: [{ unitCents: 300, qty: 1 }], coupon: { type: 'fixed', value: 500 } });
  expect(r.discount).toBe(300);
  expect(r.total).toBe(0);
});

test('adding a line returns a new order', () => {
  const next = addLine(order, { unitCents: 100, qty: 3 });
  expect(next.lines).toHaveLength(3);
  expect(order.lines).toHaveLength(2);
  expect(priceOrder(next).subtotal).toBe(2800);
});
`,
    bugs: [
      bug(
        'pricing.js',
        'return line.unitCents * line.qty;',
        'return line.unitCents + line.qty;',
        'MATH',
        'Adds price and quantity',
        'A line costs unit price times quantity.',
      ),
      bug(
        'pricing.js',
        '  if (!coupon) return 0;\n',
        '',
        'NULL_UNDEFINED',
        'Orders without a coupon crash',
        'coupon is null when none was used, and null.type throws. Handle the “no coupon” case first.',
      ),
      bug(
        'pricing.js',
        'return Math.min(coupon.value, subtotalCents);',
        'return coupon.value;',
        'LOGIC',
        'Fixed coupons can exceed the order',
        'A 5 € voucher on a 3 € order may only take 3 € off, or the total goes negative.',
      ),
      bug(
        'order.js',
        'const tax = taxCents(taxable);',
        'const tax = taxCents(sub);',
        'LOGIC',
        'Tax charged on the price before the discount',
        'Tax is due on what the customer actually pays, so it is computed from the discounted amount.',
      ),
      bug(
        'order.js',
        'return { ...order, lines: [...order.lines, line] };',
        'order.lines.push(line);\n  return order;',
        'MUTATION',
        'Changes the caller’s order',
        'push changes the existing array, so the “old” order gets the new line too. Build a new array and a new object.',
      ),
    ],
  },
  {
    slug: 'event-emitter',
    title: 'Event emitter',
    level: 'INTERMEDIATE',
    topic: 'on / off / once / emit, like Node’s EventEmitter',
    brief:
      'Listeners get every argument passed to emit. on() returns an unsubscribe function, off() with an unknown listener does nothing, once() fires a single time without disturbing other listeners, and two emitters never share listeners.',
    estimatedMinutes: 25,
    files: {
      'emitter.js': String.raw`function createEmitter() {
  const listeners = {};

  function on(event, fn) {
    (listeners[event] = listeners[event] || []).push(fn);
    return () => off(event, fn);
  }

  function off(event, fn) {
    const list = listeners[event] || [];
    const i = list.indexOf(fn);
    if (i !== -1) list.splice(i, 1);
  }

  function once(event, fn) {
    const wrapper = (...args) => {
      off(event, wrapper);
      fn(...args);
    };
    return on(event, wrapper);
  }

  function emit(event, ...args) {
    const current = [...(listeners[event] || [])];
    current.forEach((listener) => listener(...args));
    return current.length;
  }

  return { on, off, once, emit };
}

module.exports = { createEmitter };
`,
    },
    tests: String.raw`const { createEmitter } = require('./emitter');

test('calls listeners with all the arguments', () => {
  const e = createEmitter();
  const calls = [];
  e.on('save', (a, b) => calls.push([a, b]));
  e.emit('save', 1, 2);
  expect(calls).toEqual([[1, 2]]);
});

test('unsubscribe stops a listener', () => {
  const e = createEmitter();
  let n = 0;
  const stop = e.on('tick', () => n++);
  e.emit('tick');
  stop();
  e.emit('tick');
  expect(n).toBe(1);
});

test('off with an unknown listener removes nothing', () => {
  const e = createEmitter();
  let n = 0;
  e.on('tick', () => n++);
  e.off('tick', () => {});
  e.emit('tick');
  expect(n).toBe(1);
});

test('once fires a single time and does not skip other listeners', () => {
  const e = createEmitter();
  const seen = [];
  e.once('ready', () => seen.push('once'));
  e.on('ready', () => seen.push('always'));
  e.emit('ready');
  e.emit('ready');
  expect(seen).toEqual(['once', 'always', 'always']);
});

test('emitters do not share listeners', () => {
  const a = createEmitter();
  const b = createEmitter();
  let n = 0;
  a.on('x', () => n++);
  expect(b.emit('x')).toBe(0);
  expect(n).toBe(0);
});
`,
    bugs: [
      bug(
        'emitter.js',
        'function createEmitter() {\n  const listeners = {};',
        'const listeners = {};\nfunction createEmitter() {',
        'STATE',
        'All emitters share one listener table',
        'Declared outside the factory, listeners is created once and shared by every emitter. Each emitter needs its own, created inside createEmitter.',
      ),
      bug(
        'emitter.js',
        'return () => off(event, fn);',
        'return () => off(event);',
        'SCOPE_CLOSURES',
        'Unsubscribe forgets which listener to remove',
        'The returned function closes over fn; it has to pass it on, or off() has nothing to look for.',
      ),
      bug(
        'emitter.js',
        'if (i !== -1) list.splice(i, 1);',
        'list.splice(i, 1);',
        'ARRAY_METHODS',
        'Removing an unknown listener removes the last one',
        'indexOf returns -1 when nothing matches, and splice(-1, 1) removes the last element.',
      ),
      bug(
        'emitter.js',
        'off(event, wrapper);',
        'off(event, fn);',
        'SCOPE_CLOSURES',
        'once() never unsubscribes',
        'once registered wrapper, not fn, so wrapper is what must be removed.',
      ),
      bug(
        'emitter.js',
        'const current = [...(listeners[event] || [])];',
        'const current = listeners[event] || [];',
        'MUTATION',
        'Removing a listener during emit skips the next one',
        'A once-listener removes itself while forEach is walking the same array, shifting the next listener into the slot already visited. Iterate over a copy.',
      ),
      bug(
        'emitter.js',
        'listener(...args)',
        'listener(args)',
        'LOGIC',
        'Arguments arrive as one array',
        'Spread the rest parameter back out so each argument is passed separately.',
      ),
    ],
  },
  {
    slug: 'async-users',
    title: 'Loading users',
    level: 'INTERMEDIATE',
    topic: 'async/await with a fake API',
    brief:
      'users.js loads users through api.js, whose requests finish in different orders. Results always come back in the order asked for, a missing user becomes null (no crash), and firstExisting finds the first id that exists. Loaded users are copies, and failures are real Error objects.',
    estimatedMinutes: 25,
    files: {
      'api.js': String.raw`const DB = { 1: { id: 1, name: 'Ada' }, 2: { id: 2, name: 'Grace' } };

function fetchUser(id) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (DB[id]) resolve({ ...DB[id] });
      else reject(new Error('User ' + id + ' not found'));
    }, DB[id] ? 20 - id * 5 : 1);
  });
}

module.exports = { fetchUser };
`,
      'users.js': String.raw`const { fetchUser } = require('./api');

async function loadNames(ids) {
  const users = await Promise.all(ids.map((id) => fetchUser(id)));
  return users.map((u) => u.name);
}

async function loadSafe(id) {
  try {
    return await fetchUser(id);
  } catch (e) {
    return null;
  }
}

async function firstExisting(ids) {
  for (const id of ids) {
    const user = await loadSafe(id);
    if (user) return user.name;
  }
  return null;
}

async function loadAllSafe(ids) {
  return Promise.all(ids.map((id) => loadSafe(id)));
}

module.exports = { loadNames, loadSafe, firstExisting, loadAllSafe };
`,
    },
    tests: String.raw`const { fetchUser } = require('./api');
const { loadNames, loadSafe, firstExisting, loadAllSafe } = require('./users');

test('loads names in the order asked for', async () => {
  expect(await loadNames([2, 1])).toEqual(['Grace', 'Ada']);
});

test('a missing user becomes null instead of an error', async () => {
  expect(await loadSafe(99)).toBe(null);
});

test('finds the first user that exists', async () => {
  expect(await firstExisting([99, 2, 1])).toBe('Grace');
});

test('loads many users in order, with null for missing ones', async () => {
  const users = await loadAllSafe([1, 99, 2]);
  expect(users.map((u) => u && u.name)).toEqual(['Ada', null, 'Grace']);
});

test('changing a loaded user does not change the database', async () => {
  const u = await fetchUser(1);
  u.name = 'Changed';
  expect((await fetchUser(1)).name).toBe('Ada');
});

test('failures are real Error objects', async () => {
  let error = null;
  try {
    await fetchUser(99);
  } catch (e) {
    error = e;
  }
  expect(error instanceof Error).toBe(true);
  expect(error.message).toBe('User 99 not found');
});
`,
    bugs: [
      bug(
        'users.js',
        'const users = await Promise.all(ids.map((id) => fetchUser(id)));',
        'const users = ids.map((id) => fetchUser(id));',
        'ASYNC',
        'Uses promises as if they were users',
        'map returns an array of pending promises. Promise.all waits for all of them and gives back the values, in order.',
      ),
      bug(
        'users.js',
        'return await fetchUser(id);',
        'return fetchUser(id);',
        'ASYNC',
        'The try/catch never sees the error',
        'Returning a promise without await leaves the try block before it settles, so its rejection skips the catch. return await keeps it inside.',
      ),
      bug(
        'users.js',
        '    if (user) return user.name;',
        '    return user ? user.name : null;',
        'LOGIC',
        'Gives up after the first id',
        'A return inside the loop ends the whole function. Only return once a user was found; otherwise keep looking.',
      ),
      bug(
        'users.js',
        '  return Promise.all(ids.map((id) => loadSafe(id)));',
        '  const users = [];\n  await Promise.all(ids.map(async (id) => users.push(await loadSafe(id))));\n  return users;',
        'ASYNC',
        'Results arrive in finishing order',
        'Requests finish in whatever order the network allows. Pushing results as they arrive scrambles them; Promise.all returns them in the order of the input.',
      ),
      bug(
        'api.js',
        'resolve({ ...DB[id] })',
        'resolve(DB[id])',
        'MUTATION',
        'Hands out the database object itself',
        'Callers get a reference to the stored object, so changing their copy changes the “database”. Return a copy.',
      ),
      bug(
        'api.js',
        "reject(new Error('User ' + id + ' not found'))",
        "reject('User ' + id + ' not found')",
        'ERROR_HANDLING',
        'Rejects with a plain string',
        'Throw or reject with Error objects: they carry a message and a stack trace, and instanceof Error works.',
      ),
    ],
  },
  {
    slug: 'room-booking',
    title: 'Room booking',
    level: 'INTERMEDIATE',
    topic: 'Nights, overlaps and weekends with UTC dates',
    brief:
      'A small hotel books rooms by date (YYYY-MM-DD, UTC). Checking out and checking in on the same day is fine, a stay is at least one night, and weekend nights are Friday and Saturday nights.',
    estimatedMinutes: 25,
    files: {
      'booking.js': String.raw`const DAY = 24 * 60 * 60 * 1000;

function nights(checkIn, checkOut) {
  return Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / DAY);
}

function overlaps(a, b) {
  return Date.parse(a.checkIn) < Date.parse(b.checkOut) && Date.parse(b.checkIn) < Date.parse(a.checkOut);
}

function canBook(bookings, request) {
  if (nights(request.checkIn, request.checkOut) < 1) return false;
  return !bookings.some((b) => overlaps(b, request));
}

function addDays(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekendNights(checkIn, checkOut) {
  let count = 0;
  for (let t = Date.parse(checkIn); t < Date.parse(checkOut); t += DAY) {
    const weekday = new Date(t).getUTCDay();
    if (weekday === 5 || weekday === 6) count++;
  }
  return count;
}

module.exports = { nights, overlaps, canBook, addDays, weekendNights };
`,
    },
    tests: String.raw`const { nights, canBook, addDays, weekendNights } = require('./booking');

const existing = [{ checkIn: '2026-03-01', checkOut: '2026-03-04' }];

test('counts nights', () => {
  expect(nights('2026-03-01', '2026-03-04')).toBe(3);
});

test('back-to-back stays are fine, overlapping ones are not', () => {
  expect(canBook(existing, { checkIn: '2026-03-04', checkOut: '2026-03-06' })).toBe(true);
  expect(canBook(existing, { checkIn: '2026-03-03', checkOut: '2026-03-05' })).toBe(false);
});

test('a stay needs at least one night', () => {
  expect(canBook([], { checkIn: '2026-03-10', checkOut: '2026-03-10' })).toBe(false);
});

test('adds days across month and year ends', () => {
  expect(addDays('2026-02-27', 3)).toBe('2026-03-02');
  expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
});

test('counts Friday and Saturday nights', () => {
  expect(weekendNights('2026-03-06', '2026-03-08')).toBe(2);
  expect(weekendNights('2026-03-05', '2026-03-07')).toBe(1);
});
`,
    bugs: [
      bug(
        'booking.js',
        'Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / DAY)',
        '(Date.parse(checkOut) - Date.parse(checkIn)) / 1000',
        'DATES',
        'Counts seconds, not nights',
        'Date.parse gives milliseconds. Divide by the length of a day in milliseconds to get days.',
      ),
      bug(
        'booking.js',
        'Date.parse(b.checkIn) < Date.parse(a.checkOut)',
        'Date.parse(b.checkIn) <= Date.parse(a.checkOut)',
        'COMPARISON',
        'Back-to-back stays clash',
        'One guest leaves on the morning the next arrives. Ranges that only touch don’t overlap, so the comparison must be strict.',
      ),
      bug(
        'booking.js',
        'if (nights(request.checkIn, request.checkOut) < 1) return false;',
        'if (nights(request.checkIn, request.checkOut) < 0) return false;',
        'LOGIC',
        'Zero-night stays are allowed',
        'Checking out on the day you arrive books nothing. A stay needs at least one night.',
      ),
      bug(
        'booking.js',
        'd.setUTCDate(d.getUTCDate() + days);',
        'd.setUTCDate(d.getUTCDay() + days);',
        'DATES',
        'Adds to the weekday instead of the date',
        'getUTCDay() is 0–6 (day of the week). getUTCDate() is the day of the month.',
      ),
      bug(
        'booking.js',
        'if (weekday === 5 || weekday === 6) count++;',
        'if (weekday === 6 || weekday === 0) count++;',
        'DATES',
        'Counts Saturday and Sunday nights',
        'A weekend stay means the nights starting Friday (5) and Saturday (6). Sunday night is a work night.',
      ),
      bug(
        'booking.js',
        't < Date.parse(checkOut);',
        't <= Date.parse(checkOut);',
        'OFF_BY_ONE',
        'Counts the checkout day as a night',
        'You sleep the nights from check-in up to, but not including, the checkout day.',
      ),
    ],
  },
  {
    slug: 'slugs-and-wrapping',
    title: 'Slugs and word wrap',
    level: 'INTERMEDIATE',
    topic: 'URL slugs, unique slugs and wrapping text',
    brief:
      'A blog turns titles into URL slugs ("Café au Lait!" → "cafe-au-lait"), adds -2, -3 … when a slug is taken, and wraps text to a width without ever creating empty lines.',
    estimatedMinutes: 25,
    files: {
      'slug.js': String.raw`function slugify(title) {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueSlug(title, taken) {
  const base = slugify(title);
  let slug = base;
  let n = 2;
  while (taken.includes(slug)) {
    slug = base + '-' + n;
    n++;
  }
  return slug;
}

function wordWrap(text, width) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && (line + ' ' + word).length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? line + ' ' + word : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

module.exports = { slugify, uniqueSlug, wordWrap };
`,
    },
    tests: String.raw`const { slugify, uniqueSlug, wordWrap } = require('./slug');

test('removes accents and punctuation', () => {
  expect(slugify('Café au Lait!')).toBe('cafe-au-lait');
});

test('collapses spaces and trims dashes', () => {
  expect(slugify('  Hello   World  ')).toBe('hello-world');
});

test('adds -2, -3 … when a slug is taken', () => {
  expect(uniqueSlug('My Post', ['my-post'])).toBe('my-post-2');
  expect(uniqueSlug('My Post', ['my-post', 'my-post-2'])).toBe('my-post-3');
});

test('wraps words to a width', () => {
  expect(wordWrap('the quick brown fox', 9)).toEqual(['the quick', 'brown fox']);
});

test('a long first word gets its own line, with no empty lines', () => {
  expect(wordWrap('supercalifragilistic is long', 10)).toEqual(['supercalifragilistic', 'is long']);
});
`,
    bugs: [
      bug(
        'slug.js',
        "    .normalize('NFD')\n",
        '',
        'STRINGS',
        'Accented letters are dropped',
        'normalize("NFD") splits "é" into "e" plus an accent mark, which the next line removes. Without it, "é" is not in a–z and becomes a dash.',
      ),
      bug(
        'slug.js',
        ".replace(/[^a-z0-9]+/g, '-')",
        ".replace(/[^a-z0-9]/g, '-')",
        'REGEX',
        'Every space becomes its own dash',
        'Without +, each non-alphanumeric character is replaced separately, so three spaces become three dashes.',
      ),
      bug(
        'slug.js',
        ".replace(/^-+|-+$/g, '')",
        ".replace(/^-+|-+$/, '')",
        'REGEX',
        'Only the leading dash is trimmed',
        'Without the g flag, replace stops after the first match, so the trailing dashes stay.',
      ),
      bug(
        'slug.js',
        'let n = 2;',
        'let n = 1;',
        'OFF_BY_ONE',
        'The first duplicate gets -1',
        'The original is implicitly number 1, so the first duplicate is -2.',
      ),
      bug(
        'slug.js',
        "if (line && (line + ' ' + word).length > width) {",
        "if ((line + ' ' + word).length > width) {",
        'LOGIC',
        'A long first word pushes an empty line',
        'When line is still empty there is nothing to push. Only break the line once it has content.',
      ),
      bug(
        'slug.js',
        '  if (line) lines.push(line);\n',
        '',
        'LOGIC',
        'The last line is lost',
        'The loop only pushes a line when the next word doesn’t fit. Whatever is left at the end has to be pushed too.',
      ),
    ],
  },
  {
    slug: 'inventory-class',
    title: 'Inventory class',
    level: 'INTERMEDIATE',
    topic: 'A class with chaining, Maps and this',
    brief:
      'An Inventory class supports chained add(), remove() (all of it is fine, more is an error, and items at zero disappear), sorted names(), addAll() from pairs and a plain-object snapshot().',
    estimatedMinutes: 25,
    files: {
      'inventory.js': String.raw`class Inventory {
  constructor() {
    this.items = new Map();
  }

  add(name, qty) {
    this.items.set(name, (this.items.get(name) || 0) + qty);
    return this;
  }

  remove(name, qty) {
    const have = this.items.get(name) || 0;
    if (qty > have) throw new Error('Only ' + have + ' ' + name + ' left');
    if (have === qty) this.items.delete(name);
    else this.items.set(name, have - qty);
    return this;
  }

  count(name) {
    return this.items.get(name) || 0;
  }

  names() {
    return [...this.items.keys()].sort();
  }

  addAll(entries) {
    entries.forEach(([name, qty]) => this.add(name, qty));
    return this;
  }

  snapshot() {
    return Object.fromEntries(this.items);
  }
}

module.exports = { Inventory };
`,
    },
    tests: String.raw`const { Inventory } = require('./inventory');

test('adds and counts items, and chains calls', () => {
  const inv = new Inventory().add('apple', 3).add('apple', 2).add('pear', 1);
  expect(inv.count('apple')).toBe(5);
  expect(inv.count('kiwi')).toBe(0);
});

test('items removed down to zero disappear', () => {
  const inv = new Inventory().add('apple', 3).add('pear', 1);
  inv.remove('apple', 3);
  expect(inv.names()).toEqual(['pear']);
});

test('can remove exactly what is left, but not more', () => {
  const inv = new Inventory().add('pear', 2);
  expect(() => inv.remove('pear', 3)).toThrow('Only 2 pear left');
  inv.remove('pear', 2);
  expect(inv.count('pear')).toBe(0);
});

test('adds many at once', () => {
  const inv = new Inventory().addAll([['b', 1], ['a', 2]]);
  expect(inv.names()).toEqual(['a', 'b']);
  expect(inv.snapshot()).toEqual({ a: 2, b: 1 });
});
`,
    bugs: [
      bug(
        'inventory.js',
        'this.items.set(name, (this.items.get(name) || 0) + qty);',
        'this.items.set(name, this.items.get(name) + qty);',
        'NULL_UNDEFINED',
        'New items start as NaN',
        'get() returns undefined for a new key, and undefined + 3 is NaN.',
      ),
      bug(
        'inventory.js',
        '    return this;\n  }\n\n  remove(',
        '  }\n\n  remove(',
        'LOGIC',
        'add() can’t be chained',
        'Chaining (inv.add(…).add(…)) works because each method returns the object itself. Without return this, add() returns undefined.',
      ),
      bug(
        'inventory.js',
        'if (qty > have) throw',
        'if (qty >= have) throw',
        'COMPARISON',
        'Removing the last ones throws',
        'Taking exactly what is left is allowed. Only more than that is an error.',
      ),
      bug(
        'inventory.js',
        'if (have === qty) this.items.delete(name);',
        'if (have === qty) this.items.set(name, 0);',
        'LOGIC',
        'Items at zero stay listed',
        'The rule is that items at zero disappear, so they must be deleted from the Map, not kept with a count of 0.',
      ),
      bug(
        'inventory.js',
        'return [...this.items.keys()].sort();',
        'return this.items.keys();',
        'DATA_STRUCTURES',
        'Returns an iterator, not a sorted array',
        'Map.keys() returns an iterator in insertion order. Spread it into an array, then sort.',
      ),
      bug(
        'inventory.js',
        'entries.forEach(([name, qty]) => this.add(name, qty));',
        'entries.forEach(function ([name, qty]) {\n      this.add(name, qty);\n    });',
        'SCOPE_CLOSURES',
        'this is lost inside the callback',
        'A regular function gets its own this (undefined in strict mode). Arrow functions keep the this of the method they’re in.',
      ),
    ],
  },
  {
    slug: 'memoize-and-closures',
    title: 'Memoize and closures',
    level: 'INTERMEDIATE',
    topic: 'Caching results and functions that remember',
    brief:
      'memoize() caches by all arguments (falsy results too), a counter counts up from its start and resets to it, and makeMultipliers(3) returns three functions multiplying by 1, 2 and 3.',
    estimatedMinutes: 20,
    files: {
      'memo.js': String.raw`function memoize(fn) {
  const cache = new Map();
  return function (...args) {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  };
}

function createCounter(start) {
  let value = start;
  return {
    next: () => ++value,
    reset: () => {
      value = start;
    },
    get current() {
      return value;
    },
  };
}

function makeMultipliers(n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    out.push((x) => x * i);
  }
  return out;
}

module.exports = { memoize, createCounter, makeMultipliers };
`,
    },
    tests: String.raw`const { memoize, createCounter, makeMultipliers } = require('./memo');

test('memoize calls the function once per distinct arguments', () => {
  let calls = 0;
  const add = memoize((a, b) => {
    calls++;
    return a + b;
  });
  expect(add(1, 2)).toBe(3);
  expect(add(1, 2)).toBe(3);
  expect(add(1, 3)).toBe(4);
  expect(calls).toBe(2);
});

test('memoize also caches falsy results', () => {
  let calls = 0;
  const zero = memoize(() => {
    calls++;
    return 0;
  });
  zero();
  zero();
  expect(calls).toBe(1);
});

test('counter counts up from its start and resets to it', () => {
  const c = createCounter(10);
  expect(c.next()).toBe(11);
  expect(c.next()).toBe(12);
  c.reset();
  expect(c.current).toBe(10);
});

test('each multiplier remembers its own factor', () => {
  const [times1, times2, times3] = makeMultipliers(3);
  expect([times1(10), times2(10), times3(10)]).toEqual([10, 20, 30]);
});
`,
    bugs: [
      bug(
        'memo.js',
        'const key = JSON.stringify(args);',
        'const key = args[0];',
        'STATE',
        'Only the first argument is part of the key',
        'add(1, 2) and add(1, 3) share the key 1, so the second call returns the first result. The key must cover every argument.',
      ),
      bug(
        'memo.js',
        'if (cache.has(key)) return cache.get(key);',
        'if (cache.get(key)) return cache.get(key);',
        'STATE',
        'Falsy results are never cached',
        'A cached 0, "" or false looks like “nothing cached”. has() checks whether the key exists at all.',
      ),
      bug(
        'memo.js',
        '  const cache = new Map();\n  return function (...args) {',
        '  return function (...args) {\n    const cache = new Map();',
        'SCOPE_CLOSURES',
        'A new cache on every call',
        'Created inside the returned function, the cache starts empty on every call. It must live in the outer function so every call shares it.',
      ),
      bug(
        'memo.js',
        'next: () => ++value,',
        'next: () => value++,',
        'OFF_BY_ONE',
        'Returns the old value',
        'value++ returns the value before incrementing; ++value returns it after.',
      ),
      bug(
        'memo.js',
        'reset: () => {\n      value = start;',
        'reset: () => {\n      value = 0;',
        'LOGIC',
        'Resets to 0 instead of the start',
        'The counter remembers its start in the closure, so reset can use it.',
      ),
      bug(
        'memo.js',
        'for (let i = 1; i <= n; i++) {',
        'for (var i = 1; i <= n; i++) {',
        'SCOPE_CLOSURES',
        'Every multiplier uses the last value of i',
        'var creates one i for the whole function, which ends at n + 1. let creates a fresh i for each loop iteration, which each arrow function captures.',
      ),
    ],
  },
  {
    slug: 'csv-report',
    title: 'CSV report',
    level: 'INTERMEDIATE',
    topic: 'Parsing CSV with quotes, then totalling it',
    brief:
      'csv.js parses CSV, including quoted cells with commas and doubled quotes, into objects. report.js totals the amount column per category and skips rows whose amount isn’t a number.',
    estimatedMinutes: 25,
    files: {
      'csv.js': String.raw`function parseLine(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

function parseCsv(text) {
  const [header, ...rows] = text.trim().split('\n');
  const keys = parseLine(header);
  return rows.map((row) => {
    const cells = parseLine(row);
    const record = {};
    keys.forEach((key, i) => {
      record[key] = cells[i];
    });
    return record;
  });
}

module.exports = { parseLine, parseCsv };
`,
      'report.js': String.raw`const { parseCsv } = require('./csv');

function totalsByCategory(text) {
  const totals = {};
  for (const row of parseCsv(text)) {
    const amount = Number(row.amount);
    if (Number.isNaN(amount)) continue;
    totals[row.category] = (totals[row.category] || 0) + amount;
  }
  return totals;
}

module.exports = { totalsByCategory };
`,
    },
    tests: String.raw`const { parseLine, parseCsv } = require('./csv');
const { totalsByCategory } = require('./report');

test('splits a line on commas', () => {
  expect(parseLine('a,b,c')).toEqual(['a', 'b', 'c']);
});

test('keeps commas and doubled quotes inside quoted cells', () => {
  expect(parseLine('"Smith, Jo","say ""hi""",x')).toEqual(['Smith, Jo', 'say "hi"', 'x']);
});

test('handles empty quoted cells', () => {
  expect(parseLine('a,"",b')).toEqual(['a', '', 'b']);
});

test('reads rows into objects and ignores a trailing newline', () => {
  expect(parseCsv('name,age\nAda,36\nGrace,45\n')).toEqual([
    { name: 'Ada', age: '36' },
    { name: 'Grace', age: '45' },
  ]);
});

test('totals amounts per category', () => {
  const csv = 'category,amount\nfood,12.5\ntravel,40\nfood,7.5\nfood,oops\n';
  expect(totalsByCategory(csv)).toEqual({ food: 20, travel: 40 });
});
`,
    bugs: [
      bug(
        'csv.js',
        "if (quoted && line[i + 1] === '\"') {",
        "if (line[i + 1] === '\"') {",
        'LOGIC',
        'An empty quoted cell turns into a quote',
        'Two quotes in a row mean “an escaped quote” only inside a quoted cell. Outside one, "" is an empty cell.',
      ),
      bug(
        'csv.js',
        "} else if (ch === ',' && !quoted) {",
        "} else if (ch === ',') {",
        'LOGIC',
        'Splits on commas inside quotes',
        'Quotes exist so cells can contain commas; a comma only separates cells when we are not inside quotes.',
      ),
      bug(
        'csv.js',
        '  cells.push(cell);\n  return cells;',
        '  return cells;',
        'OFF_BY_ONE',
        'The last cell is dropped',
        'Cells are pushed when a comma is reached, and the last cell has no comma after it.',
      ),
      bug(
        'csv.js',
        "text.trim().split('\\n')",
        "text.split('\\n')",
        'STRINGS',
        'A trailing newline becomes an empty row',
        'Files usually end with a newline. Splitting without trimming produces a last, empty row.',
      ),
      bug(
        'report.js',
        'const amount = Number(row.amount);',
        'const amount = row.amount;',
        'TYPE_COERCION',
        'Amounts stay strings and get concatenated',
        'CSV values are text. 0 + "12.5" is "012.5", so convert to a number before adding.',
      ),
      bug(
        'report.js',
        '(totals[row.category] || 0) + amount',
        'totals[row.category] + amount',
        'NULL_UNDEFINED',
        'The first amount of a category becomes NaN',
        'The first time a category appears, its total is undefined, and undefined + 12.5 is NaN.',
      ),
    ],
  },
  {
    slug: 'signup-validation',
    title: 'Sign-up validation',
    level: 'INTERMEDIATE',
    topic: 'Custom errors and validation rules',
    brief:
      'signup() validates a form: a valid email, a whole-number age of at least 13, and matching passwords. It lists the failing fields, but unexpected errors (like a missing form) must still be thrown.',
    estimatedMinutes: 25,
    files: {
      'validate.js': String.raw`class ValidationError extends Error {
  constructor(field, message) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

function validateSignup(input) {
  const errors = [];
  if (!input.email || !input.email.includes('@')) {
    errors.push(new ValidationError('email', 'Enter a valid email'));
  }
  if (typeof input.age !== 'number' || input.age < 13) {
    errors.push(new ValidationError('age', 'You must be 13 or older'));
  }
  if (input.password !== input.confirm) {
    errors.push(new ValidationError('confirm', 'Passwords do not match'));
  }
  return errors;
}

function parseAge(raw) {
  const age = Number(raw);
  if (!Number.isInteger(age)) throw new ValidationError('age', 'Age must be a whole number');
  return age;
}

function signup(raw) {
  try {
    const input = { ...raw, age: parseAge(raw.age) };
    const errors = validateSignup(input);
    if (errors.length) return { ok: false, errors: errors.map((e) => e.field) };
    return { ok: true, errors: [] };
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, errors: [e.field] };
    throw e;
  }
}

module.exports = { ValidationError, validateSignup, signup };
`,
    },
    tests: String.raw`const { ValidationError, signup } = require('./validate');

const good = { email: 'ada@example.com', age: '36', password: 'pw', confirm: 'pw' };

test('a valid sign-up passes', () => {
  expect(signup(good)).toEqual({ ok: true, errors: [] });
});

test('validation errors keep their message and field', () => {
  const e = new ValidationError('email', 'Enter a valid email');
  expect(e.message).toBe('Enter a valid email');
  expect(e.field).toBe('email');
  expect(e instanceof Error).toBe(true);
});

test('a missing email is reported, not a crash', () => {
  expect(signup({ ...good, email: undefined })).toEqual({ ok: false, errors: ['email'] });
});

test('reports each problem', () => {
  expect(signup({ ...good, age: '12', confirm: 'nope' })).toEqual({ ok: false, errors: ['age', 'confirm'] });
});

test('ages must be whole numbers', () => {
  expect(signup({ ...good, age: '13.5' })).toEqual({ ok: false, errors: ['age'] });
});

test('unexpected errors are not hidden', () => {
  expect(() => signup(null)).toThrow();
});
`,
    bugs: [
      bug(
        'validate.js',
        'super(message);',
        'super();',
        'ERROR_HANDLING',
        'The error message is lost',
        'Error’s constructor stores the message. If the subclass doesn’t pass it to super, .message is empty.',
      ),
      bug(
        'validate.js',
        "if (!input.email || !input.email.includes('@')) {",
        "if (!input.email.includes('@')) {",
        'NULL_UNDEFINED',
        'A missing email crashes',
        'undefined.includes throws a TypeError. Check that the value exists before calling methods on it.',
      ),
      bug(
        'validate.js',
        "typeof input.age !== 'number' || input.age < 13",
        "typeof input.age !== 'number' && input.age < 13",
        'LOGIC',
        'Young users slip through',
        'Either problem is enough to reject: not a number OR too young. With &&, both must be true at once, which never happens for a real age.',
      ),
      bug(
        'validate.js',
        'if (!Number.isInteger(age))',
        'if (isNaN(age))',
        'TYPE_COERCION',
        'Fractions are accepted as ages',
        'isNaN only rejects things that aren’t numbers at all. 13.5 is a number but not a whole one: Number.isInteger checks that.',
      ),
      bug(
        'validate.js',
        '    if (e instanceof ValidationError) return { ok: false, errors: [e.field] };\n    throw e;',
        '    return { ok: false, errors: [e.field] };',
        'ERROR_HANDLING',
        'Every error is swallowed',
        'Catch only what you expect. A TypeError from a missing form is a bug in the caller and must not be disguised as a validation failure.',
      ),
    ],
  },
  {
    slug: 'game-of-life',
    title: 'Game of Life',
    level: 'INTERMEDIATE',
    topic: 'Grids, neighbours and Conway’s rules',
    brief:
      'A cell with 2 or 3 live neighbours survives, a dead cell with exactly 3 comes alive. Grid rows must be independent arrays, and each cell has up to eight neighbours (never itself).',
    estimatedMinutes: 25,
    files: {
      'grid.js': String.raw`function createGrid(rows, cols, fill) {
  return Array.from({ length: rows }, () => Array(cols).fill(fill));
}

function neighbours(grid, r, c) {
  let count = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const row = grid[r + dr];
      if (row && row[c + dc]) count++;
    }
  }
  return count;
}

function step(grid) {
  return grid.map((row, r) =>
    row.map((alive, c) => {
      const n = neighbours(grid, r, c);
      return alive ? n === 2 || n === 3 : n === 3;
    }),
  );
}

function render(grid) {
  return grid.map((row) => row.map((alive) => (alive ? '#' : '.')).join('')).join('\n');
}

module.exports = { createGrid, neighbours, step, render };
`,
    },
    tests: String.raw`const { createGrid, neighbours, step, render } = require('./grid');

test('rows are independent', () => {
  const g = createGrid(2, 3, false);
  g[0][0] = true;
  expect(g[1][0]).toBe(false);
  expect(render(g)).toBe('#..\n...');
});

test('counts all eight neighbours, but not the cell itself', () => {
  const g = [[true, true, true], [true, true, true], [true, true, true]];
  expect(neighbours(g, 1, 1)).toBe(8);
  expect(neighbours(g, 0, 0)).toBe(3);
});

test('a blinker flips between horizontal and vertical', () => {
  const g = [[false, false, false], [true, true, true], [false, false, false]];
  expect(render(step(g))).toBe('.#.\n.#.\n.#.');
  expect(render(step(step(g)))).toBe('...\n###\n...');
});
`,
    bugs: [
      bug(
        'grid.js',
        'Array.from({ length: rows }, () => Array(cols).fill(fill))',
        'Array(rows).fill(Array(cols).fill(fill))',
        'MUTATION',
        'Every row is the same array',
        'fill() puts the same value in every slot. When that value is an array, all rows point to one array, so changing one row changes them all.',
      ),
      bug(
        'grid.js',
        'if (dr === 0 && dc === 0) continue;',
        'if (dr === 0 || dc === 0) continue;',
        'LOGIC',
        'Skips the straight neighbours',
        'Only the centre (0, 0) is the cell itself. With ||, every cell in the same row or column is skipped too.',
      ),
      bug(
        'grid.js',
        'for (let dc = -1; dc <= 1; dc++)',
        'for (let dc = -1; dc < 1; dc++)',
        'OFF_BY_ONE',
        'Never looks to the right',
        'Offsets go from -1 to +1 inclusive, so the condition is <= 1.',
      ),
      bug(
        'grid.js',
        'n === 2 || n === 3 : n === 3',
        'n === 2 && n === 3 : n === 3',
        'LOGIC',
        'Live cells always die',
        'A number can’t be 2 and 3 at once, so && is always false.',
      ),
      bug(
        'grid.js',
        ".join('')).join('\\n')",
        ".join(' ')).join('\\n')",
        'STRINGS',
        'Cells are separated by spaces',
        'Each row should render as a compact string like "#..".',
      ),
    ],
  },
  {
    slug: 'cart-reducer',
    title: 'Cart reducer',
    level: 'INTERMEDIATE',
    topic: 'Redux-style state updates without mutation',
    brief:
      'A reducer handles add (twice means quantity 2), remove, setQty (0 removes the item) and clear (keeping other state such as the currency). It must never change the previous state, and unknown actions change nothing.',
    estimatedMinutes: 25,
    files: {
      'cart-state.js': String.raw`function cartReducer(state, action) {
  switch (action.type) {
    case 'add': {
      const existing = state.items.find((i) => i.id === action.item.id);
      const items = existing
        ? state.items.map((i) => (i.id === action.item.id ? { ...i, qty: i.qty + 1 } : i))
        : [...state.items, { ...action.item, qty: 1 }];
      return { ...state, items };
    }
    case 'remove':
      return { ...state, items: state.items.filter((i) => i.id !== action.id) };
    case 'setQty': {
      if (action.qty <= 0) return cartReducer(state, { type: 'remove', id: action.id });
      return {
        ...state,
        items: state.items.map((i) => (i.id === action.id ? { ...i, qty: action.qty } : i)),
      };
    }
    case 'clear':
      return { ...state, items: [] };
    default:
      return state;
  }
}

function itemCount(state) {
  return state.items.reduce((n, i) => n + i.qty, 0);
}

module.exports = { cartReducer, itemCount };
`,
    },
    tests: String.raw`const { cartReducer, itemCount } = require('./cart-state');

const start = { currency: 'EUR', items: [] };
const pen = { id: 'pen', price: 2 };

test('adding twice increases the quantity', () => {
  const s = cartReducer(cartReducer(start, { type: 'add', item: pen }), { type: 'add', item: pen });
  expect(s.items).toEqual([{ id: 'pen', price: 2, qty: 2 }]);
  expect(itemCount(s)).toBe(2);
});

test('never changes the previous state', () => {
  const one = cartReducer(start, { type: 'add', item: pen });
  cartReducer(one, { type: 'add', item: pen });
  expect(one.items[0].qty).toBe(1);
  expect(pen.qty).toBeUndefined();
});

test('removes items; quantity zero removes them too', () => {
  const s = cartReducer(start, { type: 'add', item: pen });
  expect(cartReducer(s, { type: 'remove', id: 'pen' }).items).toEqual([]);
  expect(cartReducer(s, { type: 'setQty', id: 'pen', qty: 0 }).items).toEqual([]);
  expect(cartReducer(s, { type: 'setQty', id: 'pen', qty: 5 }).items[0].qty).toBe(5);
});

test('clear keeps the currency, unknown actions change nothing', () => {
  const s = cartReducer(start, { type: 'add', item: pen });
  expect(cartReducer(s, { type: 'clear' })).toEqual({ currency: 'EUR', items: [] });
  expect(cartReducer(s, { type: 'nope' })).toBe(s);
});
`,
    bugs: [
      bug(
        'cart-state.js',
        '{ ...i, qty: i.qty + 1 }',
        'Object.assign(i, { qty: i.qty + 1 })',
        'MUTATION',
        'Adding again changes the old state',
        'Object.assign(i, …) edits the item that the previous state still points to. Reducers return new objects.',
      ),
      bug(
        'cart-state.js',
        '[...state.items, { ...action.item, qty: 1 }]',
        '[...state.items, action.item]',
        'NULL_UNDEFINED',
        'New items have no quantity',
        'The product object has no qty, so later qty + 1 is NaN. Copy it and start the quantity at 1.',
      ),
      bug(
        'cart-state.js',
        'state.items.filter((i) => i.id !== action.id)',
        'state.items.filter((i) => i.id === action.id)',
        'LOGIC',
        'Remove keeps only the removed item',
        'filter keeps what passes. To remove one id, keep every item whose id is different.',
      ),
      bug(
        'cart-state.js',
        'if (action.qty <= 0)',
        'if (action.qty < 0)',
        'COMPARISON',
        'Quantity 0 keeps an empty line',
        'Setting the quantity to 0 means the customer doesn’t want it, so it should be removed.',
      ),
      bug(
        'cart-state.js',
        "    case 'clear':\n      return { ...state, items: [] };",
        "    case 'clear':\n      return { items: [] };",
        'STATE',
        'Clearing the cart forgets the currency',
        'The reducer owns the whole state object. Spread it so fields other than items survive.',
      ),
      bug(
        'cart-state.js',
        '    default:\n      return state;',
        '    default:\n      return { items: [] };',
        'STATE',
        'Unknown actions wipe the cart',
        'Reducers see every action in the app. Anything they don’t handle must return the state unchanged.',
      ),
    ],
  },
  {
    slug: 'search-and-median',
    title: 'Search and median',
    level: 'INTERMEDIATE',
    topic: 'Binary search, sorted insert and statistics',
    brief:
      'binarySearch returns the index of a value in a sorted array (or -1), insertSorted returns a new sorted array, sortNumbers sorts numerically and median handles odd and even lengths.',
    estimatedMinutes: 25,
    files: {
      'search.js': String.raw`function binarySearch(sorted, target) {
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (sorted[mid] === target) return mid;
    if (sorted[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

function insertSorted(sorted, value) {
  let i = 0;
  while (i < sorted.length && sorted[i] < value) i++;
  return [...sorted.slice(0, i), value, ...sorted.slice(i)];
}

function sortNumbers(values) {
  return [...values].sort((a, b) => a - b);
}

function median(values) {
  const s = sortNumbers(values);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

module.exports = { binarySearch, insertSorted, sortNumbers, median };
`,
    },
    tests: String.raw`const { binarySearch, insertSorted, sortNumbers, median } = require('./search');

test('finds values in a sorted array', () => {
  expect(binarySearch([1, 3, 5, 7], 5)).toBe(2);
  expect(binarySearch([4], 4)).toBe(0);
  expect(binarySearch([1, 3], 2)).toBe(-1);
});

test('inserts in order without changing the input', () => {
  const list = [1, 3, 5];
  expect(insertSorted(list, 4)).toEqual([1, 3, 4, 5]);
  expect(list).toEqual([1, 3, 5]);
});

test('sorts numbers by value, not as text', () => {
  expect(sortNumbers([10, 9, 1, 100])).toEqual([1, 9, 10, 100]);
});

test('finds the median of odd and even lists', () => {
  expect(median([5, 1, 3])).toBe(3);
  expect(median([4, 1, 3, 2])).toBe(2.5);
});
`,
    bugs: [
      bug(
        'search.js',
        'while (lo <= hi) {',
        'while (lo < hi) {',
        'OFF_BY_ONE',
        'Never checks the last remaining element',
        'When lo === hi there is still one candidate left. The loop must run while lo <= hi.',
      ),
      bug(
        'search.js',
        'const mid = Math.floor((lo + hi) / 2);',
        'const mid = (lo + hi) / 2;',
        'MATH',
        'Half-way can be a fraction',
        '(0 + 3) / 2 is 1.5, and sorted[1.5] is undefined. Array indexes must be whole numbers.',
      ),
      bug(
        'search.js',
        'return [...sorted.slice(0, i), value, ...sorted.slice(i)];',
        'sorted.splice(i, 0, value);\n  return sorted;',
        'MUTATION',
        'Changes the caller’s array',
        'splice edits the array in place. Callers that keep the old list see it change.',
      ),
      bug(
        'search.js',
        '[...values].sort((a, b) => a - b)',
        '[...values].sort()',
        'SORTING',
        'Numbers are sorted as text',
        'Without a comparator, sort() compares strings, so "10" < "9". Pass (a, b) => a - b for numbers.',
      ),
      bug(
        'search.js',
        '(s[mid - 1] + s[mid]) / 2',
        's[mid - 1] + s[mid] / 2',
        'MATH',
        'Halves only one of the middle values',
        'Division happens before addition. Brackets make the sum happen first.',
      ),
    ],
  },
  {
    slug: 'query-strings',
    title: 'Query strings',
    level: 'INTERMEDIATE',
    topic: 'Building and parsing URL parameters safely',
    brief:
      'buildQuery encodes keys and values (so "&" can’t inject parameters) and keeps 0 and empty strings. parseQuery reads queries with or without "?", decodes + as a space and handles flags without values. withParams adds to existing queries.',
    estimatedMinutes: 25,
    files: {
      'query.js': String.raw`function buildQuery(params) {
  return Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null)
    .map((key) => encodeURIComponent(key) + '=' + encodeURIComponent(params[key]))
    .join('&');
}

function parseQuery(query) {
  const out = {};
  const text = query.startsWith('?') ? query.slice(1) : query;
  if (!text) return out;
  for (const pair of text.split('&')) {
    const [key, value = ''] = pair.split('=');
    out[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
  }
  return out;
}

function withParams(url, params) {
  const query = buildQuery(params);
  if (!query) return url;
  return url + (url.includes('?') ? '&' : '?') + query;
}

module.exports = { buildQuery, parseQuery, withParams };
`,
    },
    tests: String.raw`const { buildQuery, parseQuery, withParams } = require('./query');

test('encodes keys and values so they cannot break the query', () => {
  expect(buildQuery({ q: 'a&admin=true', 'my key': 'x y' })).toBe('q=a%26admin%3Dtrue&my%20key=x%20y');
});

test('keeps zero and empty strings, drops null and undefined', () => {
  expect(buildQuery({ page: 0, q: '', a: null, b: undefined })).toBe('page=0&q=');
});

test('parses a query with or without the question mark', () => {
  expect(parseQuery('?a=1&b=two')).toEqual({ a: '1', b: 'two' });
  expect(parseQuery('a=1')).toEqual({ a: '1' });
  expect(parseQuery('')).toEqual({});
});

test('decodes plus signs and reads flags without values', () => {
  expect(parseQuery('q=hello+big+world&debug')).toEqual({ q: 'hello big world', debug: '' });
});

test('adds parameters to a URL that may already have some', () => {
  expect(withParams('/search', { q: 'x' })).toBe('/search?q=x');
  expect(withParams('/search?lang=en', { q: 'x' })).toBe('/search?lang=en&q=x');
  expect(withParams('/search', {})).toBe('/search');
});
`,
    bugs: [
      bug(
        'query.js',
        "encodeURIComponent(key) + '=' + encodeURIComponent(params[key])",
        "encodeURIComponent(key) + '=' + params[key]",
        'SECURITY',
        'Values aren’t encoded (parameter injection)',
        'A value containing "&admin=true" adds a whole new parameter. Encoding turns & and = into %26 and %3D so they stay part of the value.',
      ),
      bug(
        'query.js',
        '.filter((key) => params[key] !== undefined && params[key] !== null)',
        '.filter((key) => params[key])',
        'TYPE_COERCION',
        'Drops page=0 and empty searches',
        '0 and "" are falsy but meaningful. Only null and undefined mean “no value”.',
      ),
      bug(
        'query.js',
        "const text = query.startsWith('?') ? query.slice(1) : query;",
        'const text = query.slice(1);',
        'STRINGS',
        'Cuts the first letter when there is no “?”',
        'Only strip the question mark if it is actually there.',
      ),
      bug(
        'query.js',
        "const [key, value = ''] = pair.split('=');",
        "const [key, value] = pair.split('=');",
        'NULL_UNDEFINED',
        'Flags without “=” crash',
        '"debug".split("=") has one element, so value is undefined and .replace throws. A default value fixes that.',
      ),
      bug(
        'query.js',
        "value.replace(/\\+/g, ' ')",
        "value.replace('+', ' ')",
        'REGEX',
        'Only the first + becomes a space',
        'replace with a string pattern replaces the first match only. Use a regular expression with the g flag (or replaceAll).',
      ),
      bug(
        'query.js',
        "(url.includes('?') ? '&' : '?')",
        "'?'",
        'LOGIC',
        'A second “?” breaks URLs that already have a query',
        'If the URL already has a query, new parameters are joined with &.',
      ),
    ],
  },
  {
    slug: 'bank-accounts',
    title: 'Bank accounts',
    level: 'INTERMEDIATE',
    topic: 'Deposits, withdrawals and safe transfers',
    brief:
      'Accounts accept only positive amounts, allow withdrawing the whole balance (never more) and keep a history. A transfer either moves the money completely or not at all, also when the receiving account is closed.',
    estimatedMinutes: 30,
    files: {
      'account.js': String.raw`class Account {
  constructor(owner, balance = 0) {
    this.owner = owner;
    this.balance = balance;
    this.history = [];
    this.closed = false;
  }

  deposit(amount) {
    if (!(amount > 0)) throw new Error('Deposit must be positive');
    if (this.closed) throw new Error('Account closed');
    this.balance += amount;
    this.history.push({ type: 'deposit', amount });
  }

  withdraw(amount) {
    if (!(amount > 0)) throw new Error('Withdrawal must be positive');
    if (amount > this.balance) throw new Error('Insufficient funds');
    this.balance -= amount;
    this.history.push({ type: 'withdraw', amount });
  }
}

module.exports = { Account };
`,
      'bank.js': String.raw`function transfer(from, to, amount) {
  from.withdraw(amount);
  try {
    to.deposit(amount);
  } catch (e) {
    from.balance += amount;
    throw e;
  }
}

function totalBalance(accounts) {
  return accounts.reduce((sum, a) => sum + a.balance, 0);
}

function richest(accounts) {
  return accounts.reduce((best, a) => (a.balance > best.balance ? a : best), accounts[0]);
}

module.exports = { transfer, totalBalance, richest };
`,
    },
    tests: String.raw`const { Account } = require('./account');
const { transfer, totalBalance, richest } = require('./bank');

test('deposits and withdrawals update the balance and history', () => {
  const a = new Account('ada', 100);
  a.deposit(50);
  a.withdraw(30);
  expect(a.balance).toBe(120);
  expect(a.history.map((h) => h.type)).toEqual(['deposit', 'withdraw']);
});

test('rejects zero, negative and non-number amounts', () => {
  const a = new Account('ada', 10);
  expect(() => a.deposit(0)).toThrow('positive');
  expect(() => a.deposit(NaN)).toThrow('positive');
  expect(() => a.withdraw(-5)).toThrow('positive');
});

test('can withdraw everything, but not more', () => {
  const a = new Account('ada', 40);
  expect(() => a.withdraw(41)).toThrow('Insufficient funds');
  a.withdraw(40);
  expect(a.balance).toBe(0);
});

test('a failed transfer moves no money', () => {
  const a = new Account('ada', 30);
  const b = new Account('bob', 0);
  expect(() => transfer(a, b, 50)).toThrow('Insufficient funds');
  expect([a.balance, b.balance]).toEqual([30, 0]);
  const closed = new Account('old', 0);
  closed.closed = true;
  expect(() => transfer(a, closed, 10)).toThrow('Account closed');
  expect(a.balance).toBe(30);
});

test('totals and finds the richest account', () => {
  const list = [new Account('a', 10), new Account('b', 70), new Account('c', 20)];
  expect(totalBalance(list)).toBe(100);
  expect(richest(list).owner).toBe('b');
});
`,
    bugs: [
      bug(
        'account.js',
        "if (!(amount > 0)) throw new Error('Deposit must be positive');",
        "if (amount < 0) throw new Error('Deposit must be positive');",
        'LOGIC',
        'Zero and NaN deposits are accepted',
        'NaN < 0 is false and 0 < 0 is false, so both slip through. !(amount > 0) rejects everything that isn’t a positive number, NaN included.',
      ),
      bug(
        'account.js',
        'if (amount > this.balance) throw',
        'if (amount >= this.balance) throw',
        'COMPARISON',
        'Can’t empty the account',
        'Withdrawing exactly the balance leaves 0, which is fine.',
      ),
      bug(
        'account.js',
        'this.balance -= amount;',
        'this.balance - amount;',
        'LOGIC',
        'The withdrawal is computed and thrown away',
        'this.balance - amount calculates a value but stores it nowhere. -= assigns the result.',
      ),
      bug(
        'bank.js',
        '  from.withdraw(amount);\n  try {\n    to.deposit(amount);\n  } catch (e) {\n    from.balance += amount;\n    throw e;\n  }',
        '  to.deposit(amount);\n  from.withdraw(amount);',
        'ERROR_HANDLING',
        'Money is created when the withdrawal fails',
        'If the receiver is credited first and the sender then can’t pay, the money exists twice. Take it first, and put it back if the deposit fails.',
      ),
      bug(
        'bank.js',
        'accounts.reduce((sum, a) => sum + a.balance, 0)',
        'accounts.reduce((sum, a) => sum + a.balance)',
        'ARRAY_METHODS',
        'reduce without a starting value',
        'Without the initial 0, the first account object becomes the starting sum, and object + number is a string.',
      ),
      bug(
        'bank.js',
        '(a.balance > best.balance ? a : best)',
        '(a.balance > best ? a : best)',
        'TYPE_COERCION',
        'Compares a number with an account object',
        'best is an account; comparing a number with an object converts it to NaN, and the comparison is always false.',
      ),
    ],
  },
  {
    slug: 'pagination',
    title: 'Pagination',
    level: 'INTERMEDIATE',
    topic: 'Pages, page counts and page-number buttons',
    brief:
      'paginate() returns one page of items (pages start at 1; out-of-range pages are clamped) with hasNext/hasPrev. pageNumbers() shows a window of page buttons around the current page, always the full width when possible.',
    estimatedMinutes: 25,
    files: {
      'paginate.js': String.raw`function paginate(items, page, perPage) {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.min(Math.max(1, page), totalPages);
  const start = (current - 1) * perPage;
  return {
    items: items.slice(start, start + perPage),
    page: current,
    totalPages,
    hasNext: current < totalPages,
    hasPrev: current > 1,
  };
}

function pageNumbers(current, total, width) {
  const half = Math.floor(width / 2);
  let first = Math.max(1, current - half);
  const last = Math.min(total, first + width - 1);
  first = Math.max(1, last - width + 1);
  const out = [];
  for (let n = first; n <= last; n++) out.push(n);
  return out;
}

module.exports = { paginate, pageNumbers };
`,
    },
    tests: String.raw`const { paginate, pageNumbers } = require('./paginate');

const items = Array.from({ length: 23 }, (_, i) => i + 1);

test('returns the first page', () => {
  const p = paginate(items, 1, 10);
  expect(p.items).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  expect([p.totalPages, p.hasNext, p.hasPrev]).toEqual([3, true, false]);
});

test('returns a partial last page', () => {
  const p = paginate(items, 3, 10);
  expect(p.items).toEqual([21, 22, 23]);
  expect([p.hasNext, p.hasPrev]).toEqual([false, true]);
});

test('clamps pages that are out of range', () => {
  expect(paginate(items, 9, 10).page).toBe(3);
  expect(paginate([], 1, 10)).toEqual({ items: [], page: 1, totalPages: 1, hasNext: false, hasPrev: false });
});

test('shows a full window of page numbers', () => {
  expect(pageNumbers(1, 10, 5)).toEqual([1, 2, 3, 4, 5]);
  expect(pageNumbers(5, 10, 5)).toEqual([3, 4, 5, 6, 7]);
  expect(pageNumbers(10, 10, 5)).toEqual([6, 7, 8, 9, 10]);
  expect(pageNumbers(2, 3, 5)).toEqual([1, 2, 3]);
});
`,
    bugs: [
      bug(
        'paginate.js',
        'Math.ceil(items.length / perPage)',
        'Math.floor(items.length / perPage)',
        'MATH',
        'The partial last page is lost',
        '23 items at 10 per page need 3 pages. Rounding down gives 2.',
      ),
      bug(
        'paginate.js',
        'const start = (current - 1) * perPage;',
        'const start = current * perPage;',
        'OFF_BY_ONE',
        'Page 1 skips the first page',
        'Pages count from 1 but array indexes from 0, so page 1 starts at index 0.',
      ),
      bug(
        'paginate.js',
        'Math.min(Math.max(1, page), totalPages)',
        'Math.max(1, page)',
        'LOGIC',
        'Pages past the end are empty',
        'Clamping means limiting from both sides: at least 1 and at most totalPages.',
      ),
      bug(
        'paginate.js',
        'hasNext: current < totalPages,',
        'hasNext: current <= totalPages,',
        'COMPARISON',
        'The last page claims there is a next one',
        'On the last page, current equals totalPages, and there is nothing after it.',
      ),
      bug(
        'paginate.js',
        '  first = Math.max(1, last - width + 1);\n',
        '',
        'LOGIC',
        'Fewer buttons near the end',
        'Near the last page, the window is cut off on the right. Recompute first from last so the window stays full width.',
      ),
      bug(
        'paginate.js',
        'items.slice(start, start + perPage)',
        'items.slice(start, perPage)',
        'ARRAY_METHODS',
        'slice’s second argument is an end index',
        'slice(start, end) stops before end, it is not a length. Later pages come back empty.',
      ),
    ],
  },
  {
    slug: 'settings-merge',
    title: 'Settings merge',
    level: 'INTERMEDIATE',
    topic: 'Deep-merging user settings over defaults',
    brief:
      'User settings are merged over DEFAULTS recursively (arrays are replaced, not merged). Neither the defaults nor the user object may change. getPath reads "a.b.c" safely and keeps false and 0.',
    estimatedMinutes: 25,
    files: {
      'settings.js': String.raw`function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepMerge(base, override) {
  const out = { ...base };
  for (const key of Object.keys(override)) {
    const a = base[key];
    const b = override[key];
    out[key] = isPlainObject(a) && isPlainObject(b) ? deepMerge(a, b) : b;
  }
  return out;
}

function getPath(obj, path, fallback) {
  let current = obj;
  for (const key of path.split('.')) {
    if (current === null || current === undefined || !(key in Object(current))) return fallback;
    current = current[key];
  }
  return current;
}

const DEFAULTS = { theme: 'light', editor: { tabSize: 2, wrap: false }, plugins: [] };

function loadSettings(user) {
  return deepMerge(DEFAULTS, user || {});
}

module.exports = { deepMerge, getPath, loadSettings };
`,
    },
    tests: String.raw`const { deepMerge, getPath, loadSettings } = require('./settings');

test('merges nested objects without losing defaults', () => {
  expect(loadSettings({ editor: { tabSize: 4 } })).toEqual({
    theme: 'light',
    editor: { tabSize: 4, wrap: false },
    plugins: [],
  });
});

test('replaces arrays instead of merging them', () => {
  expect(loadSettings({ plugins: ['git'] }).plugins).toEqual(['git']);
});

test('never changes the defaults or the inputs', () => {
  const user = { theme: 'dark', editor: { wrap: true } };
  loadSettings(user);
  expect(loadSettings().theme).toBe('light');
  expect(loadSettings().editor.wrap).toBe(false);
  expect(user).toEqual({ theme: 'dark', editor: { wrap: true } });
});

test('adds new nested keys', () => {
  expect(deepMerge({ a: 1 }, { b: { c: 2 } })).toEqual({ a: 1, b: { c: 2 } });
});

test('reads paths safely, keeping false and 0', () => {
  const s = loadSettings({ editor: { wrap: false }, extra: null });
  expect(getPath(s, 'editor.wrap', true)).toBe(false);
  expect(getPath(s, 'extra.deep', 'none')).toBe('none');
  expect(getPath(s, 'missing.key', 7)).toBe(7);
});
`,
    bugs: [
      bug(
        'settings.js',
        'const out = { ...base };',
        'const out = base;',
        'MUTATION',
        'Merging writes into the defaults',
        'out = base is the same object, so every merge changes DEFAULTS for everyone afterwards. Copy it.',
      ),
      bug(
        'settings.js',
        'isPlainObject(a) && isPlainObject(b) ? deepMerge(a, b) : b',
        'isPlainObject(b) ? deepMerge(a, b) : b',
        'NULL_UNDEFINED',
        'Recurses into a value that doesn’t exist',
        'When the default has no value for that key, a is undefined and deepMerge reads properties of it. Only recurse when both sides are objects.',
      ),
      bug(
        'settings.js',
        "return typeof v === 'object' && v !== null && !Array.isArray(v);",
        "return typeof v === 'object';",
        'DATA_STRUCTURES',
        'Arrays and null count as objects',
        'typeof [] and typeof null are both "object". Arrays should be replaced, not merged key by key.',
      ),
      bug(
        'settings.js',
        'if (current === null || current === undefined || !(key in Object(current))) return fallback;',
        'if (!(key in current)) return fallback;',
        'NULL_UNDEFINED',
        'Paths through null crash',
        'The in operator throws on null and undefined. Check for them before looking inside.',
      ),
      bug(
        'settings.js',
        '  return current;\n}\n\nconst DEFAULTS',
        '  return current || fallback;\n}\n\nconst DEFAULTS',
        'TYPE_COERCION',
        'false and 0 are replaced by the fallback',
        '|| treats every falsy value as missing. A setting that is false is still a real value.',
      ),
      bug(
        'settings.js',
        'deepMerge(DEFAULTS, user || {})',
        'deepMerge(DEFAULTS, user)',
        'NULL_UNDEFINED',
        'Loading without user settings crashes',
        'Object.keys(undefined) throws. A missing user object means “no overrides”.',
      ),
    ],
  },
  {
    slug: 'meeting-slots',
    title: 'Meeting slots',
    level: 'INTERMEDIATE',
    topic: 'Finding free time between meetings',
    brief:
      'Given busy meetings (in any order, some inside others) and the working day, list free gaps at least `length` minutes long. A gap exactly as long as needed counts.',
    estimatedMinutes: 25,
    files: {
      'schedule.js': String.raw`function toMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function toTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function freeSlots(busy, dayStart, dayEnd, length) {
  const sorted = [...busy].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  const slots = [];
  let cursor = toMinutes(dayStart);
  for (const b of sorted) {
    const start = toMinutes(b.start);
    if (start - cursor >= length) slots.push(toTime(cursor) + '-' + toTime(start));
    cursor = Math.max(cursor, toMinutes(b.end));
  }
  if (toMinutes(dayEnd) - cursor >= length) slots.push(toTime(cursor) + '-' + dayEnd);
  return slots;
}

module.exports = { toMinutes, toTime, freeSlots };
`,
    },
    tests: String.raw`const { toMinutes, toTime, freeSlots } = require('./schedule');

test('converts times both ways', () => {
  expect(toMinutes('09:30')).toBe(570);
  expect(toTime(570)).toBe('09:30');
  expect(toTime(605)).toBe('10:05');
});

test('finds gaps between meetings, in time order', () => {
  const busy = [{ start: '13:00', end: '14:00' }, { start: '09:00', end: '10:00' }];
  expect(freeSlots(busy, '09:00', '17:00', 60)).toEqual(['10:00-13:00', '14:00-17:00']);
});

test('a gap exactly as long as the meeting counts', () => {
  expect(freeSlots([{ start: '10:00', end: '11:00' }], '09:00', '12:00', 60)).toEqual(['09:00-10:00', '11:00-12:00']);
});

test('handles meetings inside other meetings', () => {
  const busy = [{ start: '09:00', end: '12:00' }, { start: '10:00', end: '11:00' }];
  expect(freeSlots(busy, '09:00', '13:00', 30)).toEqual(['12:00-13:00']);
});
`,
    bugs: [
      bug(
        'schedule.js',
        "const [h, m] = time.split(':').map(Number);",
        "const [h, m] = time.split(':');",
        'TYPE_COERCION',
        'Minutes are glued on as text',
        'split gives strings. h * 60 converts h automatically, but + m concatenates: 540 + "30" is "54030".',
      ),
      bug(
        'schedule.js',
        'const m = minutes % 60;',
        'const m = minutes - h;',
        'MATH',
        'Wrong minutes',
        'The minutes left over after whole hours are minutes % 60 (or minutes - h * 60).',
      ),
      bug(
        'schedule.js',
        'const sorted = [...busy].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));',
        'const sorted = busy;',
        'SORTING',
        'Meetings must be in time order',
        'The sweep assumes meetings come in order of start time. Unsorted input makes it skip gaps.',
      ),
      bug(
        'schedule.js',
        'if (start - cursor >= length)',
        'if (start - cursor > length)',
        'COMPARISON',
        'A gap of exactly the right length is ignored',
        'A 60-minute meeting fits in a 60-minute gap.',
      ),
      bug(
        'schedule.js',
        'cursor = Math.max(cursor, toMinutes(b.end));',
        'cursor = toMinutes(b.end);',
        'LOGIC',
        'A short meeting inside a long one rewinds time',
        'If a meeting ends before the previous one, the busy time still runs until the later end.',
      ),
    ],
  },
  {
    slug: 'access-control',
    title: 'Access control',
    level: 'INTERMEDIATE',
    topic: 'Roles, permissions and visible documents',
    brief:
      'Viewers read, editors write their own documents, admins can do everything. Disabled users can do nothing, unknown roles get nothing, and signed-out visitors see only public documents.',
    estimatedMinutes: 25,
    files: {
      'roles.js': String.raw`const ROLES = {
  viewer: ['read'],
  editor: ['read', 'write'],
  admin: ['read', 'write', 'delete', 'invite'],
};

function can(user, action) {
  if (!user || user.disabled) return false;
  const allowed = Object.hasOwn(ROLES, user.role) ? ROLES[user.role] : [];
  return allowed.includes(action);
}

function canEditDoc(user, doc) {
  if (!can(user, 'write')) return false;
  return doc.ownerId === user.id || user.role === 'admin';
}

function visibleDocs(user, docs) {
  return docs.filter((d) => d.public || (user && d.ownerId === user.id) || can(user, 'delete'));
}

module.exports = { can, canEditDoc, visibleDocs };
`,
    },
    tests: String.raw`const { can, canEditDoc, visibleDocs } = require('./roles');

const ada = { id: 1, role: 'editor' };

test('roles allow only their actions', () => {
  expect(can({ id: 2, role: 'viewer' }, 'read')).toBe(true);
  expect(can({ id: 2, role: 'viewer' }, 'write')).toBe(false);
  expect(can({ id: 3, role: 'admin' }, 'delete')).toBe(true);
});

test('unknown or tricky role names get no permissions', () => {
  expect(can({ id: 4, role: 'constructor' }, 'read')).toBe(false);
  expect(can({ id: 4, role: 'superuser' }, 'read')).toBe(false);
});

test('disabled users can do nothing', () => {
  expect(can({ id: 5, role: 'admin', disabled: true }, 'read')).toBe(false);
});

test('editors edit only their own documents; admins edit any', () => {
  expect(canEditDoc(ada, { ownerId: 1 })).toBe(true);
  expect(canEditDoc(ada, { ownerId: 9 })).toBe(false);
  expect(canEditDoc({ id: 3, role: 'admin' }, { ownerId: 9 })).toBe(true);
});

test('signed-out visitors see only public documents', () => {
  const docs = [{ id: 'a', public: true, ownerId: 1 }, { id: 'b', public: false, ownerId: 1 }];
  expect(visibleDocs(null, docs).map((d) => d.id)).toEqual(['a']);
  expect(visibleDocs(ada, docs).map((d) => d.id)).toEqual(['a', 'b']);
});
`,
    bugs: [
      bug(
        'roles.js',
        'const allowed = Object.hasOwn(ROLES, user.role) ? ROLES[user.role] : [];',
        'const allowed = ROLES[user.role] || [];',
        'SECURITY',
        'Any property name is treated as a role',
        'Every object inherits properties like "constructor". ROLES["constructor"] is a function, not a role. Only accept keys ROLES really owns.',
      ),
      bug(
        'roles.js',
        'if (!user || user.disabled) return false;',
        'if (!user) return false;',
        'SECURITY',
        'Disabled accounts keep their powers',
        'Disabling an account must take effect everywhere, before any role check.',
      ),
      bug(
        'roles.js',
        "doc.ownerId === user.id || user.role === 'admin'",
        "doc.ownerId === user.id || user.role !== 'viewer'",
        'SECURITY',
        'Editors can edit everyone’s documents',
        'Only admins may edit documents they don’t own. “Not a viewer” also includes editors.',
      ),
      bug(
        'roles.js',
        '(user && d.ownerId === user.id)',
        'd.ownerId === user.id',
        'NULL_UNDEFINED',
        'Signed-out visitors crash the page',
        'user is null for visitors, and null.id throws.',
      ),
      bug(
        'roles.js',
        'return allowed.includes(action);',
        'return allowed.indexOf(action);',
        'TYPE_COERCION',
        'Returns a position, not yes/no',
        'indexOf returns 0 for the first permission (falsy) and -1 when missing (truthy), the exact opposite of what callers expect.',
      ),
    ],
  },
];
