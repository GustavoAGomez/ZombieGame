/**
 * The merchant's coat (spec 03 §3): it breathes with the coat closed, opens
 * it when its shop opens, holds it open while the shop is open and closes it
 * (the same animation played backwards) when the shop closes. Pure: the view
 * feeds it whether the shop is open and whether the animation has finished.
 */
export type CoatState = 'closed' | 'opening' | 'open' | 'closing';

export function nextCoat(state: CoatState, shopOpen: boolean, animationDone: boolean): CoatState {
  switch (state) {
    case 'closed':
      return shopOpen ? 'opening' : 'closed';
    case 'opening':
      if (!shopOpen) return 'closing';
      return animationDone ? 'open' : 'opening';
    case 'open':
      return shopOpen ? 'open' : 'closing';
    case 'closing':
      if (shopOpen) return 'opening';
      return animationDone ? 'closed' : 'closing';
  }
}
