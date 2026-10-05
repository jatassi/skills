// What check mode rejects in a vendored text file, beyond divergence:
// checks.json's denylist (Cursor-isms, pinned model versions, CLAUDE.md),
// agent types outside the plugin's namespace, playbook steps naming skills
// the plugin doesn't ship, and unresolved conflict markers from a sync.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Checks } from './config.ts';

export interface Violation {
  path: string;
  line?: number;
  rule: string;
  message: string;
}

// `subagent_type`: `x`, subagent_type: "x", "subagent_type": "x", subagent_type=x
const AGENT_TYPE = /subagent_type["'`]?\s*[:=]\s*["'`]?([A-Za-z0-9:_.-]+)/g;
const CONFLICT_MARKER = /^(?:<{7}|>{7})(?: |$)/;

export function lintText(path: string, text: string, checks: Checks, root: string): Violation[] {
  const violations: Violation[] = [];
  const skillExists = (name: string) => existsSync(join(root, 'skills', name, 'SKILL.md'));
  const agentExists = (name: string) => existsSync(join(root, 'agents', `${name}.md`));
  const isPlaybook = checks.playbooks.test(path);
  const prefix = `${checks.namespace}:`;
  text.split('\n').forEach((line, i) => {
    const at = { path, line: i + 1 };
    if (CONFLICT_MARKER.test(line)) {
      violations.push({ ...at, rule: 'conflict-marker', message: 'unresolved conflict from a sync; resolve it, keeping the fork declared in vendor/forks.json' });
    }
    for (const deny of checks.denylist) {
      if (deny.test(line)) violations.push({ ...at, rule: deny.rule, message: `${deny.label}: ${deny.hint}` });
    }
    for (const [, type] of line.matchAll(AGENT_TYPE)) {
      if (checks.builtinAgentTypes.has(type!)) continue;
      if (!type!.startsWith(prefix)) {
        violations.push({ ...at, rule: 'agent-namespace', message: `agent type "${type}" is neither built in nor namespaced ${prefix}` });
      } else if (!agentExists(type!.slice(prefix.length))) {
        violations.push({ ...at, rule: 'agent-namespace', message: `agent type "${type}" names no agents/${type!.slice(prefix.length)}.md` });
      }
    }
    if (isPlaybook) {
      for (const pattern of checks.skillReferences) {
        for (const [, name] of line.matchAll(pattern)) {
          if (name && !skillExists(name) && !agentExists(name)) {
            violations.push({ ...at, rule: 'missing-skill', message: `playbook step names "${name}", which is not a skill in skills/` });
          }
        }
      }
    }
  });
  return violations;
}
