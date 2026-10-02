// Horizontal swipes as step commands: a two-finger trackpad swipe arrives as
// horizontal wheel events, a finger swipe as touch events. Swiping left (content
// moving left) goes to the next step, right to the previous one.
//
// A swipe that starts over something that scrolls sideways itself (a wide code
// block or table) scrolls that instead, and one that starts in a text box is
// left alone.

export type SwipeDirection = 'next' | 'previous';

/** Wheel travel that makes a trackpad swipe, in pixels. */
const WHEEL_DISTANCE = 80;
/** Quiet time that ends a trackpad gesture, momentum included, in ms. */
const WHEEL_SETTLE = 220;
/** Finger travel that makes a touch swipe, in pixels. */
const TOUCH_DISTANCE = 60;

export function onSwipe(area: HTMLElement, handler: (direction: SwipeDirection) => void): void {
  // Trackpad. One gesture moves at most one step: after it fires, the rest of
  // the gesture and its momentum are swallowed until the wheel goes quiet.
  let travel = 0;
  let fired = false;
  let settle: ReturnType<typeof setTimeout> | undefined;
  area.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      if (ignored(event.target, event.deltaX)) return;
      // Keeps the browser's own back/forward swipe from taking it.
      event.preventDefault();
      clearTimeout(settle);
      settle = setTimeout(() => {
        travel = 0;
        fired = false;
      }, WHEEL_SETTLE);
      if (fired) return;
      travel += event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaX * 16 : event.deltaX;
      if (Math.abs(travel) < WHEEL_DISTANCE) return;
      fired = true;
      handler(travel > 0 ? 'next' : 'previous');
    },
    { passive: false },
  );

  // Touch. A swipe is mostly sideways; anything steeper is a scroll.
  let start: { x: number; y: number; target: EventTarget | null } | undefined;
  area.addEventListener(
    'touchstart',
    (event) => {
      const touch = event.touches[0];
      start = event.touches.length === 1 && touch ? { x: touch.clientX, y: touch.clientY, target: event.target } : undefined;
    },
    { passive: true },
  );
  area.addEventListener('touchcancel', () => (start = undefined), { passive: true });
  area.addEventListener(
    'touchend',
    (event) => {
      const touch = event.changedTouches[0];
      if (!start || !touch) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const target = start.target;
      start = undefined;
      if (Math.abs(dx) < TOUCH_DISTANCE || Math.abs(dx) < Math.abs(dy) * 2) return;
      if (ignored(target, -dx)) return;
      handler(dx < 0 ? 'next' : 'previous');
    },
    { passive: true },
  );
}

/** Whether a swipe from `target` belongs to it: a text box, or a sideways scroller with room to go `delta`'s way. */
function ignored(target: EventTarget | null, delta: number): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea, select, [contenteditable]')) return true;
  for (let el: Element | null = target; el; el = el.parentElement) {
    if (el.scrollWidth <= el.clientWidth) continue;
    const overflow = getComputedStyle(el).overflowX;
    if (overflow !== 'auto' && overflow !== 'scroll') continue;
    const room = delta > 0 ? el.scrollWidth - el.clientWidth - el.scrollLeft : el.scrollLeft;
    if (room > 1) return true;
  }
  return false;
}
