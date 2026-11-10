import type { ExerciseDef } from '../exercise';
import { EASY } from './easy';

type Patch = [file: string, fixed: string, buggy: string];

/**
 * TypeScript versions of the Easy exercises. Same scenario, bugs and explanations as the
 * JavaScript original (patch i ↔ bug i), written as typed ES modules over several files.
 */
function ts(group: string, files: Record<string, string>, tests: string, patches: Patch[]): ExerciseDef {
  const js = EASY.find((e) => e.slug === group);
  if (!js || js.bugs.length !== patches.length) throw new Error(`TypeScript ${group}: bugs don't line up`);
  return {
    ...js,
    slug: `${group}-ts`,
    group,
    language: 'typescript',
    files,
    tests,
    bugs: js.bugs.map((b, i) => ({ ...b, file: patches[i][0], fixed: patches[i][1], buggy: patches[i][2] })),
  };
}

export const EASY_TS: ExerciseDef[] = [
  ts(
    'cart-total',
    {
      'cart.ts': String.raw`export interface CartItem {
  price: number;
  qty: number;
}

export function cartTotal(items: CartItem[]): number {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total += items[i].price * items[i].qty;
  }
  return total;
}

export function applyDiscount(total: number, percent: number): number {
  if (percent <= 0) return total;
  return total - (total * percent) / 100;
}
`,
      'shipping.ts': String.raw`export const FREE_SHIPPING_FROM = 50;

export function freeShipping(total: number): boolean {
  return total >= FREE_SHIPPING_FROM;
}
`,
    },
    String.raw`import { applyDiscount, cartTotal } from './cart';
import { freeShipping } from './shipping';

test('adds price times quantity for every item', () => {
  expect(cartTotal([{ price: 10, qty: 2 }, { price: 5, qty: 1 }])).toBe(25);
});

test('an empty cart costs nothing', () => {
  expect(cartTotal([])).toBe(0);
});

test('takes a percentage off', () => {
  expect(applyDiscount(200, 10)).toBe(180);
  expect(applyDiscount(80, 0)).toBe(80);
});

test('shipping is free from 50 exactly', () => {
  expect(freeShipping(50)).toBe(true);
  expect(freeShipping(49.99)).toBe(false);
});
`,
    [
      ['cart.ts', 'i < items.length', 'i <= items.length'],
      ['cart.ts', 'return total - (total * percent) / 100;', 'return total - percent;'],
      ['shipping.ts', 'return total >= FREE_SHIPPING_FROM;', 'return total > FREE_SHIPPING_FROM;'],
    ],
  ),
  ts(
    'grade-report',
    {
      'grades.ts': String.raw`export function average(scores: number[]): number {
  if (scores.length === 0) return 0;
  const sum = scores.reduce((acc, s) => acc + s, 0);
  return sum / scores.length;
}

export function passed(scores: number[]): number {
  return scores.filter((s) => s >= 70).length;
}
`,
      'letters.ts': String.raw`export type Letter = 'A' | 'B' | 'C' | 'F';

export function letter(score: number): Letter {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  return 'F';
}
`,
    },
    String.raw`import { average, passed } from './grades';
import { letter } from './letters';

test('averages the scores', () => {
  expect(average([80, 90, 100])).toBe(90);
  expect(average([])).toBe(0);
});

test('turns scores into letters, boundaries included', () => {
  expect(letter(95)).toBe('A');
  expect(letter(80)).toBe('B');
  expect(letter(70)).toBe('C');
  expect(letter(50)).toBe('F');
});

test('counts the students who passed', () => {
  expect(passed([50, 70, 90])).toBe(2);
});
`,
    [
      ['grades.ts', 'return sum / scores.length;', 'return sum / (scores.length - 1);'],
      ['letters.ts', "if (score >= 80) return 'B';", "if (score > 80) return 'B';"],
      ['grades.ts', 'return scores.filter((s) => s >= 70).length;', 'return scores.filter((s) => s >= 70) as never;'],
    ],
  ),
  ts(
    'temperature-converter',
    {
      'temperature.ts': String.raw`export function toFahrenheit(c: number): number {
  return (c * 9) / 5 + 32;
}

export function toCelsius(f: number): number {
  return ((f - 32) * 5) / 9;
}
`,
      'labels.ts': String.raw`export type Weather = 'freezing' | 'cold' | 'warm' | 'hot';

export function label(c: number): Weather {
  if (c <= 0) return 'freezing';
  if (c < 20) return 'cold';
  if (c < 30) return 'warm';
  return 'hot';
}
`,
    },
    String.raw`import { label } from './labels';
import { toCelsius, toFahrenheit } from './temperature';

test('converts Celsius to Fahrenheit', () => {
  expect(toFahrenheit(100)).toBe(212);
  expect(toFahrenheit(0)).toBe(32);
});

test('converts Fahrenheit to Celsius', () => {
  expect(toCelsius(212)).toBe(100);
  expect(toCelsius(32)).toBe(0);
});

test('labels temperatures', () => {
  expect(label(0)).toBe('freezing');
  expect(label(10)).toBe('cold');
  expect(label(25)).toBe('warm');
  expect(label(35)).toBe('hot');
});
`,
    [
      ['temperature.ts', '(c * 9) / 5 + 32', '(c * 5) / 9 + 32'],
      ['temperature.ts', '((f - 32) * 5) / 9', '(f - 32 * 5) / 9'],
      ['labels.ts', "if (c <= 0) return 'freezing';", "if (c < 0) return 'freezing';"],
    ],
  ),
  ts(
    'text-helpers',
    {
      'text.ts': String.raw`export function capitalize(word: string): string {
  if (!word) return '';
  return word[0].toUpperCase() + word.slice(1).toLowerCase();
}

export function titleCase(sentence: string): string {
  return sentence.split(' ').map(capitalize).join(' ');
}
`,
      'truncate.ts': String.raw`export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}
`,
    },
    String.raw`import { capitalize, titleCase } from './text';
import { truncate } from './truncate';

test('capitalizes one word', () => {
  expect(capitalize('hELLO')).toBe('Hello');
  expect(capitalize('')).toBe('');
});

test('title-cases a sentence', () => {
  expect(titleCase('the quick fox')).toBe('The Quick Fox');
});

test('truncates only when the text is too long', () => {
  expect(truncate('hello', 5)).toBe('hello');
  expect(truncate('hello world', 6)).toBe('hello…');
});
`,
    [
      ['text.ts', 'word.slice(1).toLowerCase()', 'word.slice(2).toLowerCase()'],
      ['text.ts', ".map(capitalize).join(' ')", ".map(capitalize).join('')"],
      ['truncate.ts', 'if (text.length <= max) return text;', 'if (text.length < max) return text;'],
    ],
  ),
  ts(
    'library-loans',
    {
      'library.ts': String.raw`export interface Book {
  isbn: string;
  available: number;
}

export interface Member {
  borrowed: string[];
  limit: number;
}

export function findBook(books: Book[], isbn: string): Book | null {
  return books.find((b) => b.isbn === isbn) || null;
}
`,
      'rules.ts': String.raw`import type { Book, Member } from './library';

export function canBorrow(member: Member | null, book: Book | null): boolean {
  if (!book || !member) return false;
  if (book.available === 0) return false;
  return member.borrowed.length < member.limit;
}
`,
    },
    String.raw`import { findBook } from './library';
import { canBorrow } from './rules';

const books = [{ isbn: '111', available: 2 }, { isbn: '222', available: 0 }];
const member = { borrowed: ['333'], limit: 2 };

test('finds a book or returns null', () => {
  expect(findBook(books, '111')?.available).toBe(2);
  expect(findBook(books, '999')).toBeNull();
});

test('can borrow when a copy is free and under the limit', () => {
  expect(canBorrow(member, books[0])).toBe(true);
});

test('cannot borrow without copies, at the limit, or a missing book', () => {
  expect(canBorrow(member, books[1])).toBe(false);
  expect(canBorrow({ borrowed: ['a', 'b'], limit: 2 }, books[0])).toBe(false);
  expect(canBorrow(member, null)).toBe(false);
});
`,
    [
      ['rules.ts', 'if (!book || !member) return false;', 'if (!member) return false;'],
      ['rules.ts', 'book.available === 0', "book.available === ('0' as never)"],
      ['rules.ts', 'member.borrowed.length < member.limit', 'member.borrowed.length <= member.limit'],
    ],
  ),
  ts(
    'stock-counter',
    {
      'inventory.ts': String.raw`export type Stock = Record<string, number>;

export function addStock(stock: Stock, item: string, qty: number): number {
  const current = stock[item] || 0;
  stock[item] = current + qty;
  return stock[item];
}

export function removeStock(stock: Stock, item: string, qty: number): number {
  const have = stock[item] || 0;
  if (qty > have) {
    throw new Error('Not enough ' + item);
  }
  stock[item] = have - qty;
  return stock[item];
}
`,
      'reports.ts': String.raw`import type { Stock } from './inventory';

export function lowStock(stock: Stock, threshold: number): string[] {
  return Object.keys(stock).filter((item) => stock[item] < threshold);
}
`,
    },
    String.raw`import { addStock, removeStock } from './inventory';
import { lowStock } from './reports';

test('adds stock, also for new items', () => {
  expect(addStock({}, 'pen', 5)).toBe(5);
  expect(addStock({ pen: 2 }, 'pen', 3)).toBe(5);
});

test('can remove everything, but not more', () => {
  expect(removeStock({ pen: 5 }, 'pen', 5)).toBe(0);
  expect(() => removeStock({ pen: 1 }, 'pen', 2)).toThrow('Not enough pen');
});

test('lists items below the threshold', () => {
  expect(lowStock({ a: 1, b: 10 }, 5)).toEqual(['a']);
});
`,
    [
      ['inventory.ts', 'stock[item] = current + qty;', 'stock[item] = stock[item] + qty;'],
      ['inventory.ts', 'if (qty > have) {', 'if (qty >= have) {'],
      ['reports.ts', 'stock[item] < threshold', 'stock[item] > threshold'],
    ],
  ),
  ts(
    'password-rules',
    {
      'rules.ts': String.raw`export function checkPassword(pw: string): string[] {
  const problems: string[] = [];
  if (pw.length < 8) problems.push('at least 8 characters');
  if (!/[0-9]/.test(pw)) problems.push('a number');
  if (!/[A-Z]/.test(pw)) problems.push('an uppercase letter');
  return problems;
}
`,
      'password.ts': String.raw`import { checkPassword } from './rules';

export function isStrong(pw: string): boolean {
  return checkPassword(pw).length === 0;
}
`,
    },
    String.raw`import { isStrong } from './password';
import { checkPassword } from './rules';

test('a good password has no problems', () => {
  expect(checkPassword('Abcdefg1')).toEqual([]);
  expect(isStrong('Abcdefg1')).toBe(true);
});

test('names each missing rule', () => {
  expect(checkPassword('Abcdef1')).toContain('at least 8 characters');
  expect(checkPassword('abcdefgh1')).toContain('an uppercase letter');
  expect(checkPassword('Abcdefgh')).toContain('a number');
});

test('a weak password is not strong', () => {
  expect(isStrong('abc')).toBe(false);
});
`,
    [
      ['rules.ts', 'pw.length < 8', 'pw.length < 7'],
      ['rules.ts', '/[A-Z]/.test(pw)', '/[a-z]/.test(pw)'],
      ['password.ts', 'return checkPassword(pw).length === 0;', 'return checkPassword(pw).length > 0;'],
    ],
  ),
  ts(
    'fizzbuzz',
    {
      'rules.ts': String.raw`export function fizzBuzz(n: number): string {
  if (n % 15 === 0) return 'FizzBuzz';
  if (n % 3 === 0) return 'Fizz';
  if (n % 5 === 0) return 'Buzz';
  return String(n);
}
`,
      'fizzbuzz.ts': String.raw`import { fizzBuzz } from './rules';

export function sequence(count: number): string[] {
  const out: string[] = [];
  for (let n = 1; n <= count; n++) out.push(fizzBuzz(n));
  return out;
}
`,
    },
    String.raw`import { sequence } from './fizzbuzz';
import { fizzBuzz } from './rules';

test('says the right word', () => {
  expect(fizzBuzz(15)).toBe('FizzBuzz');
  expect(fizzBuzz(9)).toBe('Fizz');
  expect(fizzBuzz(10)).toBe('Buzz');
  expect(fizzBuzz(7)).toBe('7');
});

test('plays from 1 to n', () => {
  expect(sequence(5)).toEqual(['1', '2', 'Fizz', '4', 'Buzz']);
});
`,
    [
      [
        'rules.ts',
        "if (n % 15 === 0) return 'FizzBuzz';\n  if (n % 3 === 0) return 'Fizz';",
        "if (n % 3 === 0) return 'Fizz';\n  if (n % 15 === 0) return 'FizzBuzz';",
      ],
      ['rules.ts', 'return String(n);', 'return n as never;'],
      ['fizzbuzz.ts', 'n <= count', 'n < count'],
    ],
  ),
  ts(
    'bill-splitter',
    {
      'bill.ts': String.raw`export function splitBill(total: number, people: number, tipPercent: number): number {
  if (people < 1) throw new Error('At least one person');
  const withTip = total * (1 + tipPercent / 100);
  return Math.round((withTip / people) * 100) / 100;
}
`,
      'parse.ts': String.raw`export function parseAmount(input: string): number {
  return Number(input.replace(',', '.'));
}
`,
    },
    String.raw`import { splitBill } from './bill';
import { parseAmount } from './parse';

test('adds the tip and splits evenly', () => {
  expect(splitBill(100, 4, 10)).toBe(27.5);
});

test('rounds to cents', () => {
  expect(splitBill(10, 3, 0)).toBe(3.33);
});

test('zero people is an error', () => {
  expect(() => splitBill(10, 0, 0)).toThrow('At least one person');
});

test('reads amounts written with a comma', () => {
  expect(parseAmount('12,50')).toBe(12.5);
});
`,
    [
      ['bill.ts', 'total * (1 + tipPercent / 100)', 'total + tipPercent / 100'],
      ['bill.ts', 'Math.round((withTip / people) * 100) / 100', 'Math.round(withTip / people)'],
      ['bill.ts', 'if (people < 1)', 'if (people < 0)'],
      ['parse.ts', "return Number(input.replace(',', '.'));", "return parseInt(input.replace(',', '.'));"],
    ],
  ),
  ts(
    'word-stats',
    {
      'words.ts': String.raw`export function countWords(text: string): number {
  const words = text.trim().split(/\s+/);
  return words[0] === '' ? 0 : words.length;
}
`,
      'frequency.ts': String.raw`export function mostCommon(text: string): string | null {
  const counts: Record<string, number> = {};
  for (const w of text.toLowerCase().split(/\s+/)) {
    if (!w) continue;
    counts[w] = (counts[w] || 0) + 1;
  }
  let best: string | null = null;
  for (const w in counts) {
    if (best === null || counts[w] > counts[best]) best = w;
  }
  return best;
}
`,
    },
    String.raw`import { mostCommon } from './frequency';
import { countWords } from './words';

test('counts words, ignoring extra spaces', () => {
  expect(countWords('  hello   world ')).toBe(2);
  expect(countWords('')).toBe(0);
});

test('finds the most common word', () => {
  expect(mostCommon('a b b')).toBe('b');
});

test('ignores case', () => {
  expect(mostCommon('The cat saw the dog and THE bird')).toBe('the');
});
`,
    [
      ['words.ts', String.raw`text.trim().split(/\s+/)`, "text.split(' ')"],
      ['frequency.ts', 'counts[w] = (counts[w] || 0) + 1;', 'counts[w] = counts[w] + 1;'],
      ['frequency.ts', 'text.toLowerCase().split', 'text.split'],
    ],
  ),
  ts(
    'age-check',
    {
      'age-math.ts': String.raw`export function ageOn(birthIso: string, todayIso: string): number {
  const birth = new Date(birthIso);
  const today = new Date(todayIso);
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < birth.getUTCMonth() ||
    (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age--;
  return age;
}
`,
      'age.ts': String.raw`import { ageOn } from './age-math';

export const ADULT_AGE = 18;

export function isAdult(birthIso: string, todayIso: string): boolean {
  return ageOn(birthIso, todayIso) >= ADULT_AGE;
}
`,
    },
    String.raw`import { isAdult } from './age';
import { ageOn } from './age-math';

test('is one year younger the day before the birthday', () => {
  expect(ageOn('2000-06-15', '2026-06-14')).toBe(25);
});

test('turns a year older on the birthday', () => {
  expect(ageOn('2000-06-15', '2026-06-15')).toBe(26);
  expect(ageOn('2000-06-15', '2026-12-01')).toBe(26);
});

test('is an adult from the 18th birthday', () => {
  expect(isAdult('2008-03-01', '2026-03-01')).toBe(true);
  expect(isAdult('2008-03-02', '2026-03-01')).toBe(false);
});
`,
    [
      ['age-math.ts', 'today.getUTCDate() < birth.getUTCDate()', 'today.getUTCDay() < birth.getUTCDay()'],
      ['age-math.ts', 'if (beforeBirthday) age--;', 'if (beforeBirthday) age++;'],
      ['age.ts', '>= ADULT_AGE', '> ADULT_AGE'],
    ],
  ),
  ts(
    'price-format',
    {
      'money.ts': String.raw`export function formatPrice(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  return sign + '€' + euros + '.' + rest;
}
`,
      'sum.ts': String.raw`export function sumPrices(prices: (string | number)[]): number {
  return prices.reduce<number>((sum, p) => sum + Number(p), 0);
}
`,
    },
    String.raw`import { formatPrice } from './money';
import { sumPrices } from './sum';

test('pads cents to two digits', () => {
  expect(formatPrice(105)).toBe('€1.05');
});

test('never rounds the euros up', () => {
  expect(formatPrice(199)).toBe('€1.99');
});

test('formats negative prices', () => {
  expect(formatPrice(-250)).toBe('-€2.50');
});

test('adds prices that arrive as strings', () => {
  expect(sumPrices(['100', '250', 50])).toBe(400);
});
`,
    [
      ['money.ts', "String(abs % 100).padStart(2, '0')", 'String(abs % 100)'],
      ['money.ts', 'Math.floor(abs / 100)', 'Math.round(abs / 100)'],
      ['sum.ts', 'sum + Number(p)', 'sum + (p as never)'],
    ],
  ),
  ts(
    'leaderboard',
    {
      'scores.ts': String.raw`export interface Player {
  name: string;
  score: number;
}

export function topPlayers(players: Player[], n: number): Player[] {
  return [...players].sort((a, b) => b.score - a.score).slice(0, n);
}

export function rankOf(players: Player[], name: string): number | null {
  const sorted = topPlayers(players, players.length);
  const index = sorted.findIndex((p) => p.name === name);
  return index === -1 ? null : index + 1;
}
`,
      'names.ts': String.raw`export function sortNames(names: string[]): string[] {
  return [...names].sort((a, b) => a.localeCompare(b));
}
`,
    },
    String.raw`import { sortNames } from './names';
import { rankOf, topPlayers } from './scores';

const players = [{ name: 'ana', score: 5 }, { name: 'ben', score: 9 }, { name: 'cy', score: 7 }];

test('shows the best players first', () => {
  expect(topPlayers(players, 2).map((p) => p.name)).toEqual(['ben', 'cy']);
});

test('ranks players from 1, and unknown players are null', () => {
  expect(rankOf(players, 'ben')).toBe(1);
  expect(rankOf(players, 'ana')).toBe(3);
  expect(rankOf(players, 'zed')).toBeNull();
});

test('sorts names alphabetically without changing the input', () => {
  const names = ['bob', 'alice', 'Carl'];
  expect(sortNames(names)).toEqual(['alice', 'bob', 'Carl']);
  expect(names).toEqual(['bob', 'alice', 'Carl']);
});
`,
    [
      ['scores.ts', '.sort((a, b) => b.score - a.score)', '.sort((a, b) => a.score - b.score)'],
      ['scores.ts', 'index === -1 ? null : index + 1', 'index ? index + 1 : null'],
      ['names.ts', '[...names].sort((a, b) => a.localeCompare(b))', 'names.sort()'],
    ],
  ),
  ts(
    'coupon-codes',
    {
      'coupon.ts': String.raw`const CODES: Record<string, number> = { SAVE10: 10, SAVE20: 20 };

export function codeValue(code: string): number {
  const key = code.trim().toUpperCase();
  return CODES[key] || 0;
}

export function finalPrice(price: number, code: string): number {
  const value = codeValue(code);
  return Math.max(0, price - value);
}
`,
      'dates.ts': String.raw`export function isExpired(expiresIso: string, nowIso: string): boolean {
  return new Date(nowIso).getTime() > new Date(expiresIso).getTime();
}
`,
    },
    String.raw`import { codeValue, finalPrice } from './coupon';
import { isExpired } from './dates';

test('codes ignore case and surrounding spaces', () => {
  expect(codeValue(' save10 ')).toBe(10);
  expect(codeValue('NOPE')).toBe(0);
});

test('knows when a code has expired', () => {
  expect(isExpired('2026-01-01', '2026-02-01')).toBe(true);
  expect(isExpired('2026-03-01', '2026-02-01')).toBe(false);
});

test('a discount never makes the price negative', () => {
  expect(finalPrice(50, 'SAVE20')).toBe(30);
  expect(finalPrice(5, 'SAVE20')).toBe(0);
});
`,
    [
      ['coupon.ts', 'code.trim().toUpperCase()', 'code.toUpperCase()'],
      ['dates.ts', '> new Date(expiresIso).getTime()', '> (expiresIso as never)'],
      ['coupon.ts', 'Math.max(0, price - value)', 'Math.min(0, price - value)'],
    ],
  ),
  ts(
    'seat-map',
    {
      'seats.ts': String.raw`export function makeSeats(rows: number, perRow: number): string[] {
  const seats: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let s = 1; s <= perRow; s++) {
      seats.push(String.fromCharCode(65 + r) + s);
    }
  }
  return seats;
}

export function freeSeats(all: string[], taken: string[]): string[] {
  return all.filter((seat) => !taken.includes(seat));
}
`,
      'windows.ts': String.raw`export function isWindow(seat: string, perRow: number): boolean {
  const n = Number(seat.slice(1));
  return n === 1 || n === perRow;
}
`,
    },
    String.raw`import { freeSeats, makeSeats } from './seats';
import { isWindow } from './windows';

test('labels rows A, B, C … and seats from 1', () => {
  expect(makeSeats(2, 2)).toEqual(['A1', 'A2', 'B1', 'B2']);
});

test('lists the free seats', () => {
  expect(freeSeats(['A1', 'A2', 'B1'], ['A2'])).toEqual(['A1', 'B1']);
});

test('knows the window seats', () => {
  expect(isWindow('A1', 4)).toBe(true);
  expect(isWindow('B4', 4)).toBe(true);
  expect(isWindow('B2', 4)).toBe(false);
});
`,
    [
      ['seats.ts', 'String.fromCharCode(65 + r)', 'String.fromCharCode(64 + r)'],
      ['seats.ts', '!taken.includes(seat)', 'taken.includes(seat)'],
      ['windows.ts', 'Number(seat.slice(1))', 'Number(seat.slice(2))'],
    ],
  ),
  ts(
    'todo-list',
    {
      'todos.ts': String.raw`export interface Todo {
  id: number;
  title: string;
  done: boolean;
}

export function addTodo(todos: Todo[], title: string): Todo[] {
  const id = todos.length ? Math.max(...todos.map((t) => t.id)) + 1 : 1;
  return [...todos, { id, title, done: false }];
}

export function toggle(todos: Todo[], id: number): Todo[] {
  return todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
}
`,
      'stats.ts': String.raw`import type { Todo } from './todos';

export function remaining(todos: Pick<Todo, 'done'>[]): number {
  return todos.filter((t) => !t.done).length;
}
`,
    },
    String.raw`import { remaining } from './stats';
import { addTodo, toggle } from './todos';

test('new ids are one above the highest, even after deletions', () => {
  const todos = addTodo([{ id: 1, title: 'a', done: false }, { id: 3, title: 'b', done: false }], 'c');
  expect(todos[2].id).toBe(4);
  expect(addTodo([], 'first')[0].id).toBe(1);
});

test('toggling returns new todos and leaves the old ones alone', () => {
  const before = [{ id: 1, title: 'a', done: false }];
  const after = toggle(before, 1);
  expect(after[0].done).toBe(true);
  expect(before[0].done).toBe(false);
  expect(toggle(after, 1)[0].done).toBe(false);
});

test('counts what is left to do', () => {
  expect(remaining([{ done: true }, { done: true }, { done: false }])).toBe(1);
});
`,
    [
      ['todos.ts', 'Math.max(...todos.map((t) => t.id)) + 1', 'todos.length + 1'],
      ['todos.ts', '{ ...t, done: !t.done }', 'Object.assign(t, { done: !t.done })'],
      ['stats.ts', '!t.done).length', 't.done).length'],
    ],
  ),
  ts(
    'contact-form',
    {
      'contacts.ts': String.raw`export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

export function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9+]/g, '');
}
`,
      'names.ts': String.raw`export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase())
    .join('');
}
`,
    },
    String.raw`import { isEmail, normalizePhone } from './contacts';
import { initials } from './names';

test('accepts real emails only', () => {
  expect(isEmail('ada@example.com')).toBe(true);
  expect(isEmail('not an email@x.com')).toBe(false);
  expect(isEmail('a@b.c')).toBe(false);
});

test('keeps only digits and the plus sign', () => {
  expect(normalizePhone('+49 (30) 123-45')).toBe('+493012345');
});

test('builds initials, ignoring extra spaces', () => {
  expect(initials('ada  lovelace')).toBe('AL');
});
`,
    [
      ['contacts.ts', String.raw`/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/`, String.raw`/[^\s@]+@[^\s@]+\.[^\s@]{2,}/`],
      ['contacts.ts', '/[^0-9+]/g', '/[^0-9+]/'],
      ['names.ts', ".split(' ')\n    .filter(Boolean)\n", ".split(' ')\n"],
    ],
  ),
  ts(
    'parking-fees',
    {
      'parking.ts': String.raw`export function hoursParked(startMinutes: number, endMinutes: number): number {
  return Math.ceil((endMinutes - startMinutes) / 60);
}
`,
      'fees.ts': String.raw`export const HOURLY_RATE = 2;
export const DAILY_CAP = 20;

export function parkingFee(hours: number): number {
  if (hours <= 1) return 0;
  const paid = hours - 1;
  return Math.min(paid * HOURLY_RATE, DAILY_CAP);
}
`,
    },
    String.raw`import { parkingFee } from './fees';
import { hoursParked } from './parking';

test('a started hour counts as a full hour', () => {
  expect(hoursParked(0, 61)).toBe(2);
  expect(hoursParked(0, 60)).toBe(1);
});

test('the first hour is free, then 2 per hour', () => {
  expect(parkingFee(1)).toBe(0);
  expect(parkingFee(3)).toBe(4);
});

test('never charges more than 20 a day', () => {
  expect(parkingFee(24)).toBe(20);
});
`,
    [
      ['parking.ts', 'Math.ceil(', 'Math.floor('],
      ['fees.ts', 'const paid = hours - 1;', 'const paid = hours;'],
      ['fees.ts', 'Math.min(paid * HOURLY_RATE, DAILY_CAP)', 'Math.max(paid * HOURLY_RATE, DAILY_CAP)'],
    ],
  ),
  ts(
    'array-utils',
    {
      'arrays.ts': String.raw`export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
`,
      'more.ts': String.raw`export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function last<T>(items: T[]): T | undefined {
  return items[items.length - 1];
}
`,
    },
    String.raw`import { chunk } from './arrays';
import { last, unique } from './more';

test('splits into chunks and leaves the input alone', () => {
  const items = [1, 2, 3, 4, 5];
  expect(chunk(items, 2)).toEqual([[1, 2], [3, 4], [5]]);
  expect(items).toEqual([1, 2, 3, 4, 5]);
});

test('removes duplicates and returns an array', () => {
  expect(unique([1, 1, 2])).toEqual([1, 2]);
});

test('returns the last element', () => {
  expect(last([1, 2, 3])).toBe(3);
});
`,
    [
      ['arrays.ts', 'items.slice(i, i + size)', 'items.splice(i, i + size)'],
      ['more.ts', 'return [...new Set(items)];', 'return new Set(items) as never;'],
      ['more.ts', 'items[items.length - 1]', 'items[items.length]'],
    ],
  ),
  ts(
    'star-ratings',
    {
      'ratings.ts': String.raw`export function averageRating(ratings: number[]): number | null {
  const valid = ratings.filter((r) => r >= 1 && r <= 5);
  if (valid.length === 0) return null;
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
  return Math.round(avg * 10) / 10;
}
`,
      'stars.ts': String.raw`export function stars(avg: number): string {
  const full = Math.floor(avg);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}
`,
    },
    String.raw`import { averageRating } from './ratings';
import { stars } from './stars';

test('ignores ratings outside 1 to 5', () => {
  expect(averageRating([5, 4, 10, 0])).toBe(4.5);
});

test('no ratings means null, not zero', () => {
  expect(averageRating([])).toBeNull();
});

test('rounds to one decimal', () => {
  expect(averageRating([4, 4, 5])).toBe(4.3);
});

test('draws stars', () => {
  expect(stars(3.7)).toBe('★★★☆☆');
});
`,
    [
      ['ratings.ts', 'r >= 1 && r <= 5', 'r >= 1 || r <= 5'],
      ['ratings.ts', 'if (valid.length === 0) return null;', 'if (valid.length === 0) return 0;'],
      ['ratings.ts', 'Math.round(avg * 10) / 10', 'Math.round(avg) / 10'],
    ],
  ),
];
