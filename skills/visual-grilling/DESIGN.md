---
name: Visual Grilling Round Page
description: A code-review-style decision surface for answering an agent's grilling round, one question at a time.
colors:
  canvas: "#0e1014"
  panel: "#151820"
  panel-raised: "#1a1e27"
  inset: "#0b0d11"
  hover: "#212631"
  line: "#2a303b"
  line-soft: "#20252e"
  line-strong: "#3a4250"
  text: "#e7eaf0"
  text-muted: "#a0a8b6"
  text-faint: "#7f8898"
  action-blue: "#5b95ff"
  action-blue-fill: "#2f6fe4"
  action-blue-fill-hover: "#3b7af0"
  verdict-green: "#49c27a"
  verdict-green-soft: "rgba(73,194,122,.11)"
  comment-purple: "#ad93fb"
  comment-purple-soft: "rgba(173,147,251,.13)"
  on-purple: "#150f24"
  unsure-amber: "#e5a843"
  unsure-amber-soft: "rgba(229,168,67,.11)"
  selection: "rgba(91,149,255,.32)"
typography:
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.35
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  body-small:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 500
    lineHeight: 1
    fontFeature: "tnum"
  mono:
    fontFamily: "ui-monospace, SF Mono, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1
  mono-key:
    fontFamily: "ui-monospace, SF Mono, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1
rounded:
  key: "4px"
  row: "5px"
  panel: "6px"
  popover: "8px"
  pill: "999px"
spacing:
  xxs: "4px"
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "16px"
components:
  button:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.panel}"
    padding: "0 12px"
    height: "30px"
  button-hover:
    backgroundColor: "{colors.hover}"
  button-primary:
    backgroundColor: "{colors.action-blue-fill}"
    textColor: "#ffffff"
    rounded: "{rounded.panel}"
    padding: "0 12px"
    height: "30px"
  button-primary-hover:
    backgroundColor: "{colors.action-blue-fill-hover}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.panel}"
    padding: "0 12px"
    height: "30px"
  button-small:
    padding: "0 10px"
    height: "26px"
  button-accepted:
    backgroundColor: "{colors.verdict-green-soft}"
    textColor: "{colors.verdict-green}"
    rounded: "{rounded.panel}"
    height: "26px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 8px"
    height: "22px"
  chip-answered:
    backgroundColor: "{colors.verdict-green-soft}"
    textColor: "{colors.verdict-green}"
  chip-commented:
    backgroundColor: "{colors.comment-purple-soft}"
    textColor: "{colors.comment-purple}"
  chip-unsure:
    backgroundColor: "{colors.unsure-amber-soft}"
    textColor: "{colors.unsure-amber}"
  question-panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.panel}"
    padding: "14px 16px 16px"
  question-panel-header:
    backgroundColor: "{colors.panel-raised}"
    typography: "{typography.title}"
    padding: "8px 12px"
    height: "44px"
  recommendation:
    backgroundColor: "{colors.panel-raised}"
    rounded: "{rounded.panel}"
    padding: "10px 10px 10px 12px"
  recommendation-accepted:
    backgroundColor: "{colors.verdict-green-soft}"
  option-row:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    padding: "10px 12px"
  option-row-picked:
    backgroundColor: "{colors.verdict-green-soft}"
  illustration-frame:
    backgroundColor: "{colors.inset}"
    rounded: "{rounded.panel}"
  text-answer:
    backgroundColor: "{colors.inset}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.panel}"
    padding: "10px 12px"
  review-bar:
    backgroundColor: "{colors.panel}"
    padding: "0 12px"
    height: "48px"
  step-tab:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    typography: "{typography.label}"
    padding: "0 10px"
    height: "36px"
  step-tab-current:
    textColor: "{colors.text}"
  key-hint:
    backgroundColor: "{colors.inset}"
    textColor: "{colors.text-faint}"
    typography: "{typography.mono-key}"
    rounded: "{rounded.key}"
    padding: "2px 4px 1px"
  comment-pin:
    backgroundColor: "{colors.comment-purple}"
    textColor: "{colors.on-purple}"
    typography: "{typography.mono-key}"
    height: "20px"
  popover:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.popover}"
    padding: "12px"
---

# Design System: Visual Grilling Round Page

## Overview

**Creative North Star: "The Pull-Request Review"**

Answering a round is reviewing a change. Each question is a file in the diff: a header row carrying its state, the agent's prose, the recommendation as the proposed change, the illustration as evidence, and a verdict. Comments pin to exact elements inside the illustration the way review comments pin to lines. Nothing is sent until one deliberate "Submit round", the way a review is submitted once.

The world is a near-black canvas with panels one tonal step up, drawn with 1px hairlines and a single 6px corner. It is dense and keyboard-first: every answering action has a one-letter key shown in a small keycap beside its label. Colour is almost entirely withheld from structure and spent on meaning: blue means "act" (the primary action and focus), green means "decided", purple means "commented", amber means "unsure". The shipped structure is one question at a time: a tab strip of questions with a final Review step, one panel per step.

The system refuses the rounded, shadowed questionnaire card stack. Dark is the default theme; a light theme exists as an alternative with the same roles.

**Key Characteristics:**
- Near-black canvas, panels one step lighter, 1px hairlines, 6px corners.
- Colour carries state only: blue act, green decided, purple commented, amber unsure.
- Keyboard first, with keycaps printed next to every answerable action.
- System sans for everything read; mono only for ids, keys, figures, kinds and anchor paths.
- Flat at rest; only floating layers (popovers, drawers, pins) cast shadows.
- Agent content is quarantined: sandboxed frames on an inset well, with a readable backdrop guaranteed.

## Colors

A neutral cool-grey ramp does all the structural work, and four signal hues are spent only on state.

### Primary
- **Action Blue** (action-blue-fill for fills, action-blue for strokes): the Submit round button, keyboard focus rings (2px outline, 2px offset), the textarea focus border and its 3px halo, the caret. Nothing else.

### Secondary
- **Verdict Green** (verdict-green, with verdict-green-soft as a wash): every answered state. Accepted recommendation, a picked option, an own answer, the "Accepted" button, answered chips and step icons, the sent-round pulse dot.

### Tertiary
- **Comment Purple** (comment-purple, comment-purple-soft): anchored comments only. Comment mode button when on, the hover box over an anchorable element, pins, the comment count, "comments only" chips.
- **Unsure Amber** (unsure-amber, unsure-amber-soft): the unsure state and the warning that unanswered questions will be sent as unsure.

### Neutral
- **Canvas** (canvas): the page ground.
- **Panel** (panel): question panels, the review bar, popovers, illustration title bars, drawers.
- **Panel Raised** (panel-raised): panel headers, the recommendation block, default buttons.
- **Inset Well** (inset): illustration stages, text answers, keycaps, inline code. Sits below the panel, not above it.
- **Hover** (hover): hover and current-row fill.
- **Hairlines** (line, line-soft, line-strong): line is the default 1px border; line-soft divides rows inside a container; line-strong marks the current panel and popover edges.
- **Ink** (text, text-muted, text-faint): primary text, secondary text and descriptions, tertiary metadata and placeholders.

### Named Rules
**The Blue Means Act Rule.** Blue appears only on the primary action (Submit round) and on focus. Selected tabs, picked options and current rows never turn blue; the current step tab is marked with a text-coloured underline.

**The Green Is Decided Rule.** Every answered state is green, whichever way it was answered. Accepting, picking an option and writing an own answer are one colour, because to the round they are one thing: a verdict.

**The Soft Wash Rule.** A signal hue fills a surface only as its soft wash (roughly 11-13% alpha) with a border of the hue mixed to 35-40% alpha; solid signal fills are reserved for Submit and comment pins.

## Typography

**Body Font:** system sans (-apple-system, BlinkMacSystemFont, Segoe UI, system-ui)
**Label/Mono Font:** system mono (ui-monospace, SF Mono, Menlo, Consolas)

**Character:** A tool's typography, not a publication's. One system sans in a tight 11-15px band, with weight (600) rather than size doing the hierarchy work; mono is a data type, never a voice.

### Hierarchy
- **Headline** (600, 15px): the Review step heading. The largest type on the page.
- **Title** (600, 14px, 1.35): question titles in panel headers, option labels, review row titles. Titles on non-current panels drop to text-muted.
- **Body** (400, 14px, 1.5): question prose (max 72ch), recommendation text, text answers.
- **Body Small** (400, 13px, 1.45): option descriptions, review summaries, banners, warnings, table cells.
- **Label** (500, 12-13px, tabular figures): buttons (13px), small buttons and counts (12.5px), chips (12px).
- **Mono** (500, 11-12px): question numbers (Q1), option letters, keycaps, illustration kind, comment anchor paths, tree metadata.

### Named Rules
**The Mono Is Data Rule.** Mono sets ids, keys, figures, kinds and paths. It never sets prose, titles or labels.

**The Tabular Count Rule.** Every count that changes while the user works ("0 / 6 answered", comment counts, pins, chip labels) uses tabular figures so it does not jitter.

## Layout

A single centred column (max 880px) under a sticky 48px review bar, with 16px page padding and 112px of bottom clearance. The primary target is a narrow side pane (about 480-700px); at 1080px and above a 300px design-tree side column appears to the right, bordered by a hairline. Below 1080px the tree is a left drawer (min(320px, 88vw)) opened from the bar.

The shipped structure is one question at a time: a horizontally scrolling tab strip (Q1...Qn, then Review) with a hairline under it, one question panel, and a Previous / Next row beneath (Next becomes "Review round" on the last question). The Review step lists every question with its state icon, number, title, one-line summary and an Edit button, then the unanswered warning and Submit round.

Inside a question panel the order is fixed: header (state icon, Q number, title, state chip), prose, recommendation with Accept, illustration, options, then the own-answer / unsure row. Vertical rhythm inside the panel runs on 10px between answer parts, 14-16px before the recommendation and illustration.

Responsive reductions, not reflows: under 700px the round subject leaves the bar; under 600px the tab strip fades at its right edge; under 520px the recommendation wraps with Accept pushed right; under 480px the illustration kind and button labels drop to icons; under 440px "answered" drops from the count.

Spacing steps are 4, 6, 8, 10, 12, 16px; control heights are 22 (chip), 26 (small button), 30 (button), 36 (tab), 44 (panel header), 48 (bar).

## Elevation & Depth

Flat by default. Depth comes from tonal layering: canvas, then panel, then panel-raised for headers; illustration stages and inputs sink to the inset well below the panel. Borders do the separating. Only layers that float above the page cast a shadow.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 6px 16px rgba(0,0,0,.45), 0 1px 3px rgba(0,0,0,.3)`; light theme `0 6px 16px rgba(20,24,32,.12), 0 1px 3px rgba(20,24,32,.08)`): popovers (comment composer, submit summary, round menu), the tree drawer.
- **Pin lift** (`box-shadow: 0 2px 6px rgba(0,0,0,.35)`): comment pins sitting on an illustration.

### Named Rules
**The Only-Floaters-Cast Rule.** Panels, cards, buttons and chips never have shadows. A shadow means the element floats over other content.

## Shapes

One corner: 6px on panels, buttons, the recommendation, option groups, illustrations, text answers and banners. Smaller surfaces step down (4px keycaps and inline code, 5px menu and tree rows); popovers step up to 8px. Chips and tags are full pills. Comment pins are a speech-bubble teardrop (10px corners with a 2px tail corner at bottom left). Borders are always 1px hairlines; keycaps and option letters get a 2px bottom border to read as keys. Containers with rows (options, review list) clip to their corner and divide rows with line-soft instead of gaps. Icons are drawn 16px stroke glyphs (1.5 stroke, round caps and joins), 14px inside chips.

## Components

### Buttons
Quiet, compact, labelled with their key.
- **Shape:** 6px corners, 30px high (26px small), 12px side padding (10px small), 500 weight 13px label, 6px icon gap.
- **Default:** panel-raised fill, hairline border; hover to the hover fill and line-strong border; pressed nudges down 0.5px; disabled at 45% opacity.
- **Primary:** Action Blue fill, white label, no border. One per screen: Submit round (in the bar and on the Review step).
- **Ghost:** transparent, text-muted, filling on hover. Used for secondary actions: Write my own answer, Unsure, Previous, theme, tree toggle.
- **State-on variants:** Accepted (green wash and green border), Unsure on (amber wash), Comment on (purple wash, label "Done").
- **Keycap:** a mono 10.5px key in an inset box with a 2px bottom border sits after the label (Accept ↵, Comment M, Write W, Unsure U, Previous K, Next J, Submit ⌘↵). Keycaps hide on non-current panels.

### Chips
- **Style:** 22px pills, hairline border, 12px label with tabular figures, 14px icon.
- **State:** "No answer" is neutral; answered chips (Accepted, Picked B, Own answer) are green; "Comments only · n" is purple; Unsure is amber. On becoming answered the check draws itself in (0.32s).

### Question Panel
- **Corner Style:** 6px, with the header carrying the top corners.
- **Background:** panel body, panel-raised header with a hairline under it.
- **Border:** line; line-strong on the current panel.
- **Header:** state icon, mono Q number, title (600, 14px), and the state chip pushed right; min 44px high.
- **Internal Padding:** 14px 16px 16px.

### Recommendation Block
The cheapest action on the page. A panel-raised box labelled "Recommended" (600, text-muted), an optional option-letter key, the recommendation text, and a small Accept button with ↵. Once accepted the whole block turns green-washed and the label reads "Accepted" in green.

### Options
A single bordered group of rows (radiogroup), divided by line-soft hairlines. Each row: a 14px radio, the option letter as a keycap, a 600 label and a 13px muted description. Hover fills with hover; the picked row takes the green wash, a green filled radio and a green keycap. The option's own letter picks it.

### Inputs / Fields
- **Style:** own-answer textarea on the inset well, hairline border, 6px corners, 10px 12px padding, 14px body type, resizable, min 80px.
- **Focus:** border turns Action Blue with a 3px blue halo at 22%; caret blue.
- **Read-only answer:** shown as a green-washed paragraph labelled "Own answer".

### Illustration Frame
- A 6px bordered figure on the inset well with a panel-coloured title bar (38px min): title (600), mono kind ("mermaid", "vega-lite", "agent html"), and ghost controls (backdrop, full height, Comment M).
- **Mermaid:** renders at natural size. The frame caps at min(50vh, 440px), but a diagram within 1.5x the cap renders uncapped. Beyond that the bottom 72px fades out and a "Show full diagram" button sits centred at the cut.
- **Agent HTML:** runs in a sandboxed iframe (scripts only) sized to its content up to 520px. When its text contrast is below 3:1 on the dark backdrop, the frame switches automatically to a light backdrop, and the bar's backdrop button reads "Light · auto".
- **Comment mode:** crosshair cursor; a purple 1.5px hover box outlines the anchorable element; clicking opens the comment popover; pins (purple teardrops, numbered) mark comments, and a numbered thread list with mono anchor paths sits under the stage.
- **Loading:** a shimmering panel-raised skeleton, 180px.

### Navigation
- **Review bar:** sticky, 48px, panel fill, hairline under. Left: tree toggle, "Round n" menu button; the round subject in muted text; right: "answered / total" count with tabular figures and a purple comment count, theme toggle, Submit round.
- **Step tabs:** 36px, 13px 500 muted labels with a state icon; hover goes to text; the current tab is text-coloured with a 2px text-coloured underline sitting on the strip's hairline. The last tab is Review.
- **Design tree:** indented rows (16px per level with line-soft guides), state icons, mono Q or R metadata right-aligned; the current question's row takes the hover fill.

### Popovers
Panel fill, line-strong border, 8px corners, Float shadow. The comment composer (min(340px, 100vw - 24px)) shows the anchor path in mono above a textarea; the submit summary counts answers by state before confirming.

### Banners
A 6px bordered panel strip for round-level status: read-only past rounds (lock icon, "Back to round 3"), and the sent state with a green border and a pulsing green dot.

## Do's and Don'ts

### Do:
- **Do** keep blue for Submit round and focus only; mark the current tab or row with text colour and fill, not blue.
- **Do** paint every answered state green, whether accepted, picked or written.
- **Do** keep panel order fixed: header, prose, recommendation with Accept, illustration, options, own answer / unsure.
- **Do** print the key beside every answerable action: Enter accepts, the option's letter picks it, M comments, W writes, U unsure, J/K move, ⌘Enter submits.
- **Do** separate with 1px hairlines and tonal steps (canvas, panel, panel-raised, inset well) at 6px corners.
- **Do** render Mermaid at natural size, uncapped within 1.5x of min(50vh, 440px), faded with "Show full diagram" beyond.
- **Do** run agent HTML in a sandboxed frame and switch to a light backdrop automatically when its colours are unreadable on dark.
- **Do** open in dark; offer light as the alternative with the same roles.

### Don't:
- **Don't** put shadows on panels, buttons or chips; only popovers, drawers and pins float.
- **Don't** use a second accent for picked options or selected tabs.
- **Don't** set prose, titles or labels in mono.
- **Don't** fill a surface with a solid signal colour; use the soft wash with a tinted hairline.
- **Don't** stack rounded, shadowed questionnaire cards.
- **Don't** add per-question send buttons; the round goes back once.
