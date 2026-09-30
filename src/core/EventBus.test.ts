import { describe, expect, it, vi } from 'vitest';
import { EventBus } from './EventBus';

interface TestEvents {
  ping: { n: number };
  other: { s: string };
}

describe('EventBus', () => {
  it('delivers typed payloads to subscribers', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    bus.on('ping', handler);
    bus.emit('ping', { n: 3 });
    expect(handler).toHaveBeenCalledWith({ n: 3 });
  });

  it('only notifies handlers of the emitted type', () => {
    const bus = new EventBus<TestEvents>();
    const ping = vi.fn();
    const other = vi.fn();
    bus.on('ping', ping);
    bus.on('other', other);
    bus.emit('other', { s: 'x' });
    expect(ping).not.toHaveBeenCalled();
    expect(other).toHaveBeenCalledOnce();
  });

  it('unsubscribes with the returned function or off()', () => {
    const bus = new EventBus<TestEvents>();
    const a = vi.fn();
    const b = vi.fn();
    const unsubscribe = bus.on('ping', a);
    bus.on('ping', b);
    unsubscribe();
    bus.off('ping', b);
    bus.emit('ping', { n: 1 });
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('clear() removes every handler', () => {
    const bus = new EventBus<TestEvents>();
    const a = vi.fn();
    bus.on('ping', a);
    bus.clear();
    bus.emit('ping', { n: 1 });
    expect(a).not.toHaveBeenCalled();
  });
});
