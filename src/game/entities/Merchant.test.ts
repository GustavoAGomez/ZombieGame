import { describe, expect, it } from 'vitest';
import { edgeArrow, type ViewEdges } from './Merchant';

const view: ViewEdges = { x: 100, y: 50, width: 200, height: 100, insetX: 20, insetTop: 10, insetBottom: 30 };

describe('edgeArrow', () => {
  it('shows nothing while the target is in view (with a margin)', () => {
    expect(edgeArrow(view, 150, 80)).toBeNull();
    expect(edgeArrow(view, 302, 80, 4)).toBeNull();
  });

  it('puts the arrow on the inset border, along the line from the centre', () => {
    // Inset box: x 120..280, y 60..120, centre (200, 90).
    const right = edgeArrow(view, 500, 90);
    expect(right).toEqual({ x: 280, y: 90, angle: 0 });
    const up = edgeArrow(view, 200, -500);
    expect(up?.x).toBeCloseTo(200);
    expect(up?.y).toBeCloseTo(60);
    expect(up?.angle).toBeCloseTo(-Math.PI / 2);
    const corner = edgeArrow(view, 200 + 800, 90 + 300);
    expect(corner?.x).toBeCloseTo(200 + 800 * (30 / 300));
    expect(corner?.y).toBeCloseTo(120);
  });
});
