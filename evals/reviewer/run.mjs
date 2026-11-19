#!/usr/bin/env node
// Reviewer eval: runs the production reviewer prompt (prompts/reviewer.md)
// over a labelled dataset and scores what it catches.
//
//   npm run eval:reviewer -- [options]
//
//   --dataset <path>   labelled dataset (default evals/reviewer/seed.json)
//   --model <id>       model under test (default claude-opus-5-5)
//   --effort <level>   low | medium | high | xhigh | max (default high)
//   --runs <n>         repeat the whole dataset n times (default 3: one run is
//                      a sample, not a measurement)
//   --batch-size <n>   questions per API call (default 10)
//   --dry-run          print the first request and exit, no API call
//
// The reviewer sees only the questions, shuffled into mixed batches under
// neutral IDs. Labels and notes never leave this process.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { CATEGORIES, scoreRun, summarize, toMarkdown } from "./score.mjs";
import { costOf } from "./pricing.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "../..");

const { values: args } = parseArgs({
  options: {
    dataset: { type: "string", default: path.join(here, "seed.json") },
    model: { type: "string", default: "claude-opus-5-5" },
    effort: { type: "string", default: "high" },
    runs: { type: "string", default: "3" },
    "batch-size": { type: "string", default: "10" },
    "dry-run": { type: "boolean", default: false },
  },
});
const runs = Number(args.runs);
const batchSize = Number(args["batch-size"]);

// --- Inputs -----------------------------------------------------------------

const hash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 12);

// Everything after the first `---` line is the prompt; the part above it is a
// note for humans about the file itself.
const promptFile = readFileSync(path.join(root, "prompts/reviewer.md"), "utf8");
const prompt = promptFile.split(/\n---\n/).slice(1).join("\n---\n").trim();
if (!prompt) throw new Error("prompts/reviewer.md: no prompt found below the --- line");

const datasetText = readFileSync(args.dataset, "utf8");
const items = JSON.parse(datasetText);

const VerdictSchema = z.object({
  verdicts: z.array(
    z.object({
      id: z.string(),
      verdict: z.enum(["pass", "fail"]),
      category: z.enum([...CATEGORIES, "none"]),
      reason: z.string(),
    }),
  ),
});

// --- Batching ---------------------------------------------------------------

function seededRandom(seedText) {
  let seed = createHash("sha256").update(seedText).digest().readUInt32LE(0);
  return () => {
    seed = (seed + 0x6d2b79f5) | 0; // mulberry32
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shuffle (seeded per run), give neutral IDs, split into batches. */
function batchesFor(runIndex) {
  const random = seededRandom(`${hash(datasetText)}:${runIndex}`);
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const withIds = shuffled.map((item, n) => ({ anonId: `Q-${String(n + 1).padStart(2, "0")}`, item }));
  const batches = [];
  for (let i = 0; i < withIds.length; i += batchSize) batches.push(withIds.slice(i, i + batchSize));
  return batches;
}

function messageFor(batch) {
  const questions = batch.map(({ anonId, item }) => ({ id: anonId, ...item.question }));
  return [
    prompt,
    "## Questions",
    "```json\n" + JSON.stringify(questions, null, 2) + "\n```",
    "## Live-bank dedup list",
    "(none)",
  ].join("\n\n");
}

// --- Dry run ----------------------------------------------------------------

if (args["dry-run"]) {
  console.log(messageFor(batchesFor(0)[0]));
  console.log(`\n--- dry run: ${items.length} items, ${batchesFor(0).length} batch(es) per run, model ${args.model}, effort ${args.effort}`);
  process.exit(0);
}

// --- API calls --------------------------------------------------------------

// No refusal fallback on purpose: the eval measures one named model, so a
// silent switch to another model would corrupt the result. A refusal is
// recorded as an error and its questions count as "no verdict".
const client = new Anthropic();

async function review(batch) {
  const started = Date.now();
  try {
    const response = await client.messages.parse({
      model: args.model,
      max_tokens: 16000,
      output_config: { effort: args.effort, format: zodOutputFormat(VerdictSchema) },
      messages: [{ role: "user", content: messageFor(batch) }],
    });
    const latencyMs = Date.now() - started;
    const usage = response.usage;
    if (response.stop_reason !== "end_turn" || !response.parsed_output) {
      return { latencyMs, usage, error: `stop_reason ${response.stop_reason}, no parsed output` };
    }
    return { latencyMs, usage, verdicts: response.parsed_output.verdicts };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw error; // no point continuing
    const status = error instanceof Anthropic.APIError ? ` (${error.status})` : "";
    return { latencyMs: Date.now() - started, usage: {}, error: `${error.name}${status}: ${error.message}` };
  }
}

const scoredRuns = [];
const calls = [];
for (let r = 0; r < runs; r++) {
  const batches = batchesFor(r);
  console.log(`run ${r + 1}/${runs}: ${batches.length} call(s)…`);
  const results = await Promise.all(batches.map(review));

  const verdictsById = {};
  results.forEach((result, b) => {
    calls.push({ run: r, batch: b, latencyMs: result.latencyMs, usage: result.usage, error: result.error ?? null });
    if (result.error) console.warn(`  batch ${b + 1}: ${result.error}`);
    for (const v of result.verdicts ?? []) {
      const entry = batches[b].find((x) => x.anonId === v.id);
      if (entry) verdictsById[entry.item.id] = v;
    }
  });
  scoredRuns.push(scoreRun(items, verdictsById));
}

// --- Report -----------------------------------------------------------------

const sum = (key) => calls.reduce((a, c) => a + (c.usage[key] ?? 0), 0);
const costs = calls.map((c) => costOf(args.model, c.usage));
const now = new Date();
const meta = {
  date: now.toISOString(),
  model: args.model,
  effort: args.effort,
  dataset: path.relative(root, path.resolve(args.dataset)),
  datasetHash: hash(datasetText),
  promptHash: hash(prompt),
  items: items.length,
  batchSize,
  inputTokens: sum("input_tokens"),
  outputTokens: sum("output_tokens"),
  cost: costs.includes(null) ? null : costs.reduce((a, b) => a + b, 0),
  avgLatencyMs: calls.reduce((a, c) => a + c.latencyMs, 0) / calls.length,
};
const summary = summarize(scoredRuns);
const markdown = toMarkdown(summary, meta);

const outDir = path.join(here, "results");
mkdirSync(outDir, { recursive: true });
const stem = `${now.toISOString().slice(0, 16).replace(/:/g, "")}-${args.model}-${args.effort}`;
writeFileSync(path.join(outDir, `${stem}.json`), JSON.stringify({ meta, summary, runs: scoredRuns, calls }, null, 2) + "\n");
writeFileSync(path.join(outDir, `${stem}.md`), markdown + "\n");

console.log("\n" + markdown);
console.log(`\nSaved evals/reviewer/results/${stem}.{json,md}`);
