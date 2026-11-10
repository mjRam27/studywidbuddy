/**
 * Splits an assistant reply (Markdown-ish) into blocks the template renders with normal
 * interpolation, so model output can never inject HTML. Supports ``` code fences, inline
 * `code`, **bold**, and bullet lists, which covers what the coach writes.
 */
export type Inline = { kind: 'text' | 'code' | 'bold'; text: string };
export type ReplyBlock =
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'para'; parts: Inline[] }
  | { kind: 'list'; items: Inline[][] };

export function inline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: 'code', text: m[1] });
    // Bold can wrap code (**`file.js`**): keep the code, make the rest bold.
    else out.push(...inline(m[2]).map((p): Inline => (p.kind === 'text' ? { kind: 'bold', text: p.text } : p)));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

export function parseReply(reply: string): ReplyBlock[] {
  const blocks: ReplyBlock[] = [];
  const lines = reply.replace(/\r\n/g, '\n').split('\n');
  let para: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: 'para', parts: inline(para.join(' ')) });
    if (list.length) blocks.push({ kind: 'list', items: list.map(inline) });
    para = [];
    list = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*```(\w*)/.exec(line);
    if (fence) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) code.push(lines[i]);
      blocks.push({ kind: 'code', lang: fence[1] || 'js', text: code.join('\n') });
      continue;
    }
    const bullet = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(line);
    if (bullet) {
      if (para.length) {
        blocks.push({ kind: 'para', parts: inline(para.join(' ')) });
        para = [];
      }
      list.push(bullet[1]);
    } else if (!line.trim()) {
      flush();
    } else {
      if (list.length) flush();
      para.push(line.trim().replace(/^#+\s*/, ''));
    }
  }
  flush();
  return blocks;
}
