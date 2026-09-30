/** Pure math for the virtual sticks, kept apart from the DOM so it is testable. */

export interface JoystickTuning {
  maxTravel: number;
  /** Fraction of maxTravel with no response. */
  deadZone: number;
  minSpeed: number;
  maxSpeed: number;
}

export interface StickOutput {
  /** Movement vector; its length is the analog speed factor. */
  x: number;
  y: number;
  /** Knob offset in CSS px, clamped to maxTravel. */
  knobX: number;
  knobY: number;
}

/**
 * Maps a finger offset from the base centre to a movement vector. Inside
 * the dead zone the output is zero; beyond it the speed ramps linearly from
 * minSpeed to maxSpeed at full travel (spec 01 §2.1).
 */
export function joystickVector(dx: number, dy: number, t: JoystickTuning, out: StickOutput): StickOutput {
  const dist = Math.hypot(dx, dy);
  const clamped = Math.min(dist, t.maxTravel);
  const scale = dist > 0 ? clamped / dist : 0;
  out.knobX = dx * scale;
  out.knobY = dy * scale;

  const magnitude = clamped / t.maxTravel;
  if (dist === 0 || magnitude <= t.deadZone) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  const ramp = (magnitude - t.deadZone) / (1 - t.deadZone);
  const speed = t.minSpeed + (t.maxSpeed - t.minSpeed) * ramp;
  out.x = (dx / dist) * speed;
  out.y = (dy / dist) * speed;
  return out;
}

export interface AimOutput {
  /** True when the drag passed the threshold and the aim is manual. */
  manual: boolean;
  /** Unit aim vector (valid when manual). */
  x: number;
  y: number;
  knobX: number;
  knobY: number;
}

/** Fire stick: past `threshold` px the drag direction becomes the aim. */
export function fireStickAim(dx: number, dy: number, threshold: number, maxTravel: number, out: AimOutput): AimOutput {
  const dist = Math.hypot(dx, dy);
  const scale = dist > maxTravel ? maxTravel / dist : 1;
  out.knobX = dx * scale;
  out.knobY = dy * scale;
  if (dist > threshold) {
    out.manual = true;
    out.x = dx / dist;
    out.y = dy / dist;
  } else {
    out.manual = false;
    out.x = 0;
    out.y = 0;
  }
  return out;
}
