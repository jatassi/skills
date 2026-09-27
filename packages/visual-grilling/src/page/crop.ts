// Crops for weak anchor matches: a small picture of where the user clicked,
// for when words ("unlabeled shape near …") aren't enough. Rasterised with
// html-to-image (fonts skipped: no font fetches, and nothing to fetch them
// from in a sandboxed frame). The page uses it for blocks it draws itself;
// the frame script uses it inside a sandboxed frame, where the page can't reach.

import { toCanvas } from 'html-to-image';
import type { Anchor, Box } from '../core/anchor.ts';

const PAD = 16;
const MIN = { w: 160, h: 100 };
const MAX = { w: 480, h: 320 };
const AROUND_CLICK = { w: 320, h: 200 };

/**
 * The part of the illustration to crop, relative to its root: the target's
 * box with some margin when it has a modest one, else a region around the
 * click. Always inside the root.
 */
export function cropRect(anchor: Pick<Anchor, 'box' | 'position'>, root: { w: number; h: number }): Box {
  const click = { x: (anchor.position.x / 100) * root.w, y: (anchor.position.y / 100) * root.h };
  const { box } = anchor;
  let rect: Box;
  if (box && box.w > 0 && box.h > 0 && box.w + 2 * PAD <= MAX.w && box.h + 2 * PAD <= MAX.h) {
    const w = Math.max(MIN.w, box.w + 2 * PAD);
    const h = Math.max(MIN.h, box.h + 2 * PAD);
    rect = { x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w, h };
  } else {
    rect = { x: click.x - AROUND_CLICK.w / 2, y: click.y - AROUND_CLICK.h / 2, ...AROUND_CLICK };
  }
  const w = Math.min(rect.w, root.w);
  const h = Math.min(rect.h, root.h);
  return {
    x: Math.round(Math.max(0, Math.min(rect.x, root.w - w))),
    y: Math.round(Math.max(0, Math.min(rect.y, root.h - h))),
    w: Math.round(w),
    h: Math.round(h),
  };
}

/**
 * Rasterises `node` and cuts out `rect`, given relative to `origin` (the
 * anchoring root, which `node` sits in). Resolves to a PNG data URL, or null
 * when the region is empty or the drawing fails.
 */
export async function rasterCrop(
  node: HTMLElement,
  origin: Element,
  rect: Box,
  options: { backgroundColor?: string; filter?: (node: HTMLElement) => boolean } = {},
): Promise<string | null> {
  if (rect.w <= 0 || rect.h <= 0) return null;
  try {
    const ratio = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
    const canvas = await toCanvas(node, { skipFonts: true, pixelRatio: ratio, cacheBust: false, ...options });
    const nodeBox = node.getBoundingClientRect();
    const originBox = origin.getBoundingClientRect();
    const dx = nodeBox.left - originBox.left;
    const dy = nodeBox.top - originBox.top;
    const out = document.createElement('canvas');
    out.width = Math.round(rect.w * ratio);
    out.height = Math.round(rect.h * ratio);
    const context = out.getContext('2d');
    if (!context) return null;
    if (options.backgroundColor) {
      context.fillStyle = options.backgroundColor;
      context.fillRect(0, 0, out.width, out.height);
    }
    context.drawImage(
      canvas,
      (rect.x - dx) * ratio,
      (rect.y - dy) * ratio,
      rect.w * ratio,
      rect.h * ratio,
      0,
      0,
      out.width,
      out.height,
    );
    return out.toDataURL('image/png');
  } catch {
    return null;
  }
}
