// The thin DOM layer under anchoring: turns a click into a plain snapshot the
// pure resolver (src/core/anchor.ts) reads. It needs nothing else, so the frame
// script for sandboxed agent HTML can bundle it too and post the snapshot out
// (its one import is types only).

import type { Snapshot, SnapshotElement } from '../core/anchor.ts';

const KEPT_ATTRIBUTES = new Set(['id', 'role', 'class', 'placeholder', 'name', 'type', 'alt', 'href', 'value']);
const SKIPPED = /^(style|script|title)$/i;

/**
 * Snapshots a click on `target` inside `root` (the illustration's own content).
 * `peers` is a CSS selector for elements a block adapter needs to see besides
 * the clicked chain.
 */
export function takeSnapshot(target: Element, root: Element, clientX: number, clientY: number, peers?: string): Snapshot {
  const rootBox = root.getBoundingClientRect();
  const relative = (rect: DOMRect) => ({
    x: Math.round(rect.left - rootBox.left),
    y: Math.round(rect.top - rootBox.top),
    w: Math.round(rect.width),
    h: Math.round(rect.height),
  });

  const chain: SnapshotElement[] = [];
  for (let element: Element | null = target; element; element = element.parentElement) {
    const titleChild = [...element.children].find((child) => child.tagName.toLowerCase() === 'title');
    chain.push({
      tag: element.tagName.toLowerCase(),
      attrs: keptAttributes(element),
      text: visibleText(element).slice(0, 140),
      title: titleChild?.textContent?.trim() || null,
      nth: nthOfKind(element, root),
      box: relative(element.getBoundingClientRect()),
    });
    if (element === root) break;
  }

  const peerList = peers
    ? [...root.querySelectorAll(peers)].slice(0, 400).map((element) => ({
        tag: element.tagName.toLowerCase(),
        attrs: keptAttributes(element),
        text: (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
      }))
    : [];

  const svgs = [...root.querySelectorAll('svg')];
  const texts: Snapshot['texts'] = [];
  for (const element of root.querySelectorAll('*')) {
    if (texts.length >= 300) break;
    if (element.children.length > 0 || SKIPPED.test(element.tagName)) continue;
    const text = visibleText(element);
    if (text && text.length <= 40) {
      texts.push({ text, box: relative(element.getBoundingClientRect()), svg: svgIndex(svgs, element) });
    }
  }

  return {
    chain,
    root: { w: Math.round(rootBox.width), h: Math.round(rootBox.height) },
    click: { x: Math.round(clientX - rootBox.left), y: Math.round(clientY - rootBox.top) },
    selector: cssPath(target, root),
    peers: peerList,
    texts,
    clickSvg: svgIndex(svgs, target),
  };
}

function keptAttributes(element: Element): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const attribute of element.attributes) {
    const { name } = attribute;
    if (KEPT_ATTRIBUTES.has(name) || name.startsWith('data-') || name.startsWith('aria-')) {
      attrs[name] = attribute.value.slice(0, 200);
    }
  }
  return attrs;
}

function visibleText(element: Element): string {
  let out = '';
  const walk = (node: Node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) out += `${child.nodeValue} `;
      else if (child.nodeType === Node.ELEMENT_NODE && !SKIPPED.test((child as Element).tagName)) walk(child);
    }
  };
  walk(element);
  return out.replace(/\s+/g, ' ').trim();
}

function nthOfKind(element: Element, root: Element): SnapshotElement['nth'] {
  const cls = (element.getAttribute('class') ?? '').trim().split(/\s+/)[0];
  if (!cls) return null;
  const same = [...root.querySelectorAll(`${element.tagName.toLowerCase()}.${CSS.escape(cls)}`)];
  return { cls, i: same.indexOf(element), of: same.length };
}

function svgIndex(svgs: SVGSVGElement[], element: Element): number {
  const svg = element.closest('svg');
  return svg ? svgs.indexOf(svg) : -1;
}

function cssPath(target: Element, root: Element): string {
  const parts: string[] = [];
  for (let element: Element | null = target; element && element !== root; element = element.parentElement) {
    const tag = element.tagName.toLowerCase();
    if (element.id) {
      parts.unshift(`${tag}#${CSS.escape(element.id)}`);
      break;
    }
    const siblings = element.parentElement
      ? [...element.parentElement.children].filter((child) => child.tagName === element!.tagName)
      : [];
    const cls = (element.getAttribute('class') ?? '').trim().split(/\s+/)[0];
    const nth = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(element) + 1})` : '';
    parts.unshift(`${tag}${cls ? `.${CSS.escape(cls)}` : ''}${nth}`);
  }
  return parts.join(' > ');
}
