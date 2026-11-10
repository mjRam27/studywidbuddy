import { bug, type ExerciseDef } from '../exercise';

/** Hard: subtle bugs that pass a quick glance — async ordering, state, recursion, security. */
export const HARD: ExerciseDef[] = [
  {
    slug: 'retry-with-backoff',
    title: 'Retry with backoff',
    level: 'HARD',
    topic: 'Retrying flaky requests the right way',
    brief:
      'retry() calls fn up to `attempts` times, waiting longer each time, and finally throws the last error. getJson() retries server errors (5xx) and rate limits (429) but not client errors, and treats any 2xx response as success.',
    estimatedMinutes: 35,
    files: {
      'retry.js': String.raw`function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retry(fn, { attempts = 3, baseDelay = 5, shouldRetry = () => true } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      lastError = e;
      if (attempt === attempts || !shouldRetry(e)) break;
      await sleep(baseDelay * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

module.exports = { retry, sleep };
`,
      'client.js': String.raw`const { retry } = require('./retry');

class HttpError extends Error {
  constructor(status) {
    super('HTTP ' + status);
    this.status = status;
  }
}

const transient = (e) => e instanceof HttpError && (e.status >= 500 || e.status === 429);

function getJson(request) {
  return retry(
    async () => {
      const res = await request();
      if (!res.ok) throw new HttpError(res.status);
      return res.body;
    },
    { attempts: 4, baseDelay: 1, shouldRetry: transient },
  );
}

module.exports = { getJson, HttpError, transient };
`,
    },
    tests: String.raw`const { retry } = require('./retry');
const { getJson } = require('./client');

const responses = (...list) => {
  let i = 0;
  return async () => list[Math.min(i++, list.length - 1)];
};

test('returns the first success', async () => {
  expect(await retry(async () => 'ok')).toBe('ok');
});

test('retries failures up to the number of attempts', async () => {
  let calls = 0;
  const value = await retry(
    async () => {
      calls++;
      if (calls < 3) throw new Error('flaky');
      return 'done';
    },
    { attempts: 3, baseDelay: 1 },
  );
  expect(value).toBe('done');
  expect(calls).toBe(3);
});

test('gives up with the last error', async () => {
  let calls = 0;
  const failing = async () => {
    calls++;
    throw new Error('boom ' + calls);
  };
  await expect(retry(failing, { attempts: 2, baseDelay: 1 })).rejects.toBe('boom 2');
  expect(calls).toBe(2);
});

test('retries server errors and rate limits, not client errors', async () => {
  const flaky = responses({ ok: false, status: 500 }, { ok: false, status: 429 }, { ok: true, status: 200, body: { id: 1 } });
  expect(await getJson(flaky)).toEqual({ id: 1 });
  let calls = 0;
  const notFound = async () => {
    calls++;
    return { ok: false, status: 404 };
  };
  await expect(getJson(notFound)).rejects.toBe('HTTP 404');
  expect(calls).toBe(1);
});

test('any 2xx response is a success', async () => {
  expect(await getJson(responses({ ok: true, status: 201, body: 'created' }))).toBe('created');
});
`,
    bugs: [
      bug(
        'retry.js',
        'return await fn(attempt);',
        'return fn(attempt);',
        'ASYNC',
        'Rejections escape the try block',
        'return fn() hands the promise back before it settles, so a rejection is never caught here and nothing is retried. await keeps the outcome inside try/catch.',
      ),
      bug(
        'retry.js',
        'attempt <= attempts;',
        'attempt < attempts;',
        'OFF_BY_ONE',
        'One attempt short',
        'Attempts are counted from 1, so the last one is attempt === attempts.',
      ),
      bug(
        'retry.js',
        'throw lastError;',
        'return lastError;',
        'ERROR_HANDLING',
        'Failure looks like success',
        'Returning the error resolves the promise with an Error object as its “value”. Callers must see a rejection.',
      ),
      bug(
        'client.js',
        'e.status >= 500',
        'e.status > 500',
        'COMPARISON',
        '500 itself isn’t retried',
        '500 Internal Server Error is the most common transient failure. “Server errors” are 500 and up.',
      ),
      bug(
        'client.js',
        'if (!res.ok) throw',
        'if (res.status !== 200) throw',
        'LOGIC',
        '201 Created is treated as a failure',
        'Every 2xx status means success. res.ok is true for 200–299.',
      ),
    ],
  },
  {
    slug: 'lru-cache',
    title: 'LRU cache',
    level: 'HARD',
    topic: 'A least-recently-used cache built on Map',
    brief:
      'The cache holds `capacity` entries. Reading or updating a key makes it the most recent; when full, the least recently used key is evicted. It counts hits and misses, and cached() never recomputes a key, even when the value is falsy.',
    estimatedMinutes: 35,
    files: {
      'lru.js': String.raw`class LRUCache {
  constructor(capacity) {
    if (!(capacity > 0)) throw new Error('Capacity must be positive');
    this.capacity = capacity;
    this.map = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  get(key) {
    if (!this.map.has(key)) {
      this.misses++;
      return undefined;
    }
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value);
    this.hits++;
    return value;
  }

  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
    return this;
  }

  keys() {
    return [...this.map.keys()];
  }
}

function cached(fn, cache) {
  return (key) => {
    if (cache.map.has(key)) return cache.get(key);
    const value = fn(key);
    cache.set(key, value);
    return value;
  };
}

module.exports = { LRUCache, cached };
`,
    },
    tests: String.raw`const { LRUCache, cached } = require('./lru');

test('evicts the least recently used key when full', () => {
  const c = new LRUCache(2);
  c.set('a', 1).set('b', 2).set('c', 3);
  expect(c.keys()).toEqual(['b', 'c']);
  expect(c.get('a')).toBeUndefined();
});

test('reading a key makes it recent', () => {
  const c = new LRUCache(2);
  c.set('a', 1).set('b', 2);
  c.get('a');
  c.set('c', 3);
  expect(c.keys()).toEqual(['a', 'c']);
});

test('updating a key makes it recent and keeps the size', () => {
  const c = new LRUCache(2);
  c.set('a', 1).set('b', 2).set('a', 10).set('c', 3);
  expect(c.keys()).toEqual(['a', 'c']);
  expect(c.get('a')).toBe(10);
});

test('counts hits and misses', () => {
  const c = new LRUCache(1);
  c.get('x');
  c.set('x', 1);
  c.get('x');
  expect([c.hits, c.misses]).toEqual([1, 1]);
});

test('cached() computes each key once, even falsy results', () => {
  let calls = 0;
  const isEven = cached((n) => {
    calls++;
    return n % 2 === 0;
  }, new LRUCache(10));
  isEven(3);
  isEven(3);
  isEven(4);
  expect(calls).toBe(2);
});
`,
    bugs: [
      bug(
        'lru.js',
        '    this.map.delete(key);\n    this.map.set(key, value);\n    this.hits++;',
        '    this.hits++;',
        'STATE',
        'Reads don’t refresh recency',
        'A Map remembers insertion order. Deleting and re-inserting a key moves it to the end, which is how this cache marks “recently used”.',
      ),
      bug(
        'lru.js',
        '    if (this.map.has(key)) this.map.delete(key);\n',
        '',
        'STATE',
        'Updating a key keeps its old position',
        'set() on an existing key changes the value but not the order. Delete it first so it moves to the end.',
      ),
      bug(
        'lru.js',
        'if (this.map.size > this.capacity) {',
        'if (this.map.size >= this.capacity) {',
        'OFF_BY_ONE',
        'Evicts when exactly full',
        'A cache of capacity 2 should hold 2 entries. Evict only once the size goes above capacity.',
      ),
      bug(
        'lru.js',
        'const oldest = this.map.keys().next().value;',
        'const oldest = [...this.map.keys()].pop();',
        'DATA_STRUCTURES',
        'Evicts the newest entry',
        'The first key in a Map is the oldest. pop() takes the last one, the key that was just inserted.',
      ),
      bug(
        'lru.js',
        'if (cache.map.has(key)) return cache.get(key);',
        'const hit = cache.get(key);\n    if (hit) return hit;',
        'STATE',
        'Falsy results are recomputed',
        'A cached false or 0 is a real answer. Ask whether the key exists, not whether the value is truthy.',
      ),
    ],
  },
  {
    slug: 'promise-pool',
    title: 'Promise pool',
    level: 'HARD',
    topic: 'Running async work with a concurrency limit',
    brief:
      'mapLimit runs fn over items with at most `limit` running at once, each item exactly once, results in input order. settleAll turns promises and plain values into {ok, value} / {ok, error} without ever throwing.',
    estimatedMinutes: 40,
    files: {
      'pool.js': String.raw`async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  let active = 0;
  let maxActive = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      active++;
      maxActive = Math.max(maxActive, active);
      try {
        results[index] = await fn(items[index], index);
      } finally {
        active--;
      }
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(limit, items.length); i++) workers.push(worker());
  await Promise.all(workers);
  return { results, maxActive };
}

async function settleAll(promises) {
  return Promise.all(
    promises.map((p) =>
      Promise.resolve(p).then(
        (value) => ({ ok: true, value }),
        (error) => ({ ok: false, error: error.message }),
      ),
    ),
  );
}

module.exports = { mapLimit, settleAll };
`,
    },
    tests: String.raw`const { mapLimit, settleAll } = require('./pool');

const delay = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));

test('keeps results in input order', async () => {
  const { results } = await mapLimit([30, 5, 15, 1], 2, (ms, i) => delay(ms, i * 10));
  expect(results).toEqual([0, 10, 20, 30]);
});

test('never runs more than the limit, and runs each item once', async () => {
  const seen = [];
  const { maxActive } = await mapLimit([1, 2, 3, 4, 5], 2, async (x) => {
    seen.push(x);
    await delay(5);
    return x;
  });
  expect(maxActive).toBe(2);
  expect(seen.sort()).toEqual([1, 2, 3, 4, 5]);
});

test('handles an empty list', async () => {
  expect((await mapLimit([], 3, async (x) => x)).results).toEqual([]);
});

test('settles promises and plain values without throwing', async () => {
  const out = await settleAll([Promise.resolve(1), Promise.reject(new Error('nope')), 3]);
  expect(out).toEqual([{ ok: true, value: 1 }, { ok: false, error: 'nope' }, { ok: true, value: 3 }]);
});
`,
    bugs: [
      bug(
        'pool.js',
        '      const index = next++;\n      active++;\n      maxActive = Math.max(maxActive, active);\n      try {\n        results[index] = await fn(items[index], index);',
        '      const index = next;\n      active++;\n      maxActive = Math.max(maxActive, active);\n      try {\n        results[index] = await fn(items[index], index);\n        next++;',
        'ASYNC',
        'Two workers grab the same item',
        'Claiming work and doing it are separated by an await. Another worker runs in that gap and reads the same next. Claim the index (next++) before awaiting.',
      ),
      bug(
        'pool.js',
        'i < Math.min(limit, items.length); i++',
        'i <= Math.min(limit, items.length); i++',
        'OFF_BY_ONE',
        'One worker too many',
        'Starting limit + 1 workers lets limit + 1 tasks run at once.',
      ),
      bug(
        'pool.js',
        '  await Promise.all(workers);\n',
        '  Promise.all(workers);\n',
        'ASYNC',
        'Returns before the work is done',
        'Without await, mapLimit returns immediately with an empty results array while the workers are still running.',
      ),
      bug(
        'pool.js',
        'Promise.resolve(p).then(',
        'p.then(',
        'ASYNC',
        'Plain values crash settleAll',
        'Not every item is a promise. Promise.resolve wraps plain values so .then is always there.',
      ),
    ],
  },
  {
    slug: 'debounce-throttle',
    title: 'Debounce and throttle',
    level: 'HARD',
    topic: 'Rate-limiting function calls in a UI',
    brief:
      'debounce waits until calls stop, then runs once with the last arguments and the right `this`; pending() and cancel() work. throttle runs the first call immediately and then at most once per window.',
    estimatedMinutes: 35,
    files: {
      'timing.js': String.raw`function debounce(fn, wait) {
  let timer = null;
  function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn.apply(this, args);
    }, wait);
  }
  debounced.cancel = () => {
    clearTimeout(timer);
    timer = null;
  };
  debounced.pending = () => timer !== null;
  return debounced;
}

function throttle(fn, wait) {
  let last = -Infinity;
  return function (...args) {
    const now = Date.now();
    if (now - last >= wait) {
      last = now;
      return fn.apply(this, args);
    }
  };
}

module.exports = { debounce, throttle };
`,
    },
    tests: String.raw`const { debounce, throttle } = require('./timing');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('debounce runs once, with the last arguments, after calls stop', async () => {
  const calls = [];
  const d = debounce((x) => calls.push(x), 20);
  d(1);
  d(2);
  d(3);
  expect(calls).toEqual([]);
  await wait(50);
  expect(calls).toEqual([3]);
  expect(d.pending()).toBe(false);
});

test('debounce keeps "this" for methods', async () => {
  const doc = {
    saved: 0,
    save: debounce(function () {
      this.saved++;
    }, 10),
  };
  doc.save();
  await wait(30);
  expect(doc.saved).toBe(1);
});

test('cancel stops a pending call', async () => {
  const calls = [];
  const d = debounce(() => calls.push('x'), 10);
  d();
  d.cancel();
  await wait(30);
  expect(calls).toEqual([]);
});

test('throttle allows the first call, then at most one per window', async () => {
  const calls = [];
  const t = throttle((x) => calls.push(x), 30);
  t(1);
  t(2);
  await wait(45);
  t(3);
  expect(calls).toEqual([1, 3]);
});
`,
    bugs: [
      bug(
        'timing.js',
        '    clearTimeout(timer);\n    timer = setTimeout(',
        '    timer = setTimeout(',
        'STATE',
        'Every call fires',
        'Debouncing works by cancelling the previous timer on each call. Without clearTimeout, all three calls run.',
      ),
      bug(
        'timing.js',
        'timer = setTimeout(() => {',
        'timer = setTimeout(function () {',
        'SCOPE_CLOSURES',
        '`this` is lost in the timer',
        'A regular function called by setTimeout gets its own this. The arrow function keeps the this of debounced, which is the object the method was called on.',
      ),
      bug(
        'timing.js',
        '      timer = null;\n      fn.apply',
        '      fn.apply',
        'STATE',
        'pending() stays true forever',
        'After the call runs nothing is pending, so the timer reference must be cleared.',
      ),
      bug(
        'timing.js',
        'debounced.cancel = () => {\n    clearTimeout(timer);\n',
        'debounced.cancel = () => {\n',
        'STATE',
        'cancel() doesn’t cancel',
        'Setting timer to null only forgets the timer; it still fires. clearTimeout stops it.',
      ),
      bug(
        'timing.js',
        '    if (now - last >= wait) {\n      last = now;',
        '    last = now;\n    if (now - last >= wait) {',
        'LOGIC',
        'Throttle never fires',
        'Updating last before the check makes now - last always 0. Record the time only when the call actually runs.',
      ),
    ],
  },
  {
    slug: 'file-tree',
    title: 'File tree',
    level: 'HARD',
    topic: 'Building and walking a tree from flat rows',
    brief:
      'Rows with parentId become a tree (without changing the rows). depth() counts levels, findPath() returns the names from the root to a node anywhere in the tree, and flatten() lists names with their indentation level.',
    estimatedMinutes: 35,
    files: {
      'tree.js': String.raw`function buildTree(rows) {
  const byId = new Map(rows.map((r) => [r.id, { ...r, children: [] }]));
  const roots = [];
  for (const node of byId.values()) {
    const parent = node.parentId === null ? null : byId.get(node.parentId);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function depth(node) {
  if (node.children.length === 0) return 1;
  return 1 + Math.max(...node.children.map(depth));
}

function findPath(nodes, id, path = []) {
  for (const node of nodes) {
    const here = [...path, node.name];
    if (node.id === id) return here;
    const found = findPath(node.children, id, here);
    if (found) return found;
  }
  return null;
}

function flatten(nodes, level = 0) {
  return nodes.flatMap((n) => [{ name: n.name, level }, ...flatten(n.children, level + 1)]);
}

module.exports = { buildTree, depth, findPath, flatten };
`,
    },
    tests: String.raw`const { buildTree, depth, findPath, flatten } = require('./tree');

const rows = [
  { id: 1, parentId: null, name: 'src' },
  { id: 2, parentId: 1, name: 'app' },
  { id: 3, parentId: 2, name: 'main.js' },
  { id: 4, parentId: 1, name: 'lib' },
  { id: 5, parentId: 4, name: 'util.js' },
  { id: 6, parentId: null, name: 'README.md' },
];

test('builds a tree without changing the rows', () => {
  const roots = buildTree(rows);
  expect(roots.map((r) => r.name)).toEqual(['src', 'README.md']);
  expect(rows[0].children).toBeUndefined();
});

test('measures depth', () => {
  const [src, readme] = buildTree(rows);
  expect(depth(src)).toBe(3);
  expect(depth(readme)).toBe(1);
});

test('finds the path to a node anywhere in the tree', () => {
  const roots = buildTree(rows);
  expect(findPath(roots, 5)).toEqual(['src', 'lib', 'util.js']);
  expect(findPath(roots, 99)).toBeNull();
});

test('flattens with indentation levels', () => {
  expect(flatten(buildTree(rows))).toEqual([
    { name: 'src', level: 0 },
    { name: 'app', level: 1 },
    { name: 'main.js', level: 2 },
    { name: 'lib', level: 1 },
    { name: 'util.js', level: 2 },
    { name: 'README.md', level: 0 },
  ]);
});
`,
    bugs: [
      bug(
        'tree.js',
        '{ ...r, children: [] }',
        'Object.assign(r, { children: [] })',
        'MUTATION',
        'Writes children into the caller’s rows',
        'Object.assign(r, …) adds the children array to the original row objects. Spread into a new object to leave the input untouched.',
      ),
      bug(
        'tree.js',
        'return 1 + Math.max(...node.children.map(depth));',
        'return Math.max(...node.children.map(depth));',
        'RECURSION',
        'Forgets to count the current level',
        'Each recursive call returns the depth below a child; the node itself adds one level on top.',
      ),
      bug(
        'tree.js',
        '    const here = [...path, node.name];',
        '    path.push(node.name);\n    const here = path;',
        'MUTATION',
        'Sibling names pile up in the path',
        'Every call shares one path array, so names of branches that were already searched stay in it. Each level needs its own copy.',
      ),
      bug(
        'tree.js',
        '    if (found) return found;',
        '    return found;',
        'RECURSION',
        'Only searches the first branch',
        'Returning unconditionally stops the loop after the first child, even when nothing was found there.',
      ),
      bug(
        'tree.js',
        'flatten(n.children, level + 1)',
        'flatten(n.children, level++)',
        'SCOPE_CLOSURES',
        'Children get the parent’s level, and siblings drift',
        'level++ passes the old value and then changes level for the rest of the loop. Pass level + 1 without changing level.',
      ),
    ],
  },
  {
    slug: 'route-finder',
    title: 'Route finder',
    level: 'HARD',
    topic: 'Shortest paths in a road network (BFS)',
    brief:
      'Roads go both ways. shortestPath returns the fewest-stops path in order (or null when there is none or a place is unknown); reachable counts the other places you can get to.',
    estimatedMinutes: 35,
    files: {
      'graph.js': String.raw`function buildGraph(edges) {
  const graph = new Map();
  for (const [a, b] of edges) {
    if (!graph.has(a)) graph.set(a, []);
    if (!graph.has(b)) graph.set(b, []);
    graph.get(a).push(b);
    graph.get(b).push(a);
  }
  return graph;
}

function shortestPath(graph, from, to) {
  if (!graph.has(from) || !graph.has(to)) return null;
  const queue = [from];
  const previous = new Map([[from, null]]);
  while (queue.length) {
    const node = queue.shift();
    if (node === to) break;
    for (const next of graph.get(node)) {
      if (previous.has(next)) continue;
      previous.set(next, node);
      queue.push(next);
    }
  }
  if (!previous.has(to)) return null;
  const path = [];
  for (let at = to; at !== null; at = previous.get(at)) path.unshift(at);
  return path;
}

function reachable(graph, start) {
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    for (const next of graph.get(stack.pop()) || []) {
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return seen.size - 1;
}

module.exports = { buildGraph, shortestPath, reachable };
`,
    },
    tests: String.raw`const { buildGraph, shortestPath, reachable } = require('./graph');

const g = buildGraph([['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'E'], ['E', 'D'], ['X', 'Y']]);

test('finds the shortest path, in order', () => {
  expect(shortestPath(g, 'A', 'D')).toEqual(['A', 'B', 'D']);
});

test('roads go both ways', () => {
  expect(shortestPath(g, 'D', 'A')).toEqual(['D', 'B', 'A']);
});

test('unconnected or unknown places have no path', () => {
  expect(shortestPath(g, 'A', 'X')).toBeNull();
  expect(shortestPath(g, 'A', 'Z')).toBeNull();
  expect(shortestPath(g, 'Z', 'A')).toBeNull();
});

test('counts the places reachable from a start', () => {
  expect(reachable(g, 'A')).toBe(4);
  expect(reachable(g, 'X')).toBe(1);
});
`,
    bugs: [
      bug(
        'graph.js',
        '    graph.get(b).push(a);\n',
        '',
        'DATA_STRUCTURES',
        'Roads become one-way',
        'An undirected edge has to be stored in both directions.',
      ),
      bug(
        'graph.js',
        'const node = queue.shift();',
        'const node = queue.pop();',
        'DATA_STRUCTURES',
        'Depth-first instead of breadth-first',
        'BFS finds shortest paths because it takes the oldest item first (a queue: shift). pop takes the newest (a stack), which explores deep paths first.',
      ),
      bug(
        'graph.js',
        'path.unshift(at);',
        'path.push(at);',
        'ARRAY_METHODS',
        'The path comes out backwards',
        'Walking previous links goes from the destination back to the start. unshift adds each step in front, so the result reads start → end.',
      ),
      bug(
        'graph.js',
        '  if (!graph.has(from) || !graph.has(to)) return null;\n',
        '',
        'NULL_UNDEFINED',
        'Unknown places crash',
        'graph.get("Z") is undefined, and iterating undefined throws.',
      ),
      bug(
        'graph.js',
        'return seen.size - 1;',
        'return seen.size;',
        'OFF_BY_ONE',
        'Counts the starting place',
        'seen starts with the start node in it, but the question is how many other places are reachable.',
      ),
    ],
  },
  {
    slug: 'expense-split',
    title: 'Expense split',
    level: 'HARD',
    topic: 'Splitting money to the cent, like Splitwise',
    brief:
      'Money is handled in whole cents. Even and weighted splits must always add up to the total exactly. settle() returns each person’s balance (positive = owed money), and the balances always sum to zero.',
    estimatedMinutes: 40,
    files: {
      'split.js': String.raw`function toCents(amount) {
  return Math.round(amount * 100);
}

function splitEvenly(totalCents, people) {
  const base = Math.floor(totalCents / people);
  let remainder = totalCents - base * people;
  return Array.from({ length: people }, () => {
    if (remainder > 0) {
      remainder--;
      return base + 1;
    }
    return base;
  });
}

function splitByWeight(totalCents, weights) {
  const sum = weights.reduce((a, w) => a + w, 0);
  const shares = weights.map((w) => Math.floor((totalCents * w) / sum));
  let left = totalCents - shares.reduce((a, s) => a + s, 0);
  for (let i = 0; left > 0; i = (i + 1) % shares.length) {
    shares[i]++;
    left--;
  }
  return shares;
}

module.exports = { toCents, splitEvenly, splitByWeight };
`,
      'ledger.js': String.raw`const { toCents, splitEvenly } = require('./split');

function settle(expenses, people) {
  const balance = Object.fromEntries(people.map((p) => [p, 0]));
  for (const e of expenses) {
    const cents = toCents(e.amount);
    const shares = splitEvenly(cents, e.between.length);
    e.between.forEach((p, i) => {
      balance[p] -= shares[i];
    });
    balance[e.paidBy] += cents;
  }
  return balance;
}

module.exports = { settle };
`,
    },
    tests: String.raw`const { toCents, splitEvenly, splitByWeight } = require('./split');
const { settle } = require('./ledger');

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

test('converts euros to whole cents', () => {
  expect(toCents(19.99)).toBe(1999);
  expect(toCents(0.1 + 0.2)).toBe(30);
});

test('even splits always add up to the total', () => {
  expect(splitEvenly(100, 3)).toEqual([34, 33, 33]);
  expect(splitEvenly(200, 3)).toEqual([67, 67, 66]);
  expect(sum(splitEvenly(1001, 7))).toBe(1001);
});

test('weighted splits add up to the total', () => {
  expect(splitByWeight(1000, [1, 1, 2])).toEqual([250, 250, 500]);
  expect(sum(splitByWeight(1000, [1, 2, 4]))).toBe(1000);
});

test('settles who owes whom, to the cent', () => {
  const balance = settle(
    [
      { paidBy: 'ana', amount: 30, between: ['ana', 'ben', 'cy'] },
      { paidBy: 'ben', amount: 10.01, between: ['ana', 'ben'] },
    ],
    ['ana', 'ben', 'cy'],
  );
  expect(balance).toEqual({ ana: 1499, ben: -499, cy: -1000 });
  expect(sum(Object.values(balance))).toBe(0);
});
`,
    bugs: [
      bug(
        'split.js',
        'return Math.round(amount * 100);',
        'return amount * 100;',
        'MATH',
        'Floating-point cents',
        '19.99 * 100 is 1998.9999999999998 in binary floating point. Money must be rounded to whole cents.',
      ),
      bug(
        'split.js',
        'const base = Math.floor(totalCents / people);',
        'const base = Math.round(totalCents / people);',
        'MATH',
        'Rounding up overshoots the total',
        '200 / 3 rounds to 67, and 3 × 67 is 201. Round down, then hand out the remainder one cent at a time.',
      ),
      bug(
        'split.js',
        'const sum = weights.reduce((a, w) => a + w, 0);',
        'const sum = weights.length;',
        'LOGIC',
        'Divides by the number of people, not the total weight',
        'Each share is weight / total weight. With weights [1, 1, 2] the total weight is 4, not 3.',
      ),
      bug(
        'ledger.js',
        'balance[e.paidBy] += cents;',
        'balance[e.paidBy] = cents;',
        'LOGIC',
        'Paying wipes out what you owed',
        '= replaces the payer’s balance, losing their share of earlier expenses. Add to it.',
      ),
      bug(
        'ledger.js',
        'const balance = Object.fromEntries(people.map((p) => [p, 0]));',
        'const balance = {};',
        'NULL_UNDEFINED',
        'Balances start as undefined',
        'undefined - 1000 is NaN. Everyone must start at 0.',
      ),
    ],
  },
  {
    slug: 'seat-reservations',
    title: 'Seat reservations',
    level: 'HARD',
    topic: 'Race conditions and locks in async code',
    brief:
      'Reserving a seat must be safe when two people click at the same time: exactly one wins. Confirming your own seat again is fine. One failure must not block later reservations, and reserving several seats is all-or-nothing without ever freeing someone else’s seat.',
    estimatedMinutes: 45,
    files: {
      'store.js': String.raw`function createStore() {
  const seats = new Map();
  const tick = () => new Promise((r) => setTimeout(r, 1));
  return {
    async get(id) {
      await tick();
      return seats.has(id) ? { ...seats.get(id) } : null;
    },
    async put(id, value) {
      await tick();
      seats.set(id, { ...value });
    },
    async remove(id) {
      await tick();
      seats.delete(id);
    },
  };
}

module.exports = { createStore };
`,
      'reservations.js': String.raw`function createLock() {
  let last = Promise.resolve();
  return function withLock(fn) {
    const run = last.then(() => fn());
    last = run.catch(() => {});
    return run;
  };
}

function createReservations(store) {
  const withLock = createLock();

  async function reserve(seatId, userId) {
    return withLock(async () => {
      const seat = await store.get(seatId);
      if (seat && seat.userId !== userId) {
        throw new Error('Seat ' + seatId + ' is taken');
      }
      await store.put(seatId, { userId });
      return true;
    });
  }

  async function reserveMany(seatIds, userId) {
    const done = [];
    try {
      for (const id of seatIds) {
        await reserve(id, userId);
        done.push(id);
      }
      return done;
    } catch (e) {
      for (const id of done) await store.remove(id);
      throw e;
    }
  }

  return { reserve, reserveMany };
}

module.exports = { createReservations };
`,
    },
    tests: String.raw`const { createStore } = require('./store');
const { createReservations } = require('./reservations');

test('reserves a free seat, and the same person can confirm it again', async () => {
  const r = createReservations(createStore());
  expect(await r.reserve('A1', 'ana')).toBe(true);
  expect(await r.reserve('A1', 'ana')).toBe(true);
  await expect(r.reserve('A1', 'ben')).rejects.toBe('Seat A1 is taken');
});

test('two people racing for one seat: exactly one wins', async () => {
  const r = createReservations(createStore());
  const results = await Promise.allSettled([r.reserve('B1', 'ana'), r.reserve('B1', 'ben')]);
  expect(results.map((x) => x.status).sort()).toEqual(['fulfilled', 'rejected']);
});

test('one failure does not block later reservations', async () => {
  const r = createReservations(createStore());
  await r.reserve('C1', 'ana');
  await expect(r.reserve('C1', 'ben')).rejects.toBe('Seat C1 is taken');
  expect(await r.reserve('C2', 'ben')).toBe(true);
});

test('several seats are all-or-nothing and never free someone else’s seat', async () => {
  const store = createStore();
  const r = createReservations(store);
  await r.reserve('D2', 'ana');
  await expect(r.reserveMany(['D1', 'D2'], 'ben')).rejects.toBe('Seat D2 is taken');
  expect(await store.get('D1')).toBeNull();
  expect((await store.get('D2')).userId).toBe('ana');
});
`,
    bugs: [
      bug(
        'reservations.js',
        'const run = last.then(() => fn());',
        'const run = fn();',
        'ASYNC',
        'The lock doesn’t lock',
        'Calling fn() right away lets two reservations read “free” before either writes. Chaining onto the previous run makes them take turns.',
      ),
      bug(
        'reservations.js',
        'last = run.catch(() => {});',
        'last = run;',
        'ASYNC',
        'One failure poisons every later reservation',
        'If the chain stores a rejected promise, every later .then is skipped and rejects too. The lock must continue whether the previous run failed or not.',
      ),
      bug(
        'reservations.js',
        'if (seat && seat.userId !== userId) {',
        'if (seat) {',
        'LOGIC',
        'You can’t confirm your own seat',
        'A seat is only “taken” when it belongs to someone else.',
      ),
      bug(
        'reservations.js',
        '        await reserve(id, userId);\n        done.push(id);',
        '        done.push(id);\n        await reserve(id, userId);',
        'ERROR_HANDLING',
        'Rollback frees a seat you never got',
        'The seat is recorded as yours before the reservation succeeds, so the rollback deletes the other person’s seat. Record success only after it happened.',
      ),
    ],
  },
  {
    slug: 'safe-templates',
    title: 'Safe HTML templates',
    level: 'HARD',
    topic: 'A mini template engine with XSS protection',
    brief:
      '{{ path }} inserts an HTML-escaped value, {{{ path }}} inserts raw HTML (for trusted content only). Paths can be nested (user.name). Missing values render as nothing, but 0 and false are shown.',
    estimatedMinutes: 35,
    files: {
      'template.js': String.raw`const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

function lookup(data, path) {
  return path.split('.').reduce((obj, key) => (obj === null || obj === undefined ? undefined : obj[key]), data);
}

function render(template, data) {
  return template.replace(/{{{\s*([\w.]+)\s*}}}|{{\s*([\w.]+)\s*}}/g, (_, raw, safe) => {
    const value = lookup(data, raw || safe);
    if (value === undefined || value === null) return '';
    return raw ? String(value) : escapeHtml(value);
  });
}

function renderList(items, itemTemplate) {
  return items.map((item) => render(itemTemplate, item)).join('');
}

module.exports = { escapeHtml, render, renderList };
`,
    },
    tests: String.raw`const { escapeHtml, render, renderList } = require('./template');

test('escapes every special HTML character', () => {
  expect(escapeHtml('<a href="x">Tom & Jerry\'s</a>')).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
});

test('double braces escape, triple braces insert raw HTML', () => {
  const data = { name: '<b>Ada</b>', bio: '<i>pioneer</i>' };
  expect(render('Hi {{ name }}! {{{bio}}}', data)).toBe('Hi &lt;b&gt;Ada&lt;/b&gt;! <i>pioneer</i>');
});

test('renders 0 and false, but not missing values', () => {
  expect(render('{{count}} {{flag}} [{{missing}}] [{{user.address.city}}]', { count: 0, flag: false, user: {} })).toBe(
    '0 false [] []',
  );
});

test('renders a list with nested fields', () => {
  const items = [{ user: { name: 'Ada' } }, { user: { name: 'Grace' } }];
  expect(renderList(items, '<li>{{user.name}}</li>')).toBe('<li>Ada</li><li>Grace</li>');
});
`,
    bugs: [
      bug(
        'template.js',
        '/[&<>"\']/g',
        '/[<>"\']/g',
        'SECURITY',
        'Ampersands aren’t escaped',
        'If & isn’t escaped, text like "&lt;script&gt;" reaches the browser as real markup once decoded, and "Tom & Jerry" is invalid HTML.',
      ),
      bug(
        'template.js',
        'return raw ? String(value) : escapeHtml(value);',
        'return safe ? String(value) : escapeHtml(value);',
        'SECURITY',
        'Escaping is swapped (XSS)',
        'Double braces are the safe default and must escape. Inserting user data raw lets anyone inject <script> tags.',
      ),
      bug(
        'template.js',
        "if (value === undefined || value === null) return '';",
        "if (!value) return '';",
        'TYPE_COERCION',
        '0 and false disappear',
        '!value is true for 0, false and "", which are real values. Only null and undefined mean “missing”.',
      ),
      bug(
        'template.js',
        '(obj === null || obj === undefined ? undefined : obj[key])',
        'obj[key]',
        'NULL_UNDEFINED',
        'Missing nested values crash the page',
        'user.address is undefined, so reading .city from it throws. Stop walking the path once a level is missing.',
      ),
      bug(
        'template.js',
        String.raw`|{{\s*([\w.]+)\s*}}/g`,
        String.raw`|{{\s*(\w+)\s*}}/g`,
        'REGEX',
        'Nested paths aren’t recognised',
        '\\w matches letters, digits and underscores, not dots, so {{user.name}} is left as literal text. The character class [\\w.] allows dots too.',
      ),
    ],
  },
  {
    slug: 'list-diff',
    title: 'List diff',
    level: 'HARD',
    topic: 'Diffing and patching lists of records',
    brief:
      'diffById compares two lists of records by id and value (not object identity): added, removed and changed (an extra field counts as a change; NaN equals NaN). applyDiff turns the old list into the new one.',
    estimatedMinutes: 35,
    files: {
      'diff.js': String.raw`function shallowEqual(a, b) {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.is(a[k], b[k]));
}

function diffById(before, after) {
  const old = new Map(before.map((x) => [x.id, x]));
  const now = new Map(after.map((x) => [x.id, x]));
  const added = after.filter((x) => !old.has(x.id));
  const removed = before.filter((x) => !now.has(x.id));
  const changed = after.filter((x) => old.has(x.id) && !shallowEqual(old.get(x.id), x));
  return { added, removed, changed };
}

function applyDiff(list, { added, removed, changed }) {
  const removedIds = new Set(removed.map((x) => x.id));
  const updates = new Map(changed.map((x) => [x.id, x]));
  return list
    .filter((x) => !removedIds.has(x.id))
    .map((x) => updates.get(x.id) || x)
    .concat(added);
}

module.exports = { diffById, applyDiff };
`,
    },
    tests: String.raw`const { diffById, applyDiff } = require('./diff');

const before = [{ id: 1, name: 'pen', qty: 2 }, { id: 2, name: 'ink', qty: NaN }, { id: 3, name: 'pad', qty: 5 }];
const after = [
  { id: 1, name: 'pen', qty: 2 },
  { id: 2, name: 'ink', qty: NaN },
  { id: 3, name: 'pad', qty: 4 },
  { id: 4, name: 'cap', qty: 1 },
];

test('finds added, removed and changed records by value, not identity', () => {
  const d = diffById(before, after);
  expect(d.added.map((x) => x.id)).toEqual([4]);
  expect(d.removed).toEqual([]);
  expect(d.changed.map((x) => x.id)).toEqual([3]);
});

test('an extra field counts as a change', () => {
  expect(diffById([{ id: 1, a: 1 }], [{ id: 1, a: 1, b: 2 }]).changed).toHaveLength(1);
});

test('applying the diff turns before into after', () => {
  const list = [{ id: 1, v: 1 }, { id: 2, v: 2 }];
  const next = [{ id: 2, v: 20 }, { id: 3, v: 3 }];
  expect(applyDiff(list, diffById(list, next))).toEqual([{ id: 2, v: 20 }, { id: 3, v: 3 }]);
});
`,
    bugs: [
      bug(
        'diff.js',
        '!shallowEqual(old.get(x.id), x)',
        'old.get(x.id) !== x',
        'COMPARISON',
        'Compares object identity, not values',
        'Two objects with the same contents are still different objects. Records from an API are always new objects, so compare their fields.',
      ),
      bug(
        'diff.js',
        'return ka.length === kb.length && ka.every',
        'return ka.every',
        'LOGIC',
        'Extra fields go unnoticed',
        'Checking a’s keys against b misses keys only b has. Compare the key counts first.',
      ),
      bug(
        'diff.js',
        'Object.is(a[k], b[k])',
        'a[k] === b[k]',
        'COMPARISON',
        'NaN never equals itself',
        'NaN === NaN is false, so a record holding NaN always looks changed. Object.is treats NaN as equal to NaN.',
      ),
      bug(
        'diff.js',
        '.concat(added);',
        '.concat(changed);',
        'LOGIC',
        'New records are never added',
        'Changed records were already replaced by map(). What’s missing from the old list are the added ones.',
      ),
      bug(
        'diff.js',
        'const removedIds = new Set(removed.map((x) => x.id));',
        'const removedIds = removed;',
        'DATA_STRUCTURES',
        'An array has no .has()',
        'removed is an array of records. A Set of ids gives fast membership checks with .has(id).',
      ),
    ],
  },
  {
    slug: 'rate-limiter',
    title: 'Rate limiter',
    level: 'HARD',
    topic: 'A sliding-window limiter for an API',
    brief:
      'Each key may make `limit` requests per sliding window. A request exactly windowMs old no longer counts. Refusals say when to retry (based on the oldest request). Limiters and keys are independent. Time comes from an injected clock.',
    estimatedMinutes: 35,
    files: {
      'limiter.js': String.raw`function createLimiter({ limit, windowMs, now = () => Date.now() }) {
  const hits = new Map();

  function prune(key, t) {
    const list = hits.get(key) || [];
    const fresh = list.filter((ts) => t - ts < windowMs);
    hits.set(key, fresh);
    return fresh;
  }

  return {
    attempt(key) {
      const t = now();
      const recent = prune(key, t);
      if (recent.length >= limit) {
        const retryAfter = recent[0] + windowMs - t;
        return { allowed: false, retryAfter };
      }
      recent.push(t);
      return { allowed: true, remaining: limit - recent.length };
    },
    reset(key) {
      hits.delete(key);
    },
  };
}

module.exports = { createLimiter };
`,
    },
    tests: String.raw`const { createLimiter } = require('./limiter');

const clock = () => {
  let t = 0;
  const now = () => t;
  now.advance = (ms) => {
    t += ms;
  };
  return now;
};

test('allows up to the limit in a window, then refuses', () => {
  const l = createLimiter({ limit: 2, windowMs: 1000, now: clock() });
  expect(l.attempt('ip')).toEqual({ allowed: true, remaining: 1 });
  expect(l.attempt('ip')).toEqual({ allowed: true, remaining: 0 });
  expect(l.attempt('ip').allowed).toBe(false);
});

test('says when to retry, based on the oldest request', () => {
  const now = clock();
  const l = createLimiter({ limit: 2, windowMs: 1000, now });
  l.attempt('ip');
  now.advance(300);
  l.attempt('ip');
  now.advance(200);
  expect(l.attempt('ip')).toEqual({ allowed: false, retryAfter: 500 });
});

test('a request exactly one window old no longer counts', () => {
  const now = clock();
  const l = createLimiter({ limit: 1, windowMs: 1000, now });
  l.attempt('ip');
  now.advance(1000);
  expect(l.attempt('ip').allowed).toBe(true);
});

test('limiters and keys are independent', () => {
  const a = createLimiter({ limit: 1, windowMs: 1000, now: clock() });
  const b = createLimiter({ limit: 1, windowMs: 1000, now: clock() });
  a.attempt('ip');
  expect(a.attempt('other').allowed).toBe(true);
  expect(b.attempt('ip').allowed).toBe(true);
});
`,
    bugs: [
      bug(
        'limiter.js',
        't - ts < windowMs',
        't - ts <= windowMs',
        'OFF_BY_ONE',
        'Old requests linger one tick too long',
        'A request made exactly windowMs ago is outside the window. Keep only requests younger than that.',
      ),
      bug(
        'limiter.js',
        'if (recent.length >= limit) {',
        'if (recent.length > limit) {',
        'OFF_BY_ONE',
        'Allows one request too many',
        'With limit 2 and 2 recent requests, the third must be refused.',
      ),
      bug(
        'limiter.js',
        'function createLimiter({ limit, windowMs, now = () => Date.now() }) {\n  const hits = new Map();',
        'const hits = new Map();\nfunction createLimiter({ limit, windowMs, now = () => Date.now() }) {',
        'STATE',
        'All limiters share one memory',
        'Module-level state is shared by every limiter (and every test). Each limiter needs its own Map.',
      ),
      bug(
        'limiter.js',
        'const retryAfter = recent[0] + windowMs - t;',
        'const retryAfter = recent[recent.length - 1] + windowMs - t;',
        'LOGIC',
        'Retry time based on the newest request',
        'A slot frees up when the oldest request leaves the window, which is recent[0].',
      ),
      bug(
        'limiter.js',
        '    hits.set(key, fresh);\n',
        '',
        'STATE',
        'Requests are never remembered',
        'filter returns a new array. Unless it is stored, the push in attempt() goes to an array nobody keeps.',
      ),
    ],
  },
  {
    slug: 'undo-redo',
    title: 'Undo and redo',
    level: 'HARD',
    topic: 'An editor history with a size limit',
    brief:
      'set() records a new step (same value = no step) and clears redo. undo/redo walk the history in order and return false at the ends. Only the most recent `limit` steps are kept.',
    estimatedMinutes: 35,
    files: {
      'history.js': String.raw`function createHistory(initial, limit = 50) {
  let past = [];
  let present = initial;
  let future = [];

  return {
    get value() {
      return present;
    },
    set(next) {
      if (Object.is(next, present)) return;
      past = [...past, present].slice(-limit);
      present = next;
      future = [];
    },
    undo() {
      if (past.length === 0) return false;
      future = [present, ...future];
      present = past[past.length - 1];
      past = past.slice(0, -1);
      return true;
    },
    redo() {
      if (future.length === 0) return false;
      past = [...past, present];
      present = future[0];
      future = future.slice(1);
      return true;
    },
    canUndo: () => past.length > 0,
  };
}

module.exports = { createHistory };
`,
    },
    tests: String.raw`const { createHistory } = require('./history');

test('undo and redo step through values in order', () => {
  const h = createHistory('a');
  h.set('b');
  h.set('c');
  h.undo();
  expect(h.value).toBe('b');
  h.undo();
  expect(h.value).toBe('a');
  expect(h.undo()).toBe(false);
  h.redo();
  expect(h.value).toBe('b');
  h.redo();
  expect(h.value).toBe('c');
});

test('a new edit clears the redo stack', () => {
  const h = createHistory(1);
  h.set(2);
  h.undo();
  h.set(3);
  expect(h.redo()).toBe(false);
  expect(h.value).toBe(3);
});

test('setting the same value is not a new step', () => {
  const h = createHistory('x');
  h.set('x');
  expect(h.canUndo()).toBe(false);
});

test('keeps only the most recent steps', () => {
  const h = createHistory(0, 2);
  h.set(1);
  h.set(2);
  h.set(3);
  h.undo();
  h.undo();
  expect(h.value).toBe(1);
  expect(h.undo()).toBe(false);
});
`,
    bugs: [
      bug(
        'history.js',
        '      future = [];\n    },\n    undo()',
        '    },\n    undo()',
        'STATE',
        'Old redo steps survive a new edit',
        'After undoing and making a new change, the undone steps belong to an abandoned branch. Redo must be cleared.',
      ),
      bug(
        'history.js',
        '.slice(-limit)',
        '.slice(0, limit)',
        'ARRAY_METHODS',
        'Keeps the oldest steps instead of the newest',
        'slice(-n) takes the last n items; slice(0, n) the first n.',
      ),
      bug(
        'history.js',
        'present = past[past.length - 1];',
        'present = past[0];',
        'DATA_STRUCTURES',
        'Undo jumps to the very first state',
        'past is a stack: the most recent step is at the end.',
      ),
      bug(
        'history.js',
        'future = [present, ...future];',
        'future = [...future, present];',
        'DATA_STRUCTURES',
        'Redo replays in the wrong order',
        'Redo takes future[0], so the step undone last must go to the front.',
      ),
      bug(
        'history.js',
        '      if (Object.is(next, present)) return;\n',
        '',
        'LOGIC',
        'Setting the same value adds an undo step',
        'Undoing a step that changed nothing confuses users. Ignore no-op changes.',
      ),
    ],
  },
  {
    slug: 'schema-validator',
    title: 'Schema validator',
    level: 'HARD',
    topic: 'Recursive validation of JSON data',
    brief:
      'validate(schema, value) returns every problem with its path ($.tags[1]). It understands object (required + properties), array (items), number (min, including 0) and string (pattern), and knows that null and arrays are not objects.',
    estimatedMinutes: 40,
    files: {
      'schema.js': String.raw`function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function validate(schema, value, path = '$') {
  const errors = [];
  const actual = typeOf(value);
  if (schema.type && schema.type !== actual) {
    return [path + ': expected ' + schema.type + ', got ' + actual];
  }
  if (schema.type === 'object') {
    for (const key of schema.required || []) {
      if (!(key in value)) errors.push(path + '.' + key + ': is required');
    }
    for (const [key, sub] of Object.entries(schema.properties || {})) {
      if (key in value) errors.push(...validate(sub, value[key], path + '.' + key));
    }
  }
  if (schema.type === 'array' && schema.items) {
    value.forEach((item, i) => errors.push(...validate(schema.items, item, path + '[' + i + ']')));
  }
  if (schema.type === 'number' && schema.min !== undefined && value < schema.min) {
    errors.push(path + ': must be at least ' + schema.min);
  }
  if (schema.type === 'string' && schema.pattern && !new RegExp(schema.pattern).test(value)) {
    errors.push(path + ': does not match ' + schema.pattern);
  }
  return errors;
}

module.exports = { validate };
`,
    },
    tests: String.raw`const { validate } = require('./schema');

const user = {
  type: 'object',
  required: ['name', 'age'],
  properties: {
    name: { type: 'string', pattern: '^[A-Z]' },
    age: { type: 'number', min: 0 },
    tags: { type: 'array', items: { type: 'string' } },
  },
};

test('a valid value has no errors', () => {
  expect(validate(user, { name: 'Ada', age: 36, tags: ['math'] })).toEqual([]);
});

test('reports every problem, with its path', () => {
  expect(validate(user, { name: 'ada', age: -1, tags: ['ok', 3] })).toEqual([
    '$.name: does not match ^[A-Z]',
    '$.age: must be at least 0',
    '$.tags[1]: expected string, got number',
  ]);
});

test('null is not an object, and arrays are arrays', () => {
  expect(validate(user, null)).toEqual(['$: expected object, got null']);
  expect(validate({ type: 'array' }, [])).toEqual([]);
  expect(validate({ type: 'object' }, [])).toEqual(['$: expected object, got array']);
});

test('lists missing required fields', () => {
  expect(validate(user, { tags: [] })).toEqual(['$.name: is required', '$.age: is required']);
});
`,
    bugs: [
      bug(
        'schema.js',
        "  if (value === null) return 'null';\n",
        '',
        'NULL_UNDEFINED',
        'null passes as an object',
        'typeof null is "object", a famous JavaScript quirk. Without the check, null passes as an object and `key in null` throws.',
      ),
      bug(
        'schema.js',
        "  if (Array.isArray(value)) return 'array';\n",
        '',
        'DATA_STRUCTURES',
        'Arrays look like objects',
        'typeof [] is also "object". Array.isArray is the reliable test.',
      ),
      bug(
        'schema.js',
        "      if (key in value) errors.push(...validate(sub, value[key], path + '.' + key));",
        "      if (key in value) return validate(sub, value[key], path + '.' + key);",
        'RECURSION',
        'Stops at the first property',
        'Returning the child’s result ends the whole validation. Collect the child’s errors and keep going.',
      ),
      bug(
        'schema.js',
        'schema.min !== undefined && value < schema.min',
        'schema.min && value < schema.min',
        'TYPE_COERCION',
        'A minimum of 0 is ignored',
        'min: 0 is falsy, so the check is skipped. Test for undefined instead.',
      ),
    ],
  },
  {
    slug: 'calculator',
    title: 'Calculator',
    level: 'HARD',
    topic: 'A tokenizer and recursive-descent parser',
    brief:
      'evaluate() computes expressions with + - * / ( ), decimals and unary minus. * and / bind tighter than + and -, everything is left-to-right, and broken input (unclosed brackets, leftovers, division by zero) throws a clear error.',
    estimatedMinutes: 45,
    files: {
      'calc.js': String.raw`function tokenize(expr) {
  const src = expr.replace(/\s+/g, '');
  const tokens = src.match(/\d+(\.\d+)?|[-+*/()]/g) || [];
  if (tokens.join('') !== src) throw new Error('Unexpected character in ' + expr);
  return tokens;
}

function evaluate(expr) {
  const tokens = tokenize(expr);
  let pos = 0;

  function parseExpression() {
    let value = parseTerm();
    while (tokens[pos] === '+' || tokens[pos] === '-') {
      const op = tokens[pos++];
      const right = parseTerm();
      value = op === '+' ? value + right : value - right;
    }
    return value;
  }

  function parseTerm() {
    let value = parseFactor();
    while (tokens[pos] === '*' || tokens[pos] === '/') {
      const op = tokens[pos++];
      const right = parseFactor();
      if (op === '/' && right === 0) throw new Error('Division by zero');
      value = op === '*' ? value * right : value / right;
    }
    return value;
  }

  function parseFactor() {
    const token = tokens[pos++];
    if (token === '-') return -parseFactor();
    if (token === '(') {
      const value = parseExpression();
      if (tokens[pos++] !== ')') throw new Error('Missing )');
      return value;
    }
    const n = Number(token);
    if (token === undefined || Number.isNaN(n)) throw new Error('Unexpected ' + token);
    return n;
  }

  const result = parseExpression();
  if (pos < tokens.length) throw new Error('Unexpected ' + tokens[pos]);
  return result;
}

module.exports = { tokenize, evaluate };
`,
    },
    tests: String.raw`const { tokenize, evaluate } = require('./calc');

test('tokenizes numbers, including decimals', () => {
  expect(tokenize(' 12.5 * (3 + 4) ')).toEqual(['12.5', '*', '(', '3', '+', '4', ')']);
  expect(() => tokenize('2 $ 3')).toThrow('Unexpected character');
});

test('multiplication binds tighter than addition', () => {
  expect(evaluate('1 + 2 * 3')).toBe(7);
  expect(evaluate('(1 + 2) * 3')).toBe(9);
});

test('subtraction and division go left to right', () => {
  expect(evaluate('10 - 2 - 3')).toBe(5);
  expect(evaluate('100 / 10 / 2')).toBe(5);
});

test('supports negative numbers and decimals', () => {
  expect(evaluate('-3 + 1.5')).toBe(-1.5);
  expect(evaluate('2 * -(1 + 1)')).toBe(-4);
});

test('rejects broken expressions', () => {
  expect(() => evaluate('(1 + 2')).toThrow('Missing )');
  expect(() => evaluate('2)')).toThrow('Unexpected )');
  expect(() => evaluate('1 / 0')).toThrow('Division by zero');
});
`,
    bugs: [
      bug(
        'calc.js',
        String.raw`/\d+(\.\d+)?|[-+*/()]/g`,
        String.raw`/\d+|[-+*/()]/g`,
        'REGEX',
        'Decimals aren’t tokens',
        'Without the optional (\\.\\d+)? part, "12.5" can’t be matched as one number, so the tokens no longer add up to the input.',
      ),
      bug(
        'calc.js',
        "      const right = parseTerm();\n      value = op === '+'",
        "      const right = parseExpression();\n      value = op === '+'",
        'RECURSION',
        'Subtraction groups to the right',
        'Parsing the whole rest as one expression turns 10 - 2 - 3 into 10 - (2 - 3) = 11. The loop must read one term at a time so it stays left-to-right.',
      ),
      bug(
        'calc.js',
        "      if (tokens[pos++] !== ')') throw new Error('Missing )');",
        '      pos++;',
        'ERROR_HANDLING',
        'Unclosed brackets are accepted',
        'Skipping the token without checking it means "(1 + 2" evaluates instead of failing.',
      ),
      bug(
        'calc.js',
        "  if (pos < tokens.length) throw new Error('Unexpected ' + tokens[pos]);\n",
        '',
        'ERROR_HANDLING',
        'Leftover input is silently ignored',
        'A parser must consume all of its input. Anything left over means the expression was malformed.',
      ),
      bug(
        'calc.js',
        "if (token === '-') return -parseFactor();",
        "if (token === '-') return parseFactor();",
        'LOGIC',
        'Unary minus is dropped',
        'The minus sign has been read; it still has to negate the value that follows.',
      ),
    ],
  },
];
