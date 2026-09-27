// The frame around every illustration and mockup: title, kind, a Comment
// toggle, the block itself, its pinned comments and their threads.
//
// A frame outlives page re-renders (the page keeps one per illustration for
// the round), so a block draws once, not on every click. The page pushes
// comment state into it with `sync`.
//
// A block that runs apart from the page (agent HTML in a sandboxed frame)
// stays live instead: the frame pushes theme, backdrop and comment mode into
// it, gets its clicks as snapshots, and asks it for crops.
//
// A block that reports its readability (agent HTML, or a drawing whose theme
// the agent overrode) gets the light backdrop when it is unreadable on dark,
// and the toggle for it. A block drawn on the page draws again when the
// backdrop changes, reading the light tokens it then sits on.

import { resolveAnchor, targetText, type Anchor, type AnchorSubject, type Snapshot } from '../core/anchor.ts';
import type { ThemeName } from '../core/frame-tokens.ts';
import type { PageIllustration } from '../core/protocol.ts';
import type { PageComment, PageWarning } from '../core/submission.ts';
import { takeSnapshot } from './anchor-snapshot.ts';
import { blockFor, type BlockContext, type BlockView } from './blocks/index.ts';
import { cropRect, rasterCrop } from './crop.ts';

const CROP_WAIT_MS = 5_000;

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
  /**
   * For the agent's warnings: a block that failed to draw on the page (once
   * per frame), or a script error in agent HTML.
   */
  reportWarning(kind: PageWarning['kind'], message: string): void;
}

export class IllustrationFrame {
  readonly element: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly backdropToggle: HTMLButtonElement;
  private readonly content: HTMLDivElement;
  private readonly pins: HTMLDivElement;
  private readonly threads: HTMLOListElement;
  private readonly composer: HTMLDivElement;
  private view: FrameView = { comments: [], nextNumber: 1, commenting: false, readOnly: false };
  private pending?: Anchor;
  /** The crop of a weak pending anchor, rasterised while the user types. */
  private pendingCrop?: Promise<string | null>;
  /** The pending anchor the composer was built for. */
  private composerFor?: Anchor;
  private drawing = 0;
  /** The drawn block, when it stays live (a sandboxed frame). */
  private live?: BlockView;
  /** The block's own verdict: unreadable on the dark backdrop. */
  private unreadable = false;
  /** Whether the block judges its readability at all (agent HTML, an overridden drawing). */
  private judged = false;
  /** The backdrop the current draw of a block that isn't live was made for. */
  private drawnBackdrop = false;
  /** The user's backdrop toggle, once used; until then the backdrop follows `unreadable`. */
  private backdropChoice?: boolean;
  private reported = false;

  constructor(
    private readonly subject: FrameSubject,
    private readonly hooks: FrameHooks,
  ) {
    this.toggle = el('button', 'comment-toggle');
    this.toggle.type = 'button';
    this.toggle.append('Comment', el('kbd', 'key', 'M'));
    this.toggle.setAttribute('aria-label', `Comment on ${subject.title}`);
    this.toggle.addEventListener('click', () => hooks.toggleCommenting());

    this.backdropToggle = el('button', 'comment-toggle backdrop-toggle', 'Light backdrop');
    this.backdropToggle.type = 'button';
    this.backdropToggle.hidden = true;
    this.backdropToggle.setAttribute('aria-label', `Light backdrop for ${subject.title}`);
    this.backdropToggle.addEventListener('click', () => {
      this.backdropChoice = !this.backdrop();
      this.pushState();
    });

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
    caption.append(
      el('span', 'title', subject.title),
      el('span', 'kind', subject.kindLabel),
      this.backdropToggle,
      this.toggle,
    );

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
    const current = () => run === this.drawing;
    const backdrop = this.backdrop();
    this.drawnBackdrop = backdrop;
    // Set before drawing: a block reads the page's tokens where it sits, light on the light backdrop.
    this.element.classList.toggle('light-backdrop', backdrop);
    const context: BlockContext = {
      theme: pageTheme(),
      backdrop,
      events: {
        pick: (snapshot) => {
          if (current()) this.pickSnapshot(snapshot);
        },
        readability: (unreadable) => {
          if (!current()) return;
          this.judged = true;
          this.unreadable = unreadable;
          this.pushState();
        },
        scriptError: (message) => {
          if (current()) this.hooks.reportWarning('script', message);
        },
      },
    };
    const target = el('div', 'block');
    this.content.firstElementChild!.replaceWith(target);
    this.live = undefined;
    try {
      const view = await blockFor(illustration.kind).render(target, illustration, context);
      if (!current()) return;
      this.live = view ?? undefined;
      this.pushState();
    } catch (error) {
      if (!current()) return;
      const message = error instanceof Error ? error.message : String(error);
      const alert = el('p', 'block-error', `This ${this.subject.kindLabel} failed to draw: ${message}`);
      alert.setAttribute('role', 'alert');
      target.replaceChildren(alert);
      if (!this.reported) {
        this.reported = true;
        this.hooks.reportWarning('draw', message);
      }
    }
  }

  /** The page theme changed: a live block follows it in place, any other draws again. */
  retheme(): void {
    if (this.live) this.pushState();
    else void this.draw();
  }

  /** Light backdrop: the user's choice, else automatic when the block is unreadable on dark. */
  private backdrop(): boolean {
    return this.backdropChoice ?? (this.unreadable && pageTheme() === 'dark');
  }

  private pushState(): void {
    const backdrop = this.backdrop();
    // A block drawn on the page draws again for a new backdrop, with the tokens it now sits on.
    if (!this.live && backdrop !== this.drawnBackdrop) return void this.draw();
    this.element.classList.toggle('light-backdrop', backdrop);
    // The toggle matters on dark only; on the light theme every backdrop is light.
    this.backdropToggle.hidden = !this.judged || pageTheme() !== 'dark';
    this.backdropToggle.setAttribute('aria-pressed', String(backdrop));
    this.live?.setState({
      theme: pageTheme(),
      backdrop,
      commenting: this.view.commenting && !this.view.readOnly,
    });
  }

  sync(view: FrameView): void {
    this.view = view;
    const canComment = view.commenting && !view.readOnly;
    if (!canComment) this.pending = undefined;
    this.toggle.setAttribute('aria-pressed', String(view.commenting));
    this.toggle.disabled = view.readOnly;
    this.element.classList.toggle('commenting', canComment);
    this.pushState();

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
    // The element clicked, even inside a block's shadow root (a diff file).
    const clicked = event.composedPath().find((node): node is Element => node instanceof Element) ?? (event.target as Element);
    this.pickSnapshot(takeSnapshot(clicked, this.content, event.clientX, event.clientY, renderer.peers));
  }

  /** A click, snapshotted here or inside a sandboxed frame, becomes the pending comment's anchor. */
  private pickSnapshot(snapshot: Snapshot): void {
    if (!this.view.commenting || this.view.readOnly) return;
    const { illustration } = this.subject;
    const { anchor: blockAnchor } = blockFor(illustration.kind);
    const anchor = resolveAnchor(snapshot, this.anchorSubject(), blockAnchor && ((shot) => blockAnchor(shot, illustration)));
    this.pending = anchor;
    this.pendingCrop = anchor.target.weak ? this.crop(anchor, snapshot.root) : undefined;
    this.sync(this.view);
    this.composer.querySelector('textarea')?.focus();
  }

  /** A weak match's crop: from the live block when it has its own document, else from the page. */
  private crop(anchor: Anchor, root: Snapshot['root']): Promise<string | null> {
    const rect = cropRect(anchor, root);
    if (this.live) return this.live.crop(rect);
    return rasterCrop(this.content, this.content, rect, {
      backgroundColor: getComputedStyle(this.element).backgroundColor,
      filter: (node) => !(node instanceof Element && node.classList.contains('pins')),
    });
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

    const crop = this.pendingCrop;
    let saving = false;
    const submit = async () => {
      const text = textarea.value.trim();
      if (!text) return textarea.focus();
      if (saving) return;
      saving = true;
      save.disabled = true;
      const cropImage = crop ? await within(crop, CROP_WAIT_MS) : null;
      // Cancelled, or replaced by another click, while the crop was drawn.
      if (this.pending !== anchor) return;
      this.pending = undefined;
      this.pendingCrop = undefined;
      this.hooks.addComment({ ...anchor, text, ...(cropImage ? { cropImage } : {}) });
    };
    save.addEventListener('click', () => void submit());
    cancel.addEventListener('click', () => this.cancel());
    textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        event.stopPropagation();
        void submit();
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

function pageTheme(): ThemeName {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/** The promise's value, or null when it takes longer than `ms`. */
function within<T>(promise: Promise<T | null>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((done) => setTimeout(() => done(null), ms))]);
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
