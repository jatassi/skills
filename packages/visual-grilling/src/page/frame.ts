// The frame around every illustration and mockup: title, kind, a Comment
// toggle, the block itself, its pinned comments and their threads.
//
// A frame outlives page re-renders (the page keeps one per illustration for
// the round), so a block draws once, not on every click. The page pushes
// comment state into it with `sync`.

import { resolveAnchor, targetText, type Anchor, type AnchorSubject } from '../core/anchor.ts';
import type { PageIllustration } from '../core/protocol.ts';
import type { PageComment } from '../core/submission.ts';
import { takeSnapshot } from './anchor-snapshot.ts';
import { blockFor, type BlockContext } from './blocks/index.ts';

export interface FrameSubject {
  /** For a mockup, a stand-in `html` illustration of its source. */
  illustration: PageIllustration;
  /** The option letter, for a mockup. */
  option?: string;
  title: string;
  /** What the caption calls the kind. */
  kindLabel: string;
}

export interface FrameView {
  /** This frame's comments, with their numbers within the question. */
  comments: { number: number; comment: PageComment }[];
  /** The number the next comment on this question will get. */
  nextNumber: number;
  commenting: boolean;
  readOnly: boolean;
}

export interface FrameHooks {
  toggleCommenting(): void;
  addComment(comment: PageComment): void;
  removeComment(comment: PageComment): void;
}

export class IllustrationFrame {
  readonly element: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly content: HTMLDivElement;
  private readonly pins: HTMLDivElement;
  private readonly threads: HTMLOListElement;
  private readonly composer: HTMLDivElement;
  private view: FrameView = { comments: [], nextNumber: 1, commenting: false, readOnly: false };
  private pending?: Anchor;
  /** The pending anchor the composer was built for. */
  private composerFor?: Anchor;
  private drawing = 0;

  constructor(
    private readonly subject: FrameSubject,
    private readonly hooks: FrameHooks,
  ) {
    this.toggle = el('button', 'comment-toggle');
    this.toggle.type = 'button';
    this.toggle.append('Comment', el('kbd', 'key', 'M'));
    this.toggle.setAttribute('aria-label', `Comment on ${subject.title}`);
    this.toggle.addEventListener('click', () => hooks.toggleCommenting());

    this.pins = el('div', 'pins');
    this.pins.setAttribute('aria-hidden', 'true');
    this.content = el('div', 'block-content');
    this.content.append(el('div', 'block'), this.pins);
    this.content.addEventListener('click', (event) => this.pick(event), { capture: true });

    const stage = el('div', 'stage');
    stage.append(this.content);

    this.threads = el('ol', 'threads');
    this.threads.setAttribute('aria-label', `Comments on ${subject.title}`);
    this.composer = el('div', 'composer');

    const caption = el('figcaption');
    caption.append(el('span', 'title', subject.title), el('span', 'kind', subject.kindLabel), this.toggle);

    this.element = el('figure', `illustration kind-${subject.illustration.kind}`);
    this.element.setAttribute('aria-label', subject.title);
    this.element.append(caption, stage, this.composer, this.threads);
    void this.draw();
  }

  /**
   * Draws (or redraws) the block into a fresh target, so a slower earlier
   * draw can only write into a target that is no longer shown. A failure
   * shows in the frame.
   */
  async draw(): Promise<void> {
    const run = ++this.drawing;
    const { illustration } = this.subject;
    const context: BlockContext = { theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark' };
    const target = el('div', 'block');
    this.content.firstElementChild!.replaceWith(target);
    try {
      await blockFor(illustration.kind).render(target, illustration, context);
    } catch (error) {
      if (run !== this.drawing) return;
      const message = error instanceof Error ? error.message : String(error);
      const alert = el('p', 'block-error', `This ${this.subject.kindLabel} failed to draw: ${message}`);
      alert.setAttribute('role', 'alert');
      target.replaceChildren(alert);
    }
  }

  sync(view: FrameView): void {
    this.view = view;
    const canComment = view.commenting && !view.readOnly;
    if (!canComment) this.pending = undefined;
    this.toggle.setAttribute('aria-pressed', String(view.commenting));
    this.toggle.disabled = view.readOnly;
    this.element.classList.toggle('commenting', canComment);

    this.pins.replaceChildren(
      ...view.comments.map(({ number, comment }) => pin(number, comment)),
      ...(this.pending ? [pin(view.nextNumber, this.pending, 'pending')] : []),
    );

    this.threads.replaceChildren(
      ...view.comments.map(({ number, comment }) => {
        const item = el('li', 'thread');
        const remove = el('button', 'ghost', 'Delete');
        remove.type = 'button';
        remove.setAttribute('aria-label', `Delete comment ${number}`);
        remove.addEventListener('click', () => this.hooks.removeComment(comment));
        const body = el('div');
        body.append(el('code', 'anchor-text', targetText(comment.target)), el('p', undefined, comment.text));
        item.append(el('span', 'pin', String(number)), body, ...(view.readOnly ? [] : [remove]));
        return item;
      }),
    );
    this.threads.hidden = view.comments.length === 0;
    this.renderComposer();
  }

  /** Drops an unsaved comment; true when there was one. */
  cancel(): boolean {
    if (!this.pending) return false;
    this.pending = undefined;
    this.sync(this.view);
    return true;
  }

  private pick(event: MouseEvent): void {
    if (!this.view.commenting || this.view.readOnly) return;
    event.preventDefault();
    event.stopPropagation();
    const renderer = blockFor(this.subject.illustration.kind);
    const snapshot = takeSnapshot(event.target as Element, this.content, event.clientX, event.clientY, renderer.peers);
    this.pending = resolveAnchor(snapshot, this.anchorSubject(), renderer.anchor);
    this.sync(this.view);
    this.composer.querySelector('textarea')?.focus();
  }

  private anchorSubject(): AnchorSubject {
    const { illustration, option } = this.subject;
    if (option) return { option };
    return { illustration: { id: illustration.id, kind: illustration.kind, ...(illustration.title ? { title: illustration.title } : {}) } };
  }

  private renderComposer(): void {
    const anchor = this.pending;
    if (!anchor) {
      this.composerFor = undefined;
      this.composer.replaceChildren();
      this.composer.hidden = true;
      return;
    }
    // Keep a half-typed comment across re-renders of the same pending spot.
    if (this.composerFor === anchor) return;

    const what = targetText(anchor.target);
    const textarea = el('textarea');
    textarea.setAttribute('aria-label', `Comment on ${what}`);
    textarea.placeholder = 'Say what you think about this spot';
    const save = el('button', 'comment-save', 'Add comment');
    save.type = 'button';
    const cancel = el('button', 'ghost', 'Cancel');
    cancel.type = 'button';

    const submit = () => {
      const text = textarea.value.trim();
      if (!text) return textarea.focus();
      this.pending = undefined;
      this.hooks.addComment({ ...anchor, text });
    };
    save.addEventListener('click', submit);
    cancel.addEventListener('click', () => this.cancel());
    textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        event.stopPropagation();
        submit();
      } else if (event.key === 'Escape') {
        event.stopPropagation();
        this.cancel();
      }
    });

    const actions = el('div', 'composer-actions');
    actions.append(cancel, save);
    const head = el('div', 'composer-head');
    head.append(el('span', 'pin', String(this.view.nextNumber)), el('code', 'anchor-text', what));
    this.composerFor = anchor;
    this.composer.replaceChildren(head, textarea, actions);
    this.composer.hidden = false;
  }
}

function pin(number: number, anchor: Anchor, extra?: string): HTMLElement {
  const element = el('span', `pin${extra ? ` ${extra}` : ''}`, String(number));
  element.style.left = `${anchor.position.x}%`;
  element.style.top = `${anchor.position.y}%`;
  return element;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
