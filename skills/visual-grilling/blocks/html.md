# `html` illustrations and mockups

Raw HTML isn't a block. It is an illustration you write in full, for what no block fits, and it is how every option mockup is written. Each one runs in its own sandboxed frame, sized to its content, with Tailwind loaded.

## Fit and readability

- Keep it self-contained, with inline styles, scripts, SVG and data, and images as `data:` URIs. Claude's built-in browser blocks every network request a frame makes, and grilling works offline, so a CDN script, font or image never loads there and may fail elsewhere. The script errors that follow reach you as ⚠ warnings under the question. If you do load a CDN script, give it `crossorigin`, or its errors arrive only as "Script error.".
- The frame has an opaque origin, so `localStorage`, `sessionStorage`, IndexedDB and cookies throw. Keep state in variables.
- Let the content set the height. The frame grows to fit, so `h-screen` and `100vh` measure the frame rather than the page. Keep it about a screen tall or less.
- Tailwind's preflight reset applies: headings are unstyled, lists have no bullets, and buttons have no chrome. Style what you show with Tailwind classes.
- Set `tailwind=false` only when reproducing existing CSS that the reset would break.
- Leave focus on the page, without `autofocus` or `focus()` calls. While focus is inside a frame, the page's keyboard shortcuts don't work.

## Mockups

A mockup sits under its option and shows as one card in a side-by-side row. Each card can be as narrow as 220 px.

- Draw every option's mockup at the same size, fidelity and level of detail, so the comparison is about the difference between the options.
- Show the part of the screen that differs, plus just enough surrounding context to place it.
- Use the same content in every mockup, so only the design changes.

## Anchors

Name the parts the user may comment on with `data-anchor="<name>"`, in kebab-case and unique within one illustration or mockup (`present` rejects a duplicate). A comment comes back as `html "Error banner" → button retry-button "Retry"` (the element, your name and its text), or with `mockup B` in place of `html "Error banner"` for a mockup. Without a `data-anchor`, a comment uses the element's `id`, `aria-label` or SVG `<title>`, then its nearby text and the click position. An `id` that looks generated, such as one with three digits in a row, is skipped.

## Preset marks

Use the [theme tokens](../illustrating.md#theme-tokens) so your HTML follows the theme: `accent-green` for recommended, `accent-red` for risk, and `fg-muted` or `opacity-60` for muted.

```html id=error-banner title="Error banner"
<div data-anchor="banner" class="rounded border border-accent-red bg-surface-2 p-3 text-fg">
  Upload failed. <button data-anchor="retry-button" class="text-accent-blue">Retry</button>
</div>
```

## Theme override

Hard-coded colours override the theme and stay fixed in both themes. If your text would be unreadable on dark, the frame falls back to the light backdrop, and the user can toggle it by hand.
