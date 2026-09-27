# `vega-lite` charts

Vega-Lite 6, written as JSON and drawn as SVG. Leave out `$schema`, since the page adds it.

## Data

- Put the values inline as JSON rows in `data.values`. Inline CSV, TSV or DSV strings, `url` data and raw Vega specs are rejected.
- Every field an encoding names must exist in the rows. A missing field draws nothing, and `present` rejects the chart as empty.
- Write dates with a time, such as `"2026-01-05T00:00"`, so they parse as local time. A bare `"2026-01-05"` parses as UTC and can show as the day before. Alternatively, set `"utc": true` on the `timeUnit`.

## Fit and readability

- Title every axis with its unit, such as `"title": "cold start (ms)"`.
- Keep `width` to about 400 or less, because the pane can be as narrow as 480 px.
- Show only the series the question is about.

## Anchors

A comment names the mark and its datum, such as `bar "runtime: Bun; ms: 60"`. Every field in the row shows, so use short, meaningful field names and leave out fields the chart doesn't need.

A line or area is one mark for all its data, so a click anywhere on it names only its first datum. Use `"mark": {"type": "line", "point": true}` so each point can be commented on.

## Preset marks

The `marks` colour scheme maps `recommended`, `risk` and `muted` to the page's colours. Put the mark name in a field and colour by it:

```vega-lite id=cold-start title="Cold start"
{
  "data": {"values": [
    {"runtime": "Node", "ms": 40, "mark": "recommended"},
    {"runtime": "Bun", "ms": 60, "mark": "muted"}
  ]},
  "mark": "bar",
  "encoding": {
    "x": {"field": "runtime", "type": "nominal", "title": "runtime"},
    "y": {"field": "ms", "type": "quantitative", "title": "cold start (ms)"},
    "color": {"field": "mark", "type": "nominal", "legend": null,
              "scale": {"domain": ["recommended", "risk", "muted"], "scheme": "marks"}}
  }
}
```

## Theme override

A top-level `config` merges over the page's and overrides the theme. An overridden chart stops following the theme, and if its text would be unreadable on dark, it falls back to the light backdrop.

Mark colours (`"color": {"value": …}`, a mark's `color`, a scale `range`) don't count as an override. They stay fixed in both themes, with no light backdrop to rescue them, so use the `marks` scheme instead.
