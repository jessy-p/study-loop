// USD per million tokens, Claude API first-party rates (checked 2026-11).
// Thinking tokens are billed as output tokens. Cache writes (5-minute TTL)
// cost 1.25x the input rate. Update this table when prices change; an
// unlisted model reports cost as unknown rather than guessing.
const PRICES = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  // Haiku 5.5's input/output rates apply to prompts up to 100K tokens; its
  // cache-read rate isn't in our price table, so 10% of input is assumed.
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

/** Cost in USD for one response's `usage`, or null for an unlisted model. */
export function costOf(model, usage) {
  const p = PRICES[model];
  if (!p) return null;
  const perToken = (rate) => rate / 1_000_000;
  return (
    (usage.input_tokens ?? 0) * perToken(p.input) +
    (usage.output_tokens ?? 0) * perToken(p.output) +
    (usage.cache_read_input_tokens ?? 0) * perToken(p.cacheRead) +
    (usage.cache_creation_input_tokens ?? 0) * perToken(p.input * 1.25)
  );
}
