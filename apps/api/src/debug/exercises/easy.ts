import { bug, type ExerciseDef } from '../exercise';

/** Easy: one small file, at least three bugs, each one a classic beginner slip. */
export const EASY: ExerciseDef[] = [
  {
    slug: 'cart-total',
    title: 'Shopping cart total',
    level: 'EASY',
    topic: 'Totals, discounts and free shipping for an online shop',
    brief:
      'The checkout adds up the cart, takes a percentage discount off and decides whether shipping is free (from 50 upwards). Customers report wrong totals and missing free shipping.',
    estimatedMinutes: 10,
    files: {
      'cart.js': String.raw`function cartTotal(items) {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total += items[i].price * items[i].qty;
  }
  return total;
}

function applyDiscount(total, percent) {
  if (percent <= 0) return total;
  return total - (total * percent) / 100;
}

function freeShipping(total) {
  return total >= 50;
}

module.exports = { cartTotal, applyDiscount, freeShipping };
`,
    },
    tests: String.raw`const { cartTotal, applyDiscount, freeShipping } = require('./cart');

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
    bugs: [
      bug(
        'cart.js',
        'i < items.length',
        'i <= items.length',
        'OFF_BY_ONE',
        'Loop runs one step too far',
        'Arrays are indexed from 0 to length - 1. With <= the loop reads items[items.length], which is undefined, so reading .price throws.',
      ),
      bug(
        'cart.js',
        'return total - (total * percent) / 100;',
        'return total - percent;',
        'MATH',
        'Subtracts the percent as money',
        'A 10% discount on 200 is 20, not 10. The percentage has to be turned into an amount first: total × percent / 100.',
      ),
      bug(
        'cart.js',
        'return total >= 50;',
        'return total > 50;',
        'COMPARISON',
        'Free shipping starts above 50, not at 50',
        '"From 50" includes 50 itself, so the check needs >=. Boundary values are where most comparison bugs hide.',
      ),
    ],
  },
  {
    slug: 'grade-report',
    title: 'Grade report',
    level: 'EASY',
    topic: 'Averages, letter grades and pass counts for a class',
    brief:
      'A teacher’s tool averages scores, turns a score into a letter (90+ A, 80+ B, 70+ C, else F) and counts how many students passed (70 or more).',
    estimatedMinutes: 10,
    files: {
      'grades.js': String.raw`function average(scores) {
  if (scores.length === 0) return 0;
  const sum = scores.reduce((acc, s) => acc + s, 0);
  return sum / scores.length;
}

function letter(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  return 'F';
}

function passed(scores) {
  return scores.filter((s) => s >= 70).length;
}

module.exports = { average, letter, passed };
`,
    },
    tests: String.raw`const { average, letter, passed } = require('./grades');

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
    bugs: [
      bug(
        'grades.js',
        'return sum / scores.length;',
        'return sum / (scores.length - 1);',
        'MATH',
        'Divides by the wrong count',
        'An average is the sum divided by how many values there are, so the divisor is scores.length.',
      ),
      bug(
        'grades.js',
        "if (score >= 80) return 'B';",
        "if (score > 80) return 'B';",
        'COMPARISON',
        'A score of exactly 80 gets a C',
        '"80 or more" is >= 80. With > the boundary score falls through to the next rule.',
      ),
      bug(
        'grades.js',
        'return scores.filter((s) => s >= 70).length;',
        'return scores.filter((s) => s >= 70);',
        'ARRAY_METHODS',
        'Returns the list instead of the count',
        'filter() returns a new array. The question was “how many”, which is that array’s length.',
      ),
    ],
  },
  {
    slug: 'temperature-converter',
    title: 'Temperature converter',
    level: 'EASY',
    topic: 'Celsius ↔ Fahrenheit and a weather label',
    brief:
      'A weather widget converts between Celsius and Fahrenheit and labels a temperature: 0 °C or below is freezing, under 20 cold, under 30 warm, otherwise hot.',
    estimatedMinutes: 10,
    files: {
      'temperature.js': String.raw`function toFahrenheit(c) {
  return (c * 9) / 5 + 32;
}

function toCelsius(f) {
  return ((f - 32) * 5) / 9;
}

function label(c) {
  if (c <= 0) return 'freezing';
  if (c < 20) return 'cold';
  if (c < 30) return 'warm';
  return 'hot';
}

module.exports = { toFahrenheit, toCelsius, label };
`,
    },
    tests: String.raw`const { toFahrenheit, toCelsius, label } = require('./temperature');

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
    bugs: [
      bug(
        'temperature.js',
        '(c * 9) / 5 + 32',
        '(c * 5) / 9 + 32',
        'MATH',
        'The ratio is upside down',
        'Fahrenheit degrees are smaller, so Celsius is multiplied by 9/5. Using 5/9 is the formula for the other direction.',
      ),
      bug(
        'temperature.js',
        '((f - 32) * 5) / 9',
        '(f - 32 * 5) / 9',
        'MATH',
        'Operator precedence',
        'Multiplication binds tighter than subtraction, so f - 32 * 5 means f - 160. Brackets make the subtraction happen first.',
      ),
      bug(
        'temperature.js',
        "if (c <= 0) return 'freezing';",
        "if (c < 0) return 'freezing';",
        'COMPARISON',
        '0 °C is not counted as freezing',
        'Water freezes at 0 °C, and the rule says “0 or below”, which is <= 0.',
      ),
    ],
  },
  {
    slug: 'text-helpers',
    title: 'Text helpers',
    level: 'EASY',
    topic: 'Capitalising words, title case and truncating text',
    brief:
      'A blog formats titles (“the quick fox” → “The Quick Fox”) and shortens long text to a maximum length with an ellipsis. Short text must stay untouched.',
    estimatedMinutes: 10,
    files: {
      'text.js': String.raw`function capitalize(word) {
  if (!word) return '';
  return word[0].toUpperCase() + word.slice(1).toLowerCase();
}

function titleCase(sentence) {
  return sentence.split(' ').map(capitalize).join(' ');
}

function truncate(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

module.exports = { capitalize, titleCase, truncate };
`,
    },
    tests: String.raw`const { capitalize, titleCase, truncate } = require('./text');

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
    bugs: [
      bug(
        'text.js',
        'word.slice(1).toLowerCase()',
        'word.slice(2).toLowerCase()',
        'OFF_BY_ONE',
        'Drops the second letter',
        'slice(1) means “from index 1 to the end”. The first letter is index 0, so slice(2) skips a character.',
      ),
      bug(
        'text.js',
        ".map(capitalize).join(' ')",
        ".map(capitalize).join('')",
        'STRINGS',
        'Words are glued together',
        'split(" ") removed the spaces, so join has to put them back with " ".',
      ),
      bug(
        'text.js',
        'if (text.length <= max) return text;',
        'if (text.length < max) return text;',
        'COMPARISON',
        'Text of exactly max length is cut',
        'A 5-character word fits in 5 characters. Only longer text should be truncated, so the check is <=.',
      ),
    ],
  },
  {
    slug: 'library-loans',
    title: 'Library loans',
    level: 'EASY',
    topic: 'Who can borrow which book',
    brief:
      'A member can borrow a book when the book exists, a copy is available and they are under their loan limit. Looking up a missing book must not crash the app.',
    estimatedMinutes: 10,
    files: {
      'library.js': String.raw`function findBook(books, isbn) {
  return books.find((b) => b.isbn === isbn) || null;
}

function canBorrow(member, book) {
  if (!book || !member) return false;
  if (book.available === 0) return false;
  return member.borrowed.length < member.limit;
}

module.exports = { findBook, canBorrow };
`,
    },
    tests: String.raw`const { findBook, canBorrow } = require('./library');

const books = [{ isbn: '111', available: 2 }, { isbn: '222', available: 0 }];
const member = { borrowed: ['333'], limit: 2 };

test('finds a book or returns null', () => {
  expect(findBook(books, '111').available).toBe(2);
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
    bugs: [
      bug(
        'library.js',
        'if (!book || !member) return false;',
        'if (!member) return false;',
        'NULL_UNDEFINED',
        'A missing book crashes the check',
        'findBook returns null when nothing matches. Reading null.available throws a TypeError, so guard against null first.',
      ),
      bug(
        'library.js',
        'book.available === 0',
        "book.available === '0'",
        'TYPE_COERCION',
        'Compares a number with a string',
        '=== never treats 0 and "0" as equal, so the “no copies left” rule never triggers.',
      ),
      bug(
        'library.js',
        'member.borrowed.length < member.limit',
        'member.borrowed.length <= member.limit',
        'OFF_BY_ONE',
        'One loan too many',
        'With a limit of 2 and 2 books already out, the member must be refused. Being “under the limit” means <.',
      ),
    ],
  },
  {
    slug: 'stock-counter',
    title: 'Stock counter',
    level: 'EASY',
    topic: 'Adding, removing and listing low stock',
    brief:
      'A small shop tracks stock per item. You can add stock (also for brand-new items), remove stock (all of it, but never more) and list items below a threshold.',
    estimatedMinutes: 10,
    files: {
      'inventory.js': String.raw`function addStock(stock, item, qty) {
  const current = stock[item] || 0;
  stock[item] = current + qty;
  return stock[item];
}

function removeStock(stock, item, qty) {
  const have = stock[item] || 0;
  if (qty > have) {
    throw new Error('Not enough ' + item);
  }
  stock[item] = have - qty;
  return stock[item];
}

function lowStock(stock, threshold) {
  return Object.keys(stock).filter((item) => stock[item] < threshold);
}

module.exports = { addStock, removeStock, lowStock };
`,
    },
    tests: String.raw`const { addStock, removeStock, lowStock } = require('./inventory');

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
    bugs: [
      bug(
        'inventory.js',
        'stock[item] = current + qty;',
        'stock[item] = stock[item] + qty;',
        'NULL_UNDEFINED',
        'New items become NaN',
        'For a new item stock[item] is undefined, and undefined + 5 is NaN. The code already computed a safe value in current.',
      ),
      bug(
        'inventory.js',
        'if (qty > have) {',
        'if (qty >= have) {',
        'COMPARISON',
        'Removing all stock throws',
        'Removing exactly what you have is allowed. Only asking for more than you have is an error.',
      ),
      bug(
        'inventory.js',
        'stock[item] < threshold',
        'stock[item] > threshold',
        'LOGIC',
        'Lists the well-stocked items',
        'Low stock means below the threshold. The comparison was flipped.',
      ),
    ],
  },
  {
    slug: 'password-rules',
    title: 'Password rules',
    level: 'EASY',
    topic: 'Checking password strength at sign-up',
    brief:
      'A sign-up form lists what is missing from a password: at least 8 characters, a number and an uppercase letter. isStrong is true only when nothing is missing.',
    estimatedMinutes: 10,
    files: {
      'password.js': String.raw`function checkPassword(pw) {
  const problems = [];
  if (pw.length < 8) problems.push('at least 8 characters');
  if (!/[0-9]/.test(pw)) problems.push('a number');
  if (!/[A-Z]/.test(pw)) problems.push('an uppercase letter');
  return problems;
}

function isStrong(pw) {
  return checkPassword(pw).length === 0;
}

module.exports = { checkPassword, isStrong };
`,
    },
    tests: String.raw`const { checkPassword, isStrong } = require('./password');

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
    bugs: [
      bug(
        'password.js',
        'pw.length < 8',
        'pw.length < 7',
        'OFF_BY_ONE',
        'Seven characters are accepted',
        'The rule is “at least 8”, so anything shorter than 8 is a problem: length < 8.',
      ),
      bug(
        'password.js',
        '/[A-Z]/.test(pw)',
        '/[a-z]/.test(pw)',
        'REGEX',
        'Checks for lowercase instead of uppercase',
        '[a-z] matches lowercase letters. The rule asks for an uppercase letter, [A-Z].',
      ),
      bug(
        'password.js',
        'return checkPassword(pw).length === 0;',
        'return checkPassword(pw).length > 0;',
        'LOGIC',
        'Strong means “has problems”',
        'A password is strong when the list of problems is empty.',
      ),
    ],
  },
  {
    slug: 'fizzbuzz',
    title: 'FizzBuzz',
    level: 'EASY',
    topic: 'The classic counting game',
    brief:
      'Multiples of 3 say "Fizz", multiples of 5 say "Buzz", multiples of both say "FizzBuzz", every other number is said as text. sequence(n) plays from 1 to n.',
    estimatedMinutes: 8,
    files: {
      'fizzbuzz.js': String.raw`function fizzBuzz(n) {
  if (n % 15 === 0) return 'FizzBuzz';
  if (n % 3 === 0) return 'Fizz';
  if (n % 5 === 0) return 'Buzz';
  return String(n);
}

function sequence(count) {
  const out = [];
  for (let n = 1; n <= count; n++) out.push(fizzBuzz(n));
  return out;
}

module.exports = { fizzBuzz, sequence };
`,
    },
    tests: String.raw`const { fizzBuzz, sequence } = require('./fizzbuzz');

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
    bugs: [
      bug(
        'fizzbuzz.js',
        "if (n % 15 === 0) return 'FizzBuzz';\n  if (n % 3 === 0) return 'Fizz';",
        "if (n % 3 === 0) return 'Fizz';\n  if (n % 15 === 0) return 'FizzBuzz';",
        'LOGIC',
        'Rules checked in the wrong order',
        'Every multiple of 15 is also a multiple of 3, so the general rule wins if it comes first. Check the most specific rule first.',
      ),
      bug(
        'fizzbuzz.js',
        'return String(n);',
        'return n;',
        'TYPE_COERCION',
        'Returns numbers, not text',
        'The function promises text. toBe("7") fails for the number 7 because === does not convert types.',
      ),
      bug(
        'fizzbuzz.js',
        'n <= count',
        'n < count',
        'OFF_BY_ONE',
        'Stops one number early',
        'Counting from 1 to n includes n, so the loop condition is n <= count.',
      ),
    ],
  },
  {
    slug: 'bill-splitter',
    title: 'Bill splitter',
    level: 'EASY',
    topic: 'Splitting a restaurant bill with a tip',
    brief:
      'Friends split a bill: add the tip percentage, divide by the number of people and round to cents. Amounts typed with a comma ("12,50") must work too. Zero people is an error.',
    estimatedMinutes: 10,
    files: {
      'bill.js': String.raw`function splitBill(total, people, tipPercent) {
  if (people < 1) throw new Error('At least one person');
  const withTip = total * (1 + tipPercent / 100);
  return Math.round((withTip / people) * 100) / 100;
}

function parseAmount(input) {
  return Number(input.replace(',', '.'));
}

module.exports = { splitBill, parseAmount };
`,
    },
    tests: String.raw`const { splitBill, parseAmount } = require('./bill');

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
    bugs: [
      bug(
        'bill.js',
        'total * (1 + tipPercent / 100)',
        'total + tipPercent / 100',
        'MATH',
        'Adds the tip as a tiny number',
        'A 10% tip on 100 is 10. Multiplying by (1 + 10/100) adds 10%; adding 0.1 adds ten cents.',
      ),
      bug(
        'bill.js',
        'Math.round((withTip / people) * 100) / 100',
        'Math.round(withTip / people)',
        'MATH',
        'Rounds to whole euros',
        'To round to cents, scale by 100, round, then scale back.',
      ),
      bug(
        'bill.js',
        'if (people < 1)',
        'if (people < 0)',
        'COMPARISON',
        'Zero people slips through',
        'Dividing by 0 gives Infinity in JavaScript (no error), so the guard must reject 0 as well.',
      ),
      bug(
        'bill.js',
        "return Number(input.replace(',', '.'));",
        "return parseInt(input.replace(',', '.'));",
        'TYPE_COERCION',
        'Drops the cents',
        'parseInt stops at the decimal point. Number (or parseFloat) keeps the fraction.',
      ),
    ],
  },
  {
    slug: 'word-stats',
    title: 'Word statistics',
    level: 'EASY',
    topic: 'Counting words and finding the most common one',
    brief:
      'An editor shows the word count (extra spaces don’t count as words) and the most common word, ignoring upper and lower case.',
    estimatedMinutes: 10,
    files: {
      'words.js': String.raw`function countWords(text) {
  const words = text.trim().split(/\s+/);
  return words[0] === '' ? 0 : words.length;
}

function mostCommon(text) {
  const counts = {};
  for (const w of text.toLowerCase().split(/\s+/)) {
    if (!w) continue;
    counts[w] = (counts[w] || 0) + 1;
  }
  let best = null;
  for (const w in counts) {
    if (best === null || counts[w] > counts[best]) best = w;
  }
  return best;
}

module.exports = { countWords, mostCommon };
`,
    },
    tests: String.raw`const { countWords, mostCommon } = require('./words');

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
    bugs: [
      bug(
        'words.js',
        'text.trim().split(/\\s+/)',
        "text.split(' ')",
        'STRINGS',
        'Extra spaces become words',
        'Splitting on a single space turns "  hello" into ["", "", "hello"]. Trim, then split on runs of whitespace (/\\s+/).',
      ),
      bug(
        'words.js',
        'counts[w] = (counts[w] || 0) + 1;',
        'counts[w] = counts[w] + 1;',
        'NULL_UNDEFINED',
        'Counts start as NaN',
        'The first time a word is seen, counts[w] is undefined, and undefined + 1 is NaN. Start from 0.',
      ),
      bug(
        'words.js',
        'text.toLowerCase().split',
        'text.split',
        'STRINGS',
        'Case-sensitive counting',
        '"The" and "the" are the same word for this feature, so normalise the case before counting.',
      ),
    ],
  },
  {
    slug: 'age-check',
    title: 'Age check',
    level: 'EASY',
    topic: 'Working out someone’s age from their birthday',
    brief:
      'A sign-up form works out a person’s age on a given day (birthday not reached yet means one year younger) and whether they are an adult (18 or older). Dates are UTC.',
    estimatedMinutes: 12,
    files: {
      'age.js': String.raw`function ageOn(birthIso, todayIso) {
  const birth = new Date(birthIso);
  const today = new Date(todayIso);
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < birth.getUTCMonth() ||
    (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age--;
  return age;
}

function isAdult(birthIso, todayIso) {
  return ageOn(birthIso, todayIso) >= 18;
}

module.exports = { ageOn, isAdult };
`,
    },
    tests: String.raw`const { ageOn, isAdult } = require('./age');

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
    bugs: [
      bug(
        'age.js',
        'today.getUTCDate() < birth.getUTCDate()',
        'today.getUTCDay() < birth.getUTCDay()',
        'DATES',
        'Compares weekdays, not days of the month',
        'getUTCDay() is the day of the week (0 = Sunday). The day of the month is getUTCDate(). The names are easy to mix up.',
      ),
      bug(
        'age.js',
        'if (beforeBirthday) age--;',
        'if (beforeBirthday) age++;',
        'LOGIC',
        'Adds a year instead of taking one off',
        'Before this year’s birthday, the person hasn’t reached the full year difference yet, so subtract one.',
      ),
      bug(
        'age.js',
        '>= 18',
        '> 18',
        'COMPARISON',
        'Adult only after turning 19',
        'You are an adult on your 18th birthday: 18 or older is >= 18.',
      ),
    ],
  },
  {
    slug: 'price-format',
    title: 'Price formatting',
    level: 'EASY',
    topic: 'Showing prices stored in cents',
    brief:
      'Prices are stored as whole cents and shown like "€1.05" or "-€2.50". Prices arriving from a form may be strings and must still add up as numbers.',
    estimatedMinutes: 10,
    files: {
      'money.js': String.raw`function formatPrice(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  return sign + '€' + euros + '.' + rest;
}

function sumPrices(prices) {
  return prices.reduce((sum, p) => sum + Number(p), 0);
}

module.exports = { formatPrice, sumPrices };
`,
    },
    tests: String.raw`const { formatPrice, sumPrices } = require('./money');

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
    bugs: [
      bug(
        'money.js',
        "String(abs % 100).padStart(2, '0')",
        'String(abs % 100)',
        'STRINGS',
        '5 cents shows as .5',
        '105 % 100 is 5, which prints as "5". padStart(2, "0") turns it into "05".',
      ),
      bug(
        'money.js',
        'Math.floor(abs / 100)',
        'Math.round(abs / 100)',
        'MATH',
        'Rounds the euros up',
        '199 cents is 1 euro and 99 cents. Rounding 1.99 gives 2, so whole euros need Math.floor.',
      ),
      bug(
        'money.js',
        'sum + Number(p)',
        'sum + p',
        'TYPE_COERCION',
        'Joins strings instead of adding',
        '0 + "100" is the string "0100": + concatenates as soon as one side is a string. Convert first.',
      ),
    ],
  },
  {
    slug: 'leaderboard',
    title: 'Leaderboard',
    level: 'EASY',
    topic: 'Top players, ranks and sorted names',
    brief:
      'A game shows the top N players by score (highest first), a player’s rank (1 = best, null when unknown) and an alphabetical list of names that ignores case, without changing the original list.',
    estimatedMinutes: 12,
    files: {
      'scores.js': String.raw`function topPlayers(players, n) {
  return [...players].sort((a, b) => b.score - a.score).slice(0, n);
}

function rankOf(players, name) {
  const sorted = topPlayers(players, players.length);
  const index = sorted.findIndex((p) => p.name === name);
  return index === -1 ? null : index + 1;
}

function sortNames(names) {
  return [...names].sort((a, b) => a.localeCompare(b));
}

module.exports = { topPlayers, rankOf, sortNames };
`,
    },
    tests: String.raw`const { topPlayers, rankOf, sortNames } = require('./scores');

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
    bugs: [
      bug(
        'scores.js',
        '.sort((a, b) => b.score - a.score)',
        '.sort((a, b) => a.score - b.score)',
        'SORTING',
        'Lowest scores first',
        'A comparator returning a - b sorts ascending. For “highest first” return b - a.',
      ),
      bug(
        'scores.js',
        'index === -1 ? null : index + 1',
        'index ? index + 1 : null',
        'TYPE_COERCION',
        'The winner has no rank',
        'findIndex returns 0 for the first player, and 0 is falsy. Compare with -1 (“not found”) instead of relying on truthiness.',
      ),
      bug(
        'scores.js',
        '[...names].sort((a, b) => a.localeCompare(b))',
        'names.sort()',
        'MUTATION',
        'Sorts the caller’s array, by character code',
        'sort() changes the array in place, and without a comparator it sorts by UTF-16 code, so "Carl" comes before "alice". Copy first and use localeCompare.',
      ),
    ],
  },
  {
    slug: 'coupon-codes',
    title: 'Coupon codes',
    level: 'EASY',
    topic: 'Redeeming discount codes at checkout',
    brief:
      'Customers type coupon codes (case and spaces shouldn’t matter), codes can expire, and a discount never makes a price negative.',
    estimatedMinutes: 10,
    files: {
      'coupon.js': String.raw`const CODES = { SAVE10: 10, SAVE20: 20 };

function codeValue(code) {
  const key = code.trim().toUpperCase();
  return CODES[key] || 0;
}

function isExpired(expiresIso, nowIso) {
  return new Date(nowIso).getTime() > new Date(expiresIso).getTime();
}

function finalPrice(price, code) {
  const value = codeValue(code);
  return Math.max(0, price - value);
}

module.exports = { codeValue, isExpired, finalPrice };
`,
    },
    tests: String.raw`const { codeValue, isExpired, finalPrice } = require('./coupon');

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
    bugs: [
      bug(
        'coupon.js',
        'code.trim().toUpperCase()',
        'code.toUpperCase()',
        'STRINGS',
        'Spaces break valid codes',
        'People paste codes with spaces around them. Trim before looking the code up.',
      ),
      bug(
        'coupon.js',
        '> new Date(expiresIso).getTime()',
        '> expiresIso',
        'TYPE_COERCION',
        'Compares a number with a date string',
        'A timestamp compared with "2026-01-01" turns the string into NaN, and every comparison with NaN is false.',
      ),
      bug(
        'coupon.js',
        'Math.max(0, price - value)',
        'Math.min(0, price - value)',
        'MATH',
        'min and max swapped',
        'Math.max(0, x) clamps x so it never drops below 0. Math.min(0, x) does the opposite.',
      ),
    ],
  },
  {
    slug: 'seat-map',
    title: 'Seat map',
    level: 'EASY',
    topic: 'Cinema seat labels and availability',
    brief:
      'A cinema labels seats A1, A2 … B1, B2 …, lists the free ones and highlights window seats (first and last in a row).',
    estimatedMinutes: 10,
    files: {
      'seats.js': String.raw`function makeSeats(rows, perRow) {
  const seats = [];
  for (let r = 0; r < rows; r++) {
    for (let s = 1; s <= perRow; s++) {
      seats.push(String.fromCharCode(65 + r) + s);
    }
  }
  return seats;
}

function freeSeats(all, taken) {
  return all.filter((seat) => !taken.includes(seat));
}

function isWindow(seat, perRow) {
  const n = Number(seat.slice(1));
  return n === 1 || n === perRow;
}

module.exports = { makeSeats, freeSeats, isWindow };
`,
    },
    tests: String.raw`const { makeSeats, freeSeats, isWindow } = require('./seats');

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
    bugs: [
      bug(
        'seats.js',
        'String.fromCharCode(65 + r)',
        'String.fromCharCode(64 + r)',
        'OFF_BY_ONE',
        'Rows start at "@"',
        'Character code 65 is "A". With r starting at 0, 64 + r gives "@" for the first row.',
      ),
      bug(
        'seats.js',
        '!taken.includes(seat)',
        'taken.includes(seat)',
        'LOGIC',
        'Lists the taken seats',
        'filter keeps what the callback returns true for. Free seats are the ones not in taken.',
      ),
      bug(
        'seats.js',
        'Number(seat.slice(1))',
        'Number(seat.slice(2))',
        'STRINGS',
        'Reads the seat number from the wrong position',
        'In "A1" the number starts at index 1. slice(2) returns "", and Number("") is 0.',
      ),
    ],
  },
  {
    slug: 'todo-list',
    title: 'Todo list',
    level: 'EASY',
    topic: 'Adding and ticking off todos immutably',
    brief:
      'A todo app adds items with a unique id (one more than the highest id), toggles them done and counts what’s left. The UI relies on functions returning new arrays and never changing old ones.',
    estimatedMinutes: 12,
    files: {
      'todos.js': String.raw`function addTodo(todos, title) {
  const id = todos.length ? Math.max(...todos.map((t) => t.id)) + 1 : 1;
  return [...todos, { id, title, done: false }];
}

function toggle(todos, id) {
  return todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
}

function remaining(todos) {
  return todos.filter((t) => !t.done).length;
}

module.exports = { addTodo, toggle, remaining };
`,
    },
    tests: String.raw`const { addTodo, toggle, remaining } = require('./todos');

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
  expect(remaining([{ id: 1, done: true }, { id: 2, done: true }, { id: 3, done: false }])).toBe(1);
});
`,
    bugs: [
      bug(
        'todos.js',
        'Math.max(...todos.map((t) => t.id)) + 1',
        'todos.length + 1',
        'LOGIC',
        'Ids clash after a deletion',
        'With todos 1 and 3 left, length + 1 is 3, which is taken. The next id must be above the highest existing one.',
      ),
      bug(
        'todos.js',
        '{ ...t, done: !t.done }',
        'Object.assign(t, { done: !t.done })',
        'MUTATION',
        'Toggling changes the old todo',
        'Object.assign(t, …) writes into the existing object, so “before” changes too. Spread into a new object instead.',
      ),
      bug(
        'todos.js',
        '!t.done).length',
        't.done).length',
        'LOGIC',
        'Counts finished todos',
        '“Remaining” means not done yet.',
      ),
    ],
  },
  {
    slug: 'contact-form',
    title: 'Contact form',
    level: 'EASY',
    topic: 'Validating emails, cleaning phone numbers, initials',
    brief:
      'A contact form checks that the whole input is an email, strips everything but digits and + from phone numbers, and shows a person’s initials (extra spaces in the name are fine).',
    estimatedMinutes: 12,
    files: {
      'contacts.js': String.raw`function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function normalizePhone(phone) {
  return phone.replace(/[^0-9+]/g, '');
}

function initials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase())
    .join('');
}

module.exports = { isEmail, normalizePhone, initials };
`,
    },
    tests: String.raw`const { isEmail, normalizePhone, initials } = require('./contacts');

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
    bugs: [
      bug(
        'contacts.js',
        String.raw`/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/`,
        String.raw`/[^\s@]+@[^\s@]+\.[^\s@]{2,}/`,
        'REGEX',
        'Matches an email anywhere in the text',
        'Without ^ and $, the pattern only has to match part of the input, so "not an email@x.com" passes because it contains "email@x.com".',
      ),
      bug(
        'contacts.js',
        '/[^0-9+]/g',
        '/[^0-9+]/',
        'REGEX',
        'Only the first character is removed',
        'Without the g flag, replace stops after the first match.',
      ),
      bug(
        'contacts.js',
        ".split(' ')\n    .filter(Boolean)\n",
        ".split(' ')\n",
        'NULL_UNDEFINED',
        'Double spaces crash it',
        'Splitting "ada  lovelace" on one space gives an empty string in the middle, and ""[0] is undefined, so .toUpperCase() throws. filter(Boolean) drops the empty parts.',
      ),
    ],
  },
  {
    slug: 'parking-fees',
    title: 'Parking fees',
    level: 'EASY',
    topic: 'Charging for parking by the hour',
    brief: 'Started hours count as full hours. The first hour is free, then 2 per hour, with a daily maximum of 20.',
    estimatedMinutes: 10,
    files: {
      'parking.js': String.raw`function hoursParked(startMinutes, endMinutes) {
  return Math.ceil((endMinutes - startMinutes) / 60);
}

function parkingFee(hours) {
  if (hours <= 1) return 0;
  const paid = hours - 1;
  return Math.min(paid * 2, 20);
}

module.exports = { hoursParked, parkingFee };
`,
    },
    tests: String.raw`const { hoursParked, parkingFee } = require('./parking');

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
    bugs: [
      bug(
        'parking.js',
        'Math.ceil(',
        'Math.floor(',
        'MATH',
        'Started hours are free',
        'Math.floor rounds 1.02 hours down to 1. “A started hour counts” means rounding up: Math.ceil.',
      ),
      bug(
        'parking.js',
        'const paid = hours - 1;',
        'const paid = hours;',
        'OFF_BY_ONE',
        'The free hour is charged',
        'Only the hours after the first are paid, so subtract the free one.',
      ),
      bug(
        'parking.js',
        'Math.min(paid * 2, 20)',
        'Math.max(paid * 2, 20)',
        'MATH',
        'The cap becomes a minimum',
        'A cap means “at most 20”: the smaller of the fee and 20, which is Math.min.',
      ),
    ],
  },
  {
    slug: 'array-utils',
    title: 'Array utilities',
    level: 'EASY',
    topic: 'chunk, unique and last',
    brief:
      'A tiny utility library splits arrays into chunks, removes duplicates and gets the last element. None of the functions may change the array they were given.',
    estimatedMinutes: 10,
    files: {
      'arrays.js': String.raw`function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function unique(items) {
  return [...new Set(items)];
}

function last(items) {
  return items[items.length - 1];
}

module.exports = { chunk, unique, last };
`,
    },
    tests: String.raw`const { chunk, unique, last } = require('./arrays');

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
    bugs: [
      bug(
        'arrays.js',
        'items.slice(i, i + size)',
        'items.splice(i, i + size)',
        'ARRAY_METHODS',
        'splice instead of slice',
        'slice copies a part of an array. splice removes elements from the original (and its second argument is a count, not an end index).',
      ),
      bug(
        'arrays.js',
        'return [...new Set(items)];',
        'return new Set(items);',
        'DATA_STRUCTURES',
        'Returns a Set, not an array',
        'A Set removes duplicates, but callers expect an array. Spread it back into one.',
      ),
      bug(
        'arrays.js',
        'items[items.length - 1]',
        'items[items.length]',
        'OFF_BY_ONE',
        'Reads past the end',
        'The last index is length - 1. items[length] is always undefined.',
      ),
    ],
  },
  {
    slug: 'star-ratings',
    title: 'Star ratings',
    level: 'EASY',
    topic: 'Averaging product reviews',
    brief:
      'Only ratings from 1 to 5 count. The average is rounded to one decimal, and no valid ratings means null (“no ratings yet”). stars() draws the rounded-down number of stars out of 5.',
    estimatedMinutes: 10,
    files: {
      'ratings.js': String.raw`function averageRating(ratings) {
  const valid = ratings.filter((r) => r >= 1 && r <= 5);
  if (valid.length === 0) return null;
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
  return Math.round(avg * 10) / 10;
}

function stars(avg) {
  const full = Math.floor(avg);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

module.exports = { averageRating, stars };
`,
    },
    tests: String.raw`const { averageRating, stars } = require('./ratings');

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
    bugs: [
      bug(
        'ratings.js',
        'r >= 1 && r <= 5',
        'r >= 1 || r <= 5',
        'LOGIC',
        '|| lets everything through',
        'Every number is either ≥ 1 or ≤ 5, so the filter keeps all of them. Both conditions must hold: &&.',
      ),
      bug(
        'ratings.js',
        'if (valid.length === 0) return null;',
        'if (valid.length === 0) return 0;',
        'NULL_UNDEFINED',
        'No ratings looks like terrible ratings',
        'A product without reviews isn’t rated 0. null tells the UI to show “no ratings yet”.',
      ),
      bug(
        'ratings.js',
        'Math.round(avg * 10) / 10',
        'Math.round(avg) / 10',
        'MATH',
        'Rounding in the wrong place',
        'To keep one decimal, scale up by 10 before rounding, then scale back down.',
      ),
    ],
  },
];
