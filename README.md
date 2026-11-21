# Fast csv-reader drop-in

[![Competition](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![Rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/ninochaan/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![Reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/ninochaan/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

[View the bounty on make.fun](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0: `solve.js` answers
exactly as csv-reader does on every case — including all of its broken-CSV
behaviour (stray CR, unterminated quotes, quote junk, doubled quotes,
short/long rows, header handling) — in roughly half the CPU time.

## Layout

- `solve.js` — dependency-free ES module, `run(input)` returns csv-reader's
  `{columns, rows, errors}` for one case's `{text, header}`. Single pass,
  `indexOf`-driven field scans, slice-built fields, tight fast path for plain
  lines.
- `main.ts` — the harness driver (Node 22): reads `/input/cases.json`,
  answers each case alone with `run()`, writes `/output/answers.json`.

## Verification (practice set, 6 cases, ~10.2 MB CSV)

- Kit scorer: passed=1, 6/6 cases identical to the reference.
- 67 adversarial edge cases + 5,000 fuzz inputs vs the baseline `readCsv`:
  all identical.
- Two full runs produce byte-identical `answers.json`.
- Full-process benchmark on this VM: ~0.8 s vs the baseline's ~1.8 s
  (1.7–2.4x faster wall time).
