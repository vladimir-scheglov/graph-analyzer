import { simplePatternMatch } from "./namespace-filter";
import type { RFNode, RFEdge, RuleDefinition, RuleViolation } from "./types";

export function evaluateRules(
  edges: RFEdge[],
  nodes: RFNode[],
  rules: RuleDefinition[],
): RuleViolation[] {
  if (!Array.isArray(edges) || !Array.isArray(nodes) || !Array.isArray(rules)) {
    return [];
  }

  const violations: RuleViolation[] = [];
  const nodeById = new Map<string, RFNode>();
  nodes.forEach((n) => nodeById.set(n.id, n));

  edges.forEach((e) => {
    const src = nodeById.get(e.source);
    const tgt = nodeById.get(e.target);
    if (!src || !tgt) return;

    const fromId = (src.data.domainId || "").toLowerCase();
    const toId = (tgt.data.domainId || "").toLowerCase();

    rules.forEach((rule) => {
      if (!rule.from || !rule.to) return;
      if (
        simplePatternMatch(fromId, rule.from.toLowerCase()) &&
        simplePatternMatch(toId, rule.to.toLowerCase())
      ) {
        violations.push({
          ruleId: rule.id,
          rule,
          edgeId: e.id,
          fromId: src.data.domainId,
          toId: tgt.data.domainId,
          severity: rule.action || "warn",
        });
      }
    });
  });

  return violations;
}
