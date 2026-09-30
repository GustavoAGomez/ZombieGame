import { STRINGS } from './strings';

/** Full-screen notice shown by CSS only while the device is in portrait. */
export function mountRotateOverlay(root: HTMLElement): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'rotate-overlay';

  const title = document.createElement('div');
  title.className = 'rotate-overlay__title';
  title.textContent = STRINGS.rotateDevice;

  const hint = document.createElement('div');
  hint.className = 'rotate-overlay__hint';
  hint.textContent = STRINGS.rotateDeviceHint;

  overlay.append(title, hint);
  root.appendChild(overlay);
  return overlay;
}
