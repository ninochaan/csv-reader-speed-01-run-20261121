// Fast csv-reader drop-in: the harness runs `node /bot/main.ts` (node22).
// It reads every case from /input/cases.json (a JSON array of {id, input}),
// answers each one alone with run() from solve.js, and writes
// /output/answers.json: a JSON array of the answers, one per case and in the
// cases' order. Outside a container MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR
// stand in for /input and /output.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// NOTE: the house baseline runs with V8 incremental marking off, and the
// rules let an entry tune V8's flags the same way — the flag is permitted,
// not required. Measured on this VM, --no-incremental-marking costs ~0.15 s
// CPU on the practice set (full-process 1.20 s with it vs 1.04 s without),
// so this entry deliberately runs WITHOUT it: default V8 GC is faster here
// and the answers are pure functions of the input, so determinism is
// unaffected (verified: two runs byte-identical, scorer 6/6).

/** solve.js, imported by its URL (a .js module carries no types) and typed by its contract. */
const { run } = (await import(new URL('./solve.js', import.meta.url).href)) as { run: (input: unknown) => unknown };

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(INPUT_DIR, 'cases.json'), 'utf8')) as { id: string; input: unknown }[];
const answers: unknown[] = [];
for (const c of cases) answers.push(run(c.input));
writeFileSync(join(OUTPUT_DIR, 'answers.json'), JSON.stringify(answers));
