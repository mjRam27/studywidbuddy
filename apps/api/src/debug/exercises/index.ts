import { type ExerciseDef, moveToFile, withFiles } from '../exercise';
import { EASY } from './easy';
import { EASY_PY } from './easy-py';
import { EASY_TS } from './easy-ts';
import { HARD } from './hard';
import { INTERMEDIATE } from './intermediate';

/**
 * JavaScript exercises are written compactly, one module each; this layout spreads them over
 * several files the way real projects are (from-file, new file, what moves there).
 */
const SPLITS: Record<string, [from: string, to: string, names: string[]]> = {
  'cart-total': ['cart.js', 'shipping.js', ['freeShipping']],
  'grade-report': ['grades.js', 'letters.js', ['letter']],
  'temperature-converter': ['temperature.js', 'labels.js', ['label']],
  'text-helpers': ['text.js', 'truncate.js', ['truncate']],
  'library-loans': ['library.js', 'rules.js', ['canBorrow']],
  'stock-counter': ['inventory.js', 'reports.js', ['lowStock']],
  'password-rules': ['password.js', 'rules.js', ['checkPassword']],
  fizzbuzz: ['fizzbuzz.js', 'rules.js', ['fizzBuzz']],
  'bill-splitter': ['bill.js', 'parse.js', ['parseAmount']],
  'word-stats': ['words.js', 'frequency.js', ['mostCommon']],
  'age-check': ['age.js', 'age-math.js', ['ageOn']],
  'price-format': ['money.js', 'sum.js', ['sumPrices']],
  leaderboard: ['scores.js', 'names.js', ['sortNames']],
  'coupon-codes': ['coupon.js', 'dates.js', ['isExpired']],
  'seat-map': ['seats.js', 'windows.js', ['isWindow']],
  'todo-list': ['todos.js', 'stats.js', ['remaining']],
  'contact-form': ['contacts.js', 'names.js', ['initials']],
  'parking-fees': ['parking.js', 'fees.js', ['parkingFee']],
  'array-utils': ['arrays.js', 'more.js', ['unique', 'last']],
  'star-ratings': ['ratings.js', 'stars.js', ['stars']],
  'room-booking': ['booking.js', 'overlap.js', ['overlaps']],
  'slugs-and-wrapping': ['slug.js', 'wrap.js', ['wordWrap']],
  'memoize-and-closures': ['memo.js', 'closures.js', ['createCounter', 'makeMultipliers']],
  'signup-validation': ['validate.js', 'errors.js', ['ValidationError']],
  'game-of-life': ['grid.js', 'grid-io.js', ['createGrid', 'render']],
  'cart-reducer': ['cart-state.js', 'selectors.js', ['itemCount']],
  'search-and-median': ['search.js', 'sorted.js', ['binarySearch', 'insertSorted']],
  'query-strings': ['query.js', 'parse.js', ['parseQuery']],
  pagination: ['paginate.js', 'page-numbers.js', ['pageNumbers']],
  'settings-merge': ['settings.js', 'merge.js', ['isPlainObject', 'deepMerge']],
  'meeting-slots': ['schedule.js', 'time.js', ['toMinutes', 'toTime']],
  'access-control': ['roles.js', 'permissions.js', ['ROLES', 'can']],
  'lru-cache': ['lru.js', 'cached.js', ['cached']],
  'promise-pool': ['pool.js', 'settle.js', ['settleAll']],
  'debounce-throttle': ['timing.js', 'throttle.js', ['throttle']],
  'file-tree': ['tree.js', 'walk.js', ['findPath', 'flatten']],
  'route-finder': ['graph.js', 'build.js', ['buildGraph']],
  'safe-templates': ['template.js', 'escape.js', ['ESCAPES', 'escapeHtml']],
  'list-diff': ['diff.js', 'apply.js', ['applyDiff']],
  'schema-validator': ['schema.js', 'types.js', ['typeOf']],
  calculator: ['calc.js', 'tokenize.js', ['tokenize']],
};

/** One-piece modules get a runnable demo instead (try `node demo.js` in the terminal). */
const DEMOS: Record<string, Record<string, string>> = {
  'event-emitter': {
    'demo.js': String.raw`const { createEmitter } = require('./emitter');

const chat = createEmitter();
const stop = chat.on('message', (from, text) => console.log(from + ': ' + text));
chat.once('message', () => console.log('(first message received)'));

chat.emit('message', 'ana', 'hi!');
chat.emit('message', 'ben', 'hello');
stop();
console.log('listeners called after stop:', chat.emit('message', 'ana', 'anyone?'));
`,
  },
  'inventory-class': {
    'demo.js': String.raw`const { Inventory } = require('./inventory');

const shop = new Inventory().add('apple', 3).addAll([['pear', 2], ['kiwi', 5]]);
shop.remove('kiwi', 5);
console.log('in stock:', shop.names());
console.log('snapshot:', shop.snapshot());
`,
  },
  'rate-limiter': {
    'demo.js': String.raw`const { createLimiter } = require('./limiter');

let now = 0;
const limiter = createLimiter({ limit: 2, windowMs: 1000, now: () => now });
for (const t of [0, 100, 200, 1000, 1100]) {
  now = t;
  console.log('t=' + t, limiter.attempt('ip-1'));
}
`,
  },
  'undo-redo': {
    'demo.js': String.raw`const { createHistory } = require('./history');

const doc = createHistory('');
doc.set('H');
doc.set('He');
doc.set('Hel');
doc.undo();
doc.undo();
console.log('after two undos:', JSON.stringify(doc.value));
doc.redo();
console.log('after redo:', JSON.stringify(doc.value));
`,
  },
};

function layout(ex: ExerciseDef): ExerciseDef {
  const split = SPLITS[ex.slug];
  const moved = split ? moveToFile(ex, ...split) : ex;
  return DEMOS[ex.slug] ? withFiles(moved, DEMOS[ex.slug]) : moved;
}

/** Every Debug exercise, in display order. Content lives in code, reviewed like code. */
export const CATALOGUE: ExerciseDef[] = [...EASY, ...EASY_TS, ...EASY_PY, ...INTERMEDIATE, ...HARD].map(layout);
