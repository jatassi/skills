// Tiny DOM helpers shared by the round page's modules.

export type Child = Node | string | false | undefined | null;
type Prop = string | boolean | undefined | ((event: Event) => void);

/**
 * Creates an element. Props starting with `on` add listeners; `true` sets an
 * empty attribute; `false` and `undefined` leave the attribute off.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, Prop>> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === 'function') element.addEventListener(key.replace(/^on/, ''), value);
    else if (value === true) element.setAttribute(key, '');
    else if (typeof value === 'string') element.setAttribute(key, value);
  }
  for (const child of children) {
    if (child === false || child === undefined || child === null) continue;
    element.append(child);
  }
  return element;
}

/** Replaces an element's children, skipping the empty ones. */
export function fill(parent: Element, children: Child[]): void {
  parent.replaceChildren(...children.filter((child): child is Node | string => Boolean(child)));
}

/** Server-rendered Markdown (raw HTML already escaped) in a wrapper. */
export function html(className: string, markup: string): HTMLDivElement {
  const element = h('div', { class: className });
  element.innerHTML = markup;
  return element;
}

/** Plain text of server-rendered Markdown. */
export function plain(markup: string): string {
  const element = document.createElement('div');
  element.innerHTML = markup;
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** A key cap after a control's label; hidden from its accessible name. */
export function kbd(key: string): HTMLElement {
  return h('kbd', { 'aria-hidden': 'true' }, key);
}

// 16px stroke glyphs from the round-page prototype's design records.
const ICONS = {
  check: '<path d="M3.5 8.5l3 3 6-7"/>',
  done: '<circle cx="8" cy="8" r="6.25"/><path d="M5.3 8.2l1.8 1.8 3.7-4"/>',
  open: '<circle cx="8" cy="8" r="6.25"/>',
  help: '<circle cx="8" cy="8" r="6.25"/><path d="M6.4 6.3a1.7 1.7 0 1 1 2.4 1.6c-.5.2-.8.6-.8 1.1v.3"/><path d="M8 11.3v.1" stroke-width="2"/>',
  pen: '<path d="M10.4 2.9l2.7 2.7-7.3 7.3H3.1v-2.7z"/><path d="M8.8 4.5l2.7 2.7"/>',
  down: '<path d="M4 6l4 4 4-4"/>',
  right: '<path d="M6 4l4 4-4 4"/>',
  left: '<path d="M10 4L6 8l4 4"/>',
  up: '<path d="M8 12.75v-9.5M4.25 7L8 3.25 11.75 7"/>',
  tree: '<path d="M2.75 3.5h4.5M4.5 3.5v8.75h3.25M4.5 8h3.25"/><circle cx="10.5" cy="8" r="1.6"/><circle cx="10.5" cy="12.25" r="1.6"/>',
  sun: '<circle cx="8" cy="8" r="2.75"/><path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1 1M11.4 11.4l1 1M3.6 12.4l1-1M11.4 4.6l1-1"/>',
  moon: '<path d="M13.25 9.6A5.5 5.5 0 1 1 6.4 2.75a4.4 4.4 0 0 0 6.85 6.85z"/>',
  x: '<path d="M4 4l8 8M12 4l-8 8"/>',
  comment: '<path d="M2.75 3.25h10.5v7.5h-5.5l-3 2.5v-2.5h-2z"/>',
  lock: '<rect x="3.75" y="7.25" width="8.5" height="6" rx="1.25"/><path d="M5.75 7.25V5.5a2.25 2.25 0 0 1 4.5 0v1.75"/>',
  terminal: '<rect x="2.25" y="3" width="11.5" height="10" rx="1.5"/><path d="M5 6.5l2 1.75-2 1.75M8.5 10.25h2.5"/>',
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName): SVGSVGElement {
  const holder = document.createElement('span');
  holder.innerHTML = `<svg class="i" viewBox="0 0 16 16" aria-hidden="true">${ICONS[name]}</svg>`;
  return holder.firstChild as SVGSVGElement;
}
