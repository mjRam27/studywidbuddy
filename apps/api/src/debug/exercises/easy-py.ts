import { bug, type BugDef, type ExerciseDef } from '../exercise';
import { EASY } from './easy';

/**
 * Python versions of the Easy exercises: the same scenario as the JavaScript original, with
 * bugs Python programmers actually make (integer division, a missing f-string, a return
 * indented into a loop, sort() changing the caller's list …). Tests use the built-in
 * `testing` helper: @test("name") and expect(x).to_be(y).
 */
function py(group: string, files: Record<string, string>, tests: string, bugs: BugDef[]): ExerciseDef {
  const js = EASY.find((e) => e.slug === group);
  if (!js) throw new Error(`Python ${group}: no JavaScript original`);
  return { ...js, slug: `${group}-py`, group, language: 'python', files, tests, bugs };
}

export const EASY_PY: ExerciseDef[] = [
  py(
    'cart-total',
    {
      'cart.py': String.raw`def cart_total(items):
    total = 0
    for i in range(len(items)):
        total += items[i]["price"] * items[i]["qty"]
    return total


def apply_discount(total, percent):
    if percent <= 0:
        return total
    return total - total * percent / 100
`,
      'shipping.py': String.raw`FREE_SHIPPING_FROM = 50


def free_shipping(total):
    return total >= FREE_SHIPPING_FROM
`,
    },
    String.raw`from testing import test, expect
from cart import cart_total, apply_discount
from shipping import free_shipping


@test("adds price times quantity for every item")
def _():
    expect(cart_total([{"price": 10, "qty": 2}, {"price": 5, "qty": 1}])).to_be(25)


@test("an empty cart costs nothing")
def _():
    expect(cart_total([])).to_be(0)


@test("takes a percentage off")
def _():
    expect(apply_discount(200, 10)).to_be(180.0)
    expect(apply_discount(80, 0)).to_be(80)


@test("shipping is free from 50 exactly")
def _():
    expect(free_shipping(50)).to_be(True)
    expect(free_shipping(49.99)).to_be(False)
`,
    [
      bug(
        'cart.py',
        'range(len(items))',
        'range(len(items) + 1)',
        'OFF_BY_ONE',
        'The loop goes one index too far',
        'range(n) already stops before n, which is exactly the valid indexes 0 … n-1. range(n + 1) reaches items[n] and raises IndexError. Even better: loop over the items directly.',
      ),
      bug(
        'cart.py',
        'return total - total * percent / 100',
        'return total - percent',
        'MATH',
        'Subtracts the percent as money',
        'A 10% discount on 200 is 20, not 10. Turn the percentage into an amount first: total * percent / 100.',
      ),
      bug(
        'shipping.py',
        'return total >= FREE_SHIPPING_FROM',
        'return total > FREE_SHIPPING_FROM',
        'COMPARISON',
        'Free shipping starts above 50, not at 50',
        '"From 50" includes 50 itself, so the check needs >=.',
      ),
    ],
  ),
  py(
    'grade-report',
    {
      'grades.py': String.raw`def average(scores):
    if not scores:
        return 0
    return sum(scores) / len(scores)


def passed_count(scores):
    return len([s for s in scores if s >= 70])
`,
      'letters.py': String.raw`def letter(score):
    if score >= 90:
        return "A"
    if score >= 80:
        return "B"
    if score >= 70:
        return "C"
    return "F"
`,
    },
    String.raw`from testing import test, expect
from grades import average, passed_count
from letters import letter


@test("averages the scores, keeping the decimals")
def _():
    expect(average([80, 90, 100])).to_be(90.0)
    expect(average([80, 85])).to_be(82.5)


@test("an empty class averages 0")
def _():
    expect(average([])).to_be(0)


@test("turns scores into letters, boundaries included")
def _():
    expect(letter(95)).to_be("A")
    expect(letter(80)).to_be("B")
    expect(letter(70)).to_be("C")
    expect(letter(50)).to_be("F")


@test("counts the students who passed")
def _():
    expect(passed_count([50, 70, 90])).to_be(2)
`,
    [
      bug(
        'grades.py',
        'return sum(scores) / len(scores)',
        'return sum(scores) // len(scores)',
        'MATH',
        'Integer division drops the decimals',
        '// is floor division in Python: 165 // 2 is 82, not 82.5. Use / for a true average.',
      ),
      bug(
        'grades.py',
        '    if not scores:\n        return 0\n',
        '',
        'ERROR_HANDLING',
        'An empty class crashes',
        'len([]) is 0, and dividing by zero raises ZeroDivisionError. Handle the empty list first.',
      ),
      bug(
        'letters.py',
        'if score >= 80:',
        'if score > 80:',
        'COMPARISON',
        'A score of exactly 80 gets a C',
        '"80 or more" is >= 80. With > the boundary score falls through to the next rule.',
      ),
      bug(
        'grades.py',
        'return len([s for s in scores if s >= 70])',
        'return [s for s in scores if s >= 70]',
        'ARRAY_METHODS',
        'Returns the list instead of the count',
        'The list comprehension builds the passing scores; the question was how many, which is its len().',
      ),
    ],
  ),
  py(
    'temperature-converter',
    {
      'temperature.py': String.raw`def to_fahrenheit(c):
    return c * 9 / 5 + 32


def to_celsius(f):
    return (f - 32) * 5 / 9
`,
      'labels.py': String.raw`def label(c):
    if c <= 0:
        return "freezing"
    elif c < 20:
        return "cold"
    elif c < 30:
        return "warm"
    return "hot"
`,
    },
    String.raw`from testing import test, expect
from temperature import to_fahrenheit, to_celsius
from labels import label


@test("converts Celsius to Fahrenheit")
def _():
    expect(to_fahrenheit(100)).to_be(212.0)
    expect(to_fahrenheit(0)).to_be(32.0)


@test("converts Fahrenheit to Celsius")
def _():
    expect(to_celsius(212)).to_be(100.0)
    expect(to_celsius(32)).to_be(0.0)


@test("labels temperatures")
def _():
    expect(label(0)).to_be("freezing")
    expect(label(10)).to_be("cold")
    expect(label(25)).to_be("warm")
    expect(label(35)).to_be("hot")
`,
    [
      bug(
        'temperature.py',
        'return c * 9 / 5 + 32',
        'return c * 5 / 9 + 32',
        'MATH',
        'The ratio is upside down',
        'Fahrenheit degrees are smaller, so Celsius is multiplied by 9/5. 5/9 is the formula for the other direction.',
      ),
      bug(
        'temperature.py',
        'return (f - 32) * 5 / 9',
        'return f - 32 * 5 / 9',
        'MATH',
        'Operator precedence',
        'Multiplication binds tighter than subtraction, so f - 32 * 5 / 9 subtracts about 17.8 from f. Brackets make the subtraction happen first.',
      ),
      bug(
        'labels.py',
        'if c <= 0:',
        'if c < 0:',
        'COMPARISON',
        '0 °C is not counted as freezing',
        'The rule says "0 or below", which is <= 0.',
      ),
    ],
  ),
  py(
    'text-helpers',
    {
      'text.py': String.raw`def capitalize(word):
    if not word:
        return ""
    return word[0].upper() + word[1:].lower()


def title_case(sentence):
    return " ".join(capitalize(w) for w in sentence.split(" "))
`,
      'truncate.py': String.raw`def truncate(text, max_len):
    if len(text) <= max_len:
        return text
    return text[: max_len - 1] + "…"
`,
    },
    String.raw`from testing import test, expect
from text import capitalize, title_case
from truncate import truncate


@test("capitalizes one word")
def _():
    expect(capitalize("hELLO")).to_be("Hello")
    expect(capitalize("")).to_be("")


@test("title-cases a sentence")
def _():
    expect(title_case("the quick fox")).to_be("The Quick Fox")


@test("truncates only when the text is too long")
def _():
    expect(truncate("hello", 5)).to_be("hello")
    expect(truncate("hello world", 6)).to_be("hello…")
`,
    [
      bug(
        'text.py',
        'word[1:].lower()',
        'word[2:].lower()',
        'OFF_BY_ONE',
        'Drops the second letter',
        'word[1:] means "from index 1 to the end". The first letter is index 0, so word[2:] skips one.',
      ),
      bug(
        'text.py',
        'word[0].upper()',
        'word[0].upper',
        'LOGIC',
        'The method is never called',
        'word[0].upper without brackets is the method itself, not its result, so adding it to a string raises TypeError. Call it: upper().',
      ),
      bug(
        'text.py',
        'return " ".join(',
        'return "".join(',
        'STRINGS',
        'Words are glued together',
        'split(" ") removed the spaces, so join has to put them back with " ".',
      ),
      bug(
        'truncate.py',
        'if len(text) <= max_len:',
        'if len(text) < max_len:',
        'COMPARISON',
        'Text of exactly max_len is cut',
        'A 5-character word fits in 5 characters. Only longer text should be truncated.',
      ),
    ],
  ),
  py(
    'library-loans',
    {
      'library.py': String.raw`def find_book(books, isbn):
    for book in books:
        if book["isbn"] == isbn:
            return book
    return None
`,
      'rules.py': String.raw`def can_borrow(member, book):
    if book is None or member is None:
        return False
    if book["available"] == 0:
        return False
    return len(member["borrowed"]) < member["limit"]
`,
    },
    String.raw`from testing import test, expect
from library import find_book
from rules import can_borrow

books = [{"isbn": "111", "available": 2}, {"isbn": "222", "available": 0}]
member = {"borrowed": ["333"], "limit": 2}


@test("finds any book, or None")
def _():
    expect(find_book(books, "222")["available"]).to_be(0)
    expect(find_book(books, "999")).to_be_none()


@test("can borrow when a copy is free and under the limit")
def _():
    expect(can_borrow(member, books[0])).to_be(True)


@test("cannot borrow without copies, at the limit, or a missing book")
def _():
    expect(can_borrow(member, books[1])).to_be(False)
    expect(can_borrow({"borrowed": ["a", "b"], "limit": 2}, books[0])).to_be(False)
    expect(can_borrow(member, None)).to_be(False)
`,
    [
      bug(
        'library.py',
        '            return book\n    return None',
        '            return book\n        return None',
        'LOGIC',
        'Gives up after the first book',
        'Indented into the loop, return None runs as soon as the first book doesn’t match. In Python, indentation is the logic: "not found" belongs after the loop.',
      ),
      bug(
        'rules.py',
        'if book is None or member is None:',
        'if member is None:',
        'NULL_UNDEFINED',
        'A missing book crashes the check',
        'find_book returns None when nothing matches, and None["available"] raises TypeError. Check for None first.',
      ),
      bug(
        'rules.py',
        'if book["available"] == 0:',
        'if book["available"] == "0":',
        'TYPE_COERCION',
        'Compares a number with a string',
        'In Python 0 == "0" is False, so the "no copies left" rule never triggers.',
      ),
      bug(
        'rules.py',
        '< member["limit"]',
        '<= member["limit"]',
        'OFF_BY_ONE',
        'One loan too many',
        'With a limit of 2 and 2 books out, the member must be refused. "Under the limit" means <.',
      ),
    ],
  ),
  py(
    'stock-counter',
    {
      'inventory.py': String.raw`def add_stock(stock, item, qty):
    stock[item] = stock.get(item, 0) + qty
    return stock[item]


def remove_stock(stock, item, qty):
    have = stock.get(item, 0)
    if qty > have:
        raise ValueError(f"Not enough {item}")
    stock[item] = have - qty
    return stock[item]
`,
      'reports.py': String.raw`def low_stock(stock, threshold):
    return [item for item, qty in stock.items() if qty < threshold]
`,
    },
    String.raw`from testing import test, expect
from inventory import add_stock, remove_stock
from reports import low_stock


@test("adds stock, also for new items")
def _():
    expect(add_stock({}, "pen", 5)).to_be(5)
    expect(add_stock({"pen": 2}, "pen", 3)).to_be(5)


@test("can remove everything, but not more")
def _():
    expect(remove_stock({"pen": 5}, "pen", 5)).to_be(0)
    expect(lambda: remove_stock({"pen": 1}, "pen", 2)).to_raise(ValueError, "Not enough pen")


@test("lists items below the threshold")
def _():
    expect(low_stock({"a": 1, "b": 10}, 5)).to_equal(["a"])
`,
    [
      bug(
        'inventory.py',
        'stock.get(item, 0) + qty',
        'stock[item] + qty',
        'NULL_UNDEFINED',
        'New items raise KeyError',
        'stock[item] fails for a key that isn’t there yet. dict.get(item, 0) gives a default instead.',
      ),
      bug(
        'inventory.py',
        'if qty > have:',
        'if qty >= have:',
        'COMPARISON',
        'Removing all stock raises',
        'Removing exactly what you have is fine. Only asking for more is an error.',
      ),
      bug(
        'inventory.py',
        'raise ValueError(f"Not enough {item}")',
        'raise ValueError("Not enough {item}")',
        'STRINGS',
        'The f is missing from the f-string',
        'Without the f prefix, {item} is printed literally ("Not enough {item}") instead of the item’s name.',
      ),
      bug(
        'reports.py',
        'if qty < threshold',
        'if qty > threshold',
        'LOGIC',
        'Lists the well-stocked items',
        'Low stock means below the threshold.',
      ),
    ],
  ),
  py(
    'password-rules',
    {
      'rules.py': String.raw`import re


def check_password(pw):
    problems = []
    if len(pw) < 8:
        problems.append("at least 8 characters")
    if not re.search(r"[0-9]", pw):
        problems.append("a number")
    if not re.search(r"[A-Z]", pw):
        problems.append("an uppercase letter")
    return problems
`,
      'password.py': String.raw`from rules import check_password


def is_strong(pw):
    return len(check_password(pw)) == 0
`,
    },
    String.raw`from testing import test, expect
from password import is_strong
from rules import check_password


@test("a good password has no problems")
def _():
    expect(check_password("Abcdefg1")).to_equal([])
    expect(is_strong("Abcdefg1")).to_be(True)


@test("names each missing rule")
def _():
    expect(check_password("Abcdef1")).to_contain("at least 8 characters")
    expect(check_password("abcdefgh1")).to_contain("an uppercase letter")
    expect(check_password("Abcdefgh")).to_contain("a number")


@test("a weak password is not strong")
def _():
    expect(is_strong("abc")).to_be(False)
`,
    [
      bug(
        'rules.py',
        'len(pw) < 8',
        'len(pw) < 7',
        'OFF_BY_ONE',
        'Seven characters are accepted',
        'The rule is "at least 8", so anything shorter than 8 is a problem.',
      ),
      bug(
        'rules.py',
        'r"[A-Z]"',
        'r"[a-z]"',
        'REGEX',
        'Checks for lowercase instead of uppercase',
        '[a-z] matches lowercase letters. The rule asks for an uppercase one, [A-Z].',
      ),
      bug(
        'password.py',
        '== 0',
        '> 0',
        'LOGIC',
        'Strong means "has problems"',
        'A password is strong when the list of problems is empty.',
      ),
    ],
  ),
  py(
    'fizzbuzz',
    {
      'rules.py': String.raw`def fizz_buzz(n):
    if n % 15 == 0:
        return "FizzBuzz"
    if n % 3 == 0:
        return "Fizz"
    if n % 5 == 0:
        return "Buzz"
    return str(n)
`,
      'fizzbuzz.py': String.raw`from rules import fizz_buzz


def sequence(count):
    return [fizz_buzz(n) for n in range(1, count + 1)]
`,
    },
    String.raw`from testing import test, expect
from fizzbuzz import sequence
from rules import fizz_buzz


@test("says the right word")
def _():
    expect(fizz_buzz(15)).to_be("FizzBuzz")
    expect(fizz_buzz(9)).to_be("Fizz")
    expect(fizz_buzz(10)).to_be("Buzz")
    expect(fizz_buzz(7)).to_be("7")


@test("plays from 1 to n")
def _():
    expect(sequence(5)).to_equal(["1", "2", "Fizz", "4", "Buzz"])
`,
    [
      bug(
        'rules.py',
        '    if n % 15 == 0:\n        return "FizzBuzz"\n    if n % 3 == 0:\n        return "Fizz"',
        '    if n % 3 == 0:\n        return "Fizz"\n    if n % 15 == 0:\n        return "FizzBuzz"',
        'LOGIC',
        'Rules checked in the wrong order',
        'Every multiple of 15 is also a multiple of 3, so the general rule wins if it comes first. Check the most specific rule first.',
      ),
      bug(
        'rules.py',
        'return str(n)',
        'return n',
        'TYPE_COERCION',
        'Returns numbers, not text',
        'The function promises text. 7 and "7" are different values in Python.',
      ),
      bug(
        'fizzbuzz.py',
        'range(1, count + 1)',
        'range(count)',
        'OFF_BY_ONE',
        'Counts from 0 to n-1',
        'range(count) is 0 … count-1. The game is played from 1 to count, which is range(1, count + 1).',
      ),
    ],
  ),
  py(
    'bill-splitter',
    {
      'bill.py': String.raw`def split_bill(total, people, tip_percent):
    if people < 1:
        raise ValueError("At least one person")
    with_tip = total * (1 + tip_percent / 100)
    return round(with_tip / people, 2)
`,
      'parse.py': String.raw`def parse_amount(text):
    return float(text.replace(",", "."))
`,
    },
    String.raw`from testing import test, expect
from bill import split_bill
from parse import parse_amount


@test("adds the tip and splits evenly")
def _():
    expect(split_bill(100, 4, 10)).to_be(27.5)


@test("rounds to cents")
def _():
    expect(split_bill(10, 3, 0)).to_be(3.33)


@test("zero people is a clear error")
def _():
    expect(lambda: split_bill(10, 0, 0)).to_raise(ValueError, "At least one person")


@test("reads amounts written with a comma")
def _():
    expect(parse_amount("12,50")).to_be(12.5)
`,
    [
      bug(
        'bill.py',
        'total * (1 + tip_percent / 100)',
        'total + tip_percent / 100',
        'MATH',
        'Adds the tip as a tiny number',
        'A 10% tip on 100 is 10. Multiplying by (1 + 10/100) adds 10%; adding 0.1 adds ten cents.',
      ),
      bug(
        'bill.py',
        'round(with_tip / people, 2)',
        'round(with_tip / people)',
        'MATH',
        'Rounds to whole euros',
        'round(x) without a second argument rounds to an integer. round(x, 2) keeps the cents.',
      ),
      bug(
        'bill.py',
        'if people < 1:',
        'if people < 0:',
        'ERROR_HANDLING',
        'Zero people crashes with ZeroDivisionError',
        'The guard is meant to give a clear error before dividing. 0 slips past "< 0".',
      ),
      bug(
        'parse.py',
        'text.replace(",", ".")',
        'text.replace(",", "")',
        'STRINGS',
        'The comma is deleted, not turned into a point',
        '"12,50" becomes "1250", so the amount is a hundred times too big.',
      ),
    ],
  ),
  py(
    'word-stats',
    {
      'words.py': String.raw`def count_words(text):
    return len(text.split())
`,
      'frequency.py': String.raw`def most_common(text):
    counts = {}
    for word in text.lower().split():
        counts[word] = counts.get(word, 0) + 1
    if not counts:
        return None
    return max(counts, key=counts.get)
`,
    },
    String.raw`from testing import test, expect
from frequency import most_common
from words import count_words


@test("counts words, ignoring extra spaces")
def _():
    expect(count_words("  hello   world ")).to_be(2)
    expect(count_words("")).to_be(0)


@test("finds the most common word")
def _():
    expect(most_common("a b b")).to_be("b")


@test("ignores case")
def _():
    expect(most_common("The cat saw the dog and THE bird")).to_be("the")


@test("no words means None")
def _():
    expect(most_common("")).to_be_none()
`,
    [
      bug(
        'words.py',
        'text.split()',
        'text.split(" ")',
        'STRINGS',
        'Extra spaces become words',
        'split() with no argument splits on any run of whitespace and drops empty strings. split(" ") keeps an empty string for every extra space.',
      ),
      bug(
        'frequency.py',
        'counts.get(word, 0) + 1',
        'counts[word] + 1',
        'NULL_UNDEFINED',
        'The first time a word is seen raises KeyError',
        'A new word isn’t in the dict yet. counts.get(word, 0) starts it at 0.',
      ),
      bug(
        'frequency.py',
        'text.lower().split()',
        'text.split()',
        'STRINGS',
        'Case-sensitive counting',
        '"The" and "the" are the same word here, so lower-case the text before counting.',
      ),
      bug(
        'frequency.py',
        '    if not counts:\n        return None\n',
        '',
        'ERROR_HANDLING',
        'Empty text crashes',
        'max() of an empty dict raises ValueError. Handle "no words" before asking for the maximum.',
      ),
    ],
  ),
  py(
    'age-check',
    {
      'age_math.py': String.raw`def age_on(birth, today):
    age = today.year - birth.year
    if (today.month, today.day) < (birth.month, birth.day):
        age -= 1
    return age
`,
      'age.py': String.raw`from age_math import age_on

ADULT_AGE = 18


def is_adult(birth, today):
    return age_on(birth, today) >= ADULT_AGE
`,
    },
    String.raw`from datetime import date
from testing import test, expect
from age import is_adult
from age_math import age_on


@test("is one year younger the day before the birthday")
def _():
    expect(age_on(date(2000, 6, 15), date(2026, 6, 14))).to_be(25)
    expect(age_on(date(2000, 6, 15), date(2026, 3, 20))).to_be(25)


@test("turns a year older on the birthday")
def _():
    expect(age_on(date(2000, 6, 15), date(2026, 6, 15))).to_be(26)
    expect(age_on(date(2000, 6, 15), date(2026, 12, 1))).to_be(26)


@test("is an adult from the 18th birthday")
def _():
    expect(is_adult(date(2008, 3, 1), date(2026, 3, 1))).to_be(True)
    expect(is_adult(date(2008, 3, 2), date(2026, 3, 1))).to_be(False)
`,
    [
      bug(
        'age_math.py',
        '(today.month, today.day) < (birth.month, birth.day)',
        'today.day < birth.day',
        'DATES',
        'Compares only the day, not the month',
        'A birthday is a (month, day) pair. Comparing tuples compares the month first and the day only on a tie.',
      ),
      bug(
        'age_math.py',
        'age -= 1',
        'age += 1',
        'LOGIC',
        'Adds a year instead of taking one off',
        'Before this year’s birthday, the full year hasn’t passed yet, so subtract one.',
      ),
      bug(
        'age.py',
        '>= ADULT_AGE',
        '> ADULT_AGE',
        'COMPARISON',
        'Adult only after turning 19',
        'You are an adult on your 18th birthday: 18 or older is >= 18.',
      ),
    ],
  ),
  py(
    'price-format',
    {
      'money.py': String.raw`def format_price(cents):
    sign = "-" if cents < 0 else ""
    euros, rest = divmod(abs(cents), 100)
    return f"{sign}€{euros}.{rest:02d}"
`,
      'totals.py': String.raw`def sum_prices(prices):
    return sum(int(p) for p in prices)
`,
    },
    String.raw`from testing import test, expect
from money import format_price
from totals import sum_prices


@test("pads cents to two digits")
def _():
    expect(format_price(105)).to_be("€1.05")
    expect(format_price(199)).to_be("€1.99")


@test("formats negative prices")
def _():
    expect(format_price(-250)).to_be("-€2.50")


@test("adds prices that arrive as strings")
def _():
    expect(sum_prices(["100", "250", 50])).to_be(400)
`,
    [
      bug(
        'money.py',
        '{rest:02d}',
        '{rest}',
        'STRINGS',
        '5 cents shows as .5',
        'The format spec :02d pads the number to two digits with zeros, so 5 prints as 05.',
      ),
      bug(
        'money.py',
        'divmod(abs(cents), 100)',
        'divmod(cents, 100)',
        'MATH',
        'Negative prices are split wrongly',
        'Python’s divmod rounds towards minus infinity: divmod(-250, 100) is (-3, 50). Split the absolute value; the sign is added separately.',
      ),
      bug(
        'totals.py',
        'sum(int(p) for p in prices)',
        'sum(prices)',
        'TYPE_COERCION',
        'Adds strings and numbers',
        'Python won’t add "100" and 50: it raises TypeError. Convert every price to a number first.',
      ),
    ],
  ),
  py(
    'leaderboard',
    {
      'scores.py': String.raw`def top_players(players, n):
    return sorted(players, key=lambda p: p["score"], reverse=True)[:n]


def rank_of(players, name):
    ranked = top_players(players, len(players))
    for i, p in enumerate(ranked):
        if p["name"] == name:
            return i + 1
    return None
`,
      'names.py': String.raw`def sort_names(names):
    return sorted(names, key=str.lower)
`,
    },
    String.raw`from testing import test, expect
from names import sort_names
from scores import rank_of, top_players

players = [{"name": "ana", "score": 5}, {"name": "ben", "score": 9}, {"name": "cy", "score": 7}]


@test("shows the best players first")
def _():
    expect([p["name"] for p in top_players(players, 2)]).to_equal(["ben", "cy"])


@test("ranks players from 1, and unknown players are None")
def _():
    expect(rank_of(players, "ben")).to_be(1)
    expect(rank_of(players, "ana")).to_be(3)
    expect(rank_of(players, "zed")).to_be_none()


@test("sorts names alphabetically without changing the input")
def _():
    names = ["bob", "alice", "Carl"]
    expect(sort_names(names)).to_equal(["alice", "bob", "Carl"])
    expect(names).to_equal(["bob", "alice", "Carl"])
`,
    [
      bug(
        'scores.py',
        'reverse=True',
        'reverse=False',
        'SORTING',
        'Lowest scores first',
        'sorted() is ascending by default. For "highest first", sort in reverse.',
      ),
      bug(
        'scores.py',
        'return i + 1',
        'return i',
        'OFF_BY_ONE',
        'Ranks start at 0',
        'enumerate counts from 0, but the winner is rank 1. (enumerate(ranked, start=1) works too.)',
      ),
      bug(
        'names.py',
        '    return sorted(names, key=str.lower)',
        '    names.sort(key=str.lower)\n    return names',
        'MUTATION',
        'Sorts the caller’s list',
        'list.sort() changes the list in place, so the caller’s list is reordered too. sorted() returns a new list.',
      ),
    ],
  ),
  py(
    'coupon-codes',
    {
      'coupon.py': String.raw`CODES = {"SAVE10": 10, "SAVE20": 20}


def code_value(code):
    return CODES.get(code.strip().upper(), 0)


def final_price(price, code):
    return max(0, price - code_value(code))
`,
      'dates.py': String.raw`from datetime import date


def is_expired(expires, today):
    return today > date.fromisoformat(expires)
`,
    },
    String.raw`from datetime import date
from testing import test, expect
from coupon import code_value, final_price
from dates import is_expired


@test("codes ignore case and surrounding spaces")
def _():
    expect(code_value(" save10 ")).to_be(10)
    expect(code_value("NOPE")).to_be(0)


@test("a code works until the end of its last day")
def _():
    expect(is_expired("2026-01-01", date(2026, 2, 1))).to_be(True)
    expect(is_expired("2026-03-01", date(2026, 3, 1))).to_be(False)


@test("a discount never makes the price negative")
def _():
    expect(final_price(50, "SAVE20")).to_be(30)
    expect(final_price(5, "SAVE20")).to_be(0)
`,
    [
      bug(
        'coupon.py',
        'code.strip().upper()',
        'code.upper()',
        'STRINGS',
        'Spaces break valid codes',
        'People paste codes with spaces around them. strip() removes them before the lookup.',
      ),
      bug(
        'dates.py',
        'today > date.fromisoformat(expires)',
        'today >= date.fromisoformat(expires)',
        'DATES',
        'Codes expire a day early',
        'A code that expires on 1 March still works on 1 March. It has expired only after that day.',
      ),
      bug(
        'coupon.py',
        'max(0, price - code_value(code))',
        'min(0, price - code_value(code))',
        'MATH',
        'min and max swapped',
        'max(0, x) keeps x from dropping below 0. min(0, x) does the opposite.',
      ),
    ],
  ),
  py(
    'seat-map',
    {
      'seats.py': String.raw`def make_seats(rows, per_row):
    return [chr(65 + r) + str(s) for r in range(rows) for s in range(1, per_row + 1)]


def free_seats(all_seats, taken):
    return [seat for seat in all_seats if seat not in taken]
`,
      'windows.py': String.raw`def is_window(seat, per_row):
    n = int(seat[1:])
    return n == 1 or n == per_row
`,
    },
    String.raw`from testing import test, expect
from seats import free_seats, make_seats
from windows import is_window


@test("labels rows A, B, C … and seats from 1")
def _():
    expect(make_seats(2, 2)).to_equal(["A1", "A2", "B1", "B2"])


@test("lists the free seats")
def _():
    expect(free_seats(["A1", "A2", "B1"], ["A2"])).to_equal(["A1", "B1"])


@test("knows the window seats")
def _():
    expect(is_window("A1", 4)).to_be(True)
    expect(is_window("B4", 4)).to_be(True)
    expect(is_window("B2", 4)).to_be(False)
`,
    [
      bug(
        'seats.py',
        'chr(65 + r)',
        'chr(64 + r)',
        'OFF_BY_ONE',
        'Rows start at "@"',
        'chr(65) is "A". With r starting at 0, 64 + r gives "@" for the first row.',
      ),
      bug(
        'seats.py',
        'range(1, per_row + 1)',
        'range(per_row)',
        'OFF_BY_ONE',
        'Seat numbers start at 0',
        'range(per_row) counts 0 … per_row-1. Seats are numbered from 1.',
      ),
      bug(
        'seats.py',
        'if seat not in taken',
        'if seat in taken',
        'LOGIC',
        'Lists the taken seats',
        'Free seats are the ones not in taken.',
      ),
      bug(
        'windows.py',
        'int(seat[1:])',
        'int(seat[2:])',
        'STRINGS',
        'Reads the seat number from the wrong position',
        'In "A1" the number starts at index 1. seat[2:] is "", and int("") raises ValueError.',
      ),
    ],
  ),
  py(
    'todo-list',
    {
      'todos.py': String.raw`def add_todo(todos, title):
    next_id = max((t["id"] for t in todos), default=0) + 1
    return todos + [{"id": next_id, "title": title, "done": False}]


def toggle(todos, todo_id):
    return [{**t, "done": not t["done"]} if t["id"] == todo_id else t for t in todos]
`,
      'stats.py': String.raw`def remaining(todos):
    return sum(1 for t in todos if not t["done"])
`,
    },
    String.raw`from testing import test, expect
from stats import remaining
from todos import add_todo, toggle


@test("new ids are one above the highest, even after deletions")
def _():
    todos = add_todo([{"id": 1, "title": "a", "done": False}, {"id": 3, "title": "b", "done": False}], "c")
    expect(todos[2]["id"]).to_be(4)
    expect(add_todo([], "first")[0]["id"]).to_be(1)


@test("toggling returns new todos and leaves the old ones alone")
def _():
    before = [{"id": 1, "title": "a", "done": False}]
    after = toggle(before, 1)
    expect(after[0]["done"]).to_be(True)
    expect(before[0]["done"]).to_be(False)


@test("counts what is left to do")
def _():
    expect(remaining([{"done": True}, {"done": True}, {"done": False}])).to_be(1)
`,
    [
      bug(
        'todos.py',
        'max((t["id"] for t in todos), default=0) + 1',
        'len(todos) + 1',
        'LOGIC',
        'Ids clash after a deletion',
        'With todos 1 and 3 left, len + 1 is 3, which is taken. The next id must be above the highest existing one.',
      ),
      bug(
        'todos.py',
        '{**t, "done": not t["done"]}',
        't.update(done=not t["done"]) or t',
        'MUTATION',
        'Toggling changes the old todo',
        't.update(...) edits the dict the caller still holds (and returns None, hence the "or t"). {**t, ...} builds a new dict.',
      ),
      bug(
        'stats.py',
        'if not t["done"]',
        'if t["done"]',
        'LOGIC',
        'Counts finished todos',
        '"Remaining" means not done yet.',
      ),
    ],
  ),
  py(
    'contact-form',
    {
      'contacts.py': String.raw`import re

EMAIL = re.compile(r"[^\s@]+@[^\s@]+\.[^\s@]{2,}")


def is_email(value):
    return EMAIL.fullmatch(value) is not None


def normalize_phone(phone):
    return re.sub(r"[^0-9+]", "", phone)
`,
      'names.py': String.raw`def initials(name):
    return "".join(part[0].upper() for part in name.split())
`,
    },
    String.raw`from testing import test, expect
from contacts import is_email, normalize_phone
from names import initials


@test("accepts real emails only")
def _():
    expect(is_email("ada@example.com")).to_be(True)
    expect(is_email("not an email@x.com")).to_be(False)
    expect(is_email("a@b.c")).to_be(False)


@test("keeps only digits and the plus sign")
def _():
    expect(normalize_phone("+49 (30) 123-45")).to_be("+493012345")


@test("builds initials, ignoring extra spaces")
def _():
    expect(initials("ada  lovelace")).to_be("AL")
`,
    [
      bug(
        'contacts.py',
        'EMAIL.fullmatch(value)',
        'EMAIL.search(value)',
        'REGEX',
        'Finds an email anywhere in the text',
        'search() is happy with a match anywhere, so "not an email@x.com" passes because it contains "email@x.com". fullmatch() requires the whole input to match.',
      ),
      bug(
        'contacts.py',
        're.sub(r"[^0-9+]", "", phone)',
        're.sub(r"[^0-9+]", "", phone, count=1)',
        'REGEX',
        'Only the first character is removed',
        'count=1 stops re.sub after the first replacement. Leave it out to replace every match.',
      ),
      bug(
        'names.py',
        'name.split()',
        'name.split(" ")',
        'STRINGS',
        'Double spaces crash it',
        'split(" ") keeps an empty string between two spaces, and ""[0] raises IndexError. split() drops empty parts.',
      ),
    ],
  ),
  py(
    'parking-fees',
    {
      'parking.py': String.raw`import math


def hours_parked(start_minutes, end_minutes):
    return math.ceil((end_minutes - start_minutes) / 60)
`,
      'fees.py': String.raw`HOURLY_RATE = 2
DAILY_CAP = 20


def parking_fee(hours):
    if hours <= 1:
        return 0
    return min((hours - 1) * HOURLY_RATE, DAILY_CAP)
`,
    },
    String.raw`from testing import test, expect
from fees import parking_fee
from parking import hours_parked


@test("a started hour counts as a full hour")
def _():
    expect(hours_parked(0, 61)).to_be(2)
    expect(hours_parked(0, 60)).to_be(1)


@test("the first hour is free, then 2 per hour")
def _():
    expect(parking_fee(1)).to_be(0)
    expect(parking_fee(3)).to_be(4)


@test("never charges more than 20 a day")
def _():
    expect(parking_fee(24)).to_be(20)
`,
    [
      bug(
        'parking.py',
        'math.ceil(',
        'math.floor(',
        'MATH',
        'Started hours are free',
        'math.floor rounds 1.02 hours down to 1. "A started hour counts" means rounding up.',
      ),
      bug(
        'parking.py',
        ' / 60)',
        ' // 60)',
        'MATH',
        'Floor division before rounding up',
        '61 // 60 is already 1, so there is nothing left for ceil to round up. Divide with / and let ceil do the rounding.',
      ),
      bug(
        'fees.py',
        '(hours - 1) * HOURLY_RATE',
        'hours * HOURLY_RATE',
        'OFF_BY_ONE',
        'The free hour is charged',
        'Only the hours after the first are paid.',
      ),
      bug(
        'fees.py',
        'return min(',
        'return max(',
        'MATH',
        'The cap becomes a minimum',
        'A cap means "at most 20": the smaller of the fee and 20.',
      ),
    ],
  ),
  py(
    'array-utils',
    {
      'arrays.py': String.raw`def chunk(items, size):
    return [items[i : i + size] for i in range(0, len(items), size)]
`,
      'more.py': String.raw`def unique(items):
    seen = set()
    out = []
    for item in items:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out


def last(items):
    return items[-1] if items else None
`,
    },
    String.raw`from testing import test, expect
from arrays import chunk
from more import last, unique


@test("splits into chunks")
def _():
    expect(chunk([1, 2, 3, 4, 5], 2)).to_equal([[1, 2], [3, 4], [5]])


@test("removes duplicates, keeping the original order")
def _():
    expect(unique([3, 1, 3, 2])).to_equal([3, 1, 2])


@test("returns the last element, or None for an empty list")
def _():
    expect(last([1, 2, 3])).to_be(3)
    expect(last([])).to_be_none()
`,
    [
      bug(
        'arrays.py',
        'range(0, len(items), size)',
        'range(0, len(items))',
        'LOGIC',
        'Chunks overlap',
        'Without the step, the loop starts a new chunk at every index instead of every size items.',
      ),
      bug(
        'arrays.py',
        'items[i : i + size]',
        'items[i : size]',
        'ARRAY_METHODS',
        'The slice end is a position, not a length',
        'items[start:end] stops before end. For later chunks, end must be i + size.',
      ),
      bug(
        'more.py',
        '    return out\n',
        '    return list(set(items))\n',
        'DATA_STRUCTURES',
        'A set loses the order',
        'A set removes duplicates, but has no order you can rely on. Keep a list for order and a set for "seen".',
      ),
      bug(
        'more.py',
        'items[-1] if items else None',
        'items[len(items)]',
        'OFF_BY_ONE',
        'Reads past the end',
        'The last index is len(items) - 1 (or simply -1). items[len(items)] raises IndexError.',
      ),
    ],
  ),
  py(
    'star-ratings',
    {
      'ratings.py': String.raw`def average_rating(ratings):
    valid = [r for r in ratings if 1 <= r <= 5]
    if not valid:
        return None
    return round(sum(valid) / len(valid), 1)
`,
      'stars.py': String.raw`def stars(avg):
    full = int(avg)
    return "★" * full + "☆" * (5 - full)
`,
    },
    String.raw`from testing import test, expect
from ratings import average_rating
from stars import stars


@test("ignores ratings outside 1 to 5")
def _():
    expect(average_rating([5, 4, 10, 0])).to_be(4.5)


@test("no ratings means None, not zero")
def _():
    expect(average_rating([])).to_be_none()


@test("rounds to one decimal")
def _():
    expect(average_rating([4, 4, 5])).to_be(4.3)


@test("draws stars")
def _():
    expect(stars(3.7)).to_be("★★★☆☆")
`,
    [
      bug(
        'ratings.py',
        '1 <= r <= 5',
        '1 <= r or r <= 5',
        'LOGIC',
        '"or" lets everything through',
        'Every number is either ≥ 1 or ≤ 5. Python’s chained comparison 1 <= r <= 5 means both at once.',
      ),
      bug(
        'ratings.py',
        'return None',
        'return 0',
        'NULL_UNDEFINED',
        'No ratings looks like terrible ratings',
        'A product without reviews isn’t rated 0. None tells the page to show "no ratings yet".',
      ),
      bug(
        'ratings.py',
        'round(sum(valid) / len(valid), 1)',
        'round(sum(valid) / len(valid))',
        'MATH',
        'Rounds to a whole star',
        'round(x, 1) keeps one decimal; round(x) rounds to an integer.',
      ),
      bug(
        'stars.py',
        '"☆" * (5 - full)',
        '"☆" * 5 - full',
        'MATH',
        'Operator precedence with strings',
        '* binds tighter than -, so this computes "☆☆☆☆☆" - full, and subtracting a number from a string raises TypeError.',
      ),
    ],
  ),
];
