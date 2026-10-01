const maxRules = 30;

const validRule = (rule: string) => {
  if (!rule || rule.length > 128 || rule.startsWith("/") || rule.includes("\\"))
    return false;
  const segments = rule.split("/");
  if (
    segments.some((segment) => !segment || segment === "." || segment === "..")
  )
    return false;
  const stars = rule.match(/\*/g)?.length ?? 0;
  return (
    stars === 0 ||
    (stars === 1 &&
      segments.length === 1 &&
      rule.endsWith("*") &&
      rule.length > 2)
  );
};

export const pathRulesAreValid = (text: string) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return (
    lines.length <= maxRules &&
    lines.every(validRule) &&
    new Set(lines).size === lines.length
  );
};

export const parsePathRules = (text: string): string[] => {
  const rules: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const rule = line.trim();
    if (validRule(rule) && !rules.includes(rule)) rules.push(rule);
    if (rules.length === maxRules) break;
  }
  return rules;
};

export const pathMatchesRule = (path: string, rules: readonly string[]) => {
  if (path.startsWith("/") || path.includes("\\") || path.includes("\0"))
    return false;
  const segments = path.split("/");
  if (
    segments.some((segment) => !segment || segment === "." || segment === "..")
  )
    return false;
  return rules.some((rule) => {
    if (rule.includes("/")) return path === rule || path.startsWith(`${rule}/`);
    if (rule.endsWith("*")) {
      const prefix = rule.slice(0, -1);
      return segments.some((segment) => segment.startsWith(prefix));
    }
    return segments.includes(rule);
  });
};
