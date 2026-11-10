import type { TestReport } from '@studywidbuddy/shared';
import { duration } from './debug-format';
import { inline, parseReply } from './reply-format';
import { formatResponse, formatTests, parseCommand } from './terminal';

describe('Debug terminal', () => {
  it('parses the commands people type', () => {
    expect(parseCommand('npm test')).toEqual({ kind: 'test' });
    expect(parseCommand('  test ')).toEqual({ kind: 'test' });
    expect(parseCommand('node ./cart.js')).toEqual({ kind: 'run', file: 'cart.js' });
    expect(parseCommand('cat order.js')).toEqual({ kind: 'cat', file: 'order.js' });
    expect(parseCommand('ls')).toEqual({ kind: 'ls' });
    expect(parseCommand('clear')).toEqual({ kind: 'clear' });
    expect(parseCommand('rm -rf /')).toEqual({ kind: 'unknown', input: 'rm -rf /' });
    expect(parseCommand('   ')).toBeNull();
  });

  it('formats test results with ✓/✗, the reason and a summary', () => {
    const report: TestReport = {
      results: [
        { name: 'adds', passed: true, error: null },
        { name: 'discounts', passed: false, error: 'expected 180, received 190' },
      ],
      passed: 1,
      failed: 1,
      logs: [{ stream: 'log', text: 'total 25' }],
      error: null,
    };
    expect(formatTests(report)).toEqual([
      { tone: 'plain', text: 'total 25' },
      { tone: 'ok', text: '✓ adds' },
      { tone: 'err', text: '✗ discounts' },
      { tone: 'muted', text: '    expected 180, received 190' },
      { tone: 'err', text: 'Tests: 1 failed, 1 passed, 2 total' },
    ]);
  });

  it('explains timeouts and shows unhandled rejections as warnings', () => {
    expect(formatResponse({ kind: 'timeout', seconds: 6 })[0].text).toContain('infinite loop');
    const lines = formatResponse({
      kind: 'test',
      report: { results: [], passed: 0, failed: 0, logs: [], error: 'SyntaxError: Unexpected token' },
      warnings: ['Unhandled promise rejection: boom'],
    });
    expect(lines.map((l) => l.tone)).toEqual(['err', 'warn']);
  });
});

describe('assistant reply rendering', () => {
  it('splits paragraphs, lists and code fences, without any HTML', () => {
    const blocks = parseReply(
      'Look at **cartTotal**:\n\n- check `i <= n`\n- think\n\n```js\nfor (;;) {}\n```\n<script>x</script>',
    );
    expect(blocks).toEqual([
      {
        kind: 'para',
        parts: [
          { kind: 'text', text: 'Look at ' },
          { kind: 'bold', text: 'cartTotal' },
          { kind: 'text', text: ':' },
        ],
      },
      {
        kind: 'list',
        items: [
          [
            { kind: 'text', text: 'check ' },
            { kind: 'code', text: 'i <= n' },
          ],
          [{ kind: 'text', text: 'think' }],
        ],
      },
      { kind: 'code', lang: 'js', text: 'for (;;) {}' },
      { kind: 'para', parts: [{ kind: 'text', text: '<script>x</script>' }] },
    ]);
  });

  it('handles text without markup', () => {
    expect(inline('plain')).toEqual([{ kind: 'text', text: 'plain' }]);
  });

  it('keeps code that sits inside bold', () => {
    expect(inline('**`pricing.js` holds helpers**')).toEqual([
      { kind: 'code', text: 'pricing.js' },
      { kind: 'bold', text: ' holds helpers' },
    ]);
  });
});

describe('duration', () => {
  it('reads naturally', () => {
    expect([duration(null), duration(42), duration(754), duration(3720)]).toEqual([
      '–',
      '42 s',
      '12 min 34 s',
      '1 h 2 min',
    ]);
  });
});
