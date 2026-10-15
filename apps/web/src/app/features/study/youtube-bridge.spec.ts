import { fmtTime, YoutubeBridge } from './youtube-bridge';

describe('YoutubeBridge', () => {
  let iframe: HTMLIFrameElement;
  let times: number[];
  let bridge: YoutubeBridge;

  beforeEach(() => {
    iframe = document.createElement('iframe');
    iframe.src = 'about:blank';
    document.body.appendChild(iframe);
    times = [];
    bridge = new YoutubeBridge(iframe, (s) => times.push(s));
  });
  afterEach(() => {
    bridge.destroy();
    iframe.remove();
  });

  const send = (
    data: unknown,
    origin = 'https://www.youtube-nocookie.com',
    source: Window | null = iframe.contentWindow,
  ) => window.dispatchEvent(new MessageEvent('message', { data, origin, source }));

  it('reports whole seconds from the player, once per second', () => {
    send(JSON.stringify({ event: 'infoDelivery', info: { currentTime: 12.3 } }));
    send(JSON.stringify({ event: 'infoDelivery', info: { currentTime: 12.9 } }));
    send(JSON.stringify({ event: 'infoDelivery', info: { currentTime: 13.1 } }));
    expect(times).toEqual([12, 13]);
  });

  it('ignores messages from other origins, other windows, or with bad data', () => {
    send(JSON.stringify({ event: 'infoDelivery', info: { currentTime: 5 } }), 'https://evil.example');
    send(JSON.stringify({ event: 'infoDelivery', info: { currentTime: 6 } }), undefined, window);
    send('not json');
    send(JSON.stringify({ event: 'infoDelivery', info: { currentTime: 'x' } }));
    expect(times).toEqual([]);
  });

  it('formats times', () => {
    expect(fmtTime(245)).toBe('4:05');
    expect(fmtTime(3723)).toBe('1:02:03');
  });
});
