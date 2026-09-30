import type Phaser from 'phaser';
import { physicalSize, type PhysicalSize } from '../config/display';

/** Measures the game container and returns the canvas backing-store size. */
export function measureViewport(root: HTMLElement): PhysicalSize {
  const rect = root.getBoundingClientRect();
  const cssWidth = rect.width || window.innerWidth;
  const cssHeight = rect.height || window.innerHeight;
  return physicalSize(cssWidth, cssHeight, window.devicePixelRatio);
}

/**
 * Keeps the canvas backing store at CSS size × DPR on resize and rotation.
 * Scenes listen to Phaser's scale 'resize' event to recompute camera zoom.
 */
export function watchViewport(game: Phaser.Game, root: HTMLElement): () => void {
  let frame = 0;
  let lateCheck = 0;

  const apply = (): void => {
    frame = 0;
    const size = measureViewport(root);
    if (size.width !== game.scale.width || size.height !== game.scale.height) {
      game.scale.resize(size.width, size.height);
    }
  };

  const schedule = (): void => {
    if (!frame) frame = requestAnimationFrame(apply);
    // iOS sometimes reports the old size right after rotating; check again.
    window.clearTimeout(lateCheck);
    lateCheck = window.setTimeout(apply, 350);
  };

  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  window.visualViewport?.addEventListener('resize', schedule);

  return () => {
    window.removeEventListener('resize', schedule);
    window.removeEventListener('orientationchange', schedule);
    window.visualViewport?.removeEventListener('resize', schedule);
    cancelAnimationFrame(frame);
    window.clearTimeout(lateCheck);
  };
}
