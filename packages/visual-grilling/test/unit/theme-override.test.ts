import { describe, expect, it } from 'vitest';
import { overridesTheme } from '../../src/page/blocks/theme-override.ts';

describe('overridesTheme', () => {
  it('reads a Mermaid init directive or frontmatter config as an override', () => {
    expect(overridesTheme('mermaid', "%%{init: {'themeVariables': {'primaryColor': '#fff'}}}%%\nflowchart LR\n  a --> b")).toBe(true);
    expect(overridesTheme('mermaid', 'flowchart LR\n  %%{ initialize: { "theme": "forest" } }%%\n  a --> b')).toBe(true);
    expect(overridesTheme('mermaid', '---\ntitle: Flow\nconfig:\n  theme: forest\n---\nflowchart LR\n  a --> b')).toBe(true);
    expect(overridesTheme('mermaid', '---\ntitle: Flow\n---\nflowchart LR\n  a --> b')).toBe(false);
    expect(overridesTheme('mermaid', 'flowchart LR\n  %% config: a comment\n  a --> b:::risk')).toBe(false);
  });

  it('reads a Vega-Lite config as an override', () => {
    expect(overridesTheme('vega-lite', '{"mark": "bar", "config": {"background": "#fff"}}')).toBe(true);
    expect(overridesTheme('vega-lite', '{"mark": "bar", "encoding": {"x": {"field": "config"}}}')).toBe(false);
    expect(overridesTheme('vega-lite', 'not json')).toBe(false);
  });

  it('reads a DOT colour attribute as an override, but not one inside a quoted label', () => {
    expect(overridesTheme('dot', 'digraph { bgcolor=white; a -> b }')).toBe(true);
    expect(overridesTheme('dot', 'digraph { a [fillcolor="#fde"]; a -> b }')).toBe(true);
    expect(overridesTheme('dot', 'digraph { node [fontcolor = black] a -> b }')).toBe(true);
    expect(overridesTheme('dot', 'digraph { a [label=<<font color="red">A</font>>] }')).toBe(true);
    expect(overridesTheme('dot', 'digraph { a [label="color=red", class=risk] }')).toBe(false);
    expect(overridesTheme('dot', 'digraph { a -> b }')).toBe(false);
  });

  it('never calls another kind overridden', () => {
    expect(overridesTheme('table', '| config |\n|---|\n| color=red |')).toBe(false);
  });
});
