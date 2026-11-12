# Difficulty report (claude.ai artifact)

The "Firefly Garden difficulty report" is a claude.ai Data (dashboard) artifact:
https://claude.ai/artifact/PukUd726h7SsHBQM7jMdfQ

Its page and data live in the artifact's own store, not in this repo. These
files are the source copies of what is stored there:

- `index.html` → store document `files/index.html` (field `text`)
- `report.js` → store document `files/report.js` (field `text`)

Each dataset in the store (`datasets/<id>`) is an attached file uploaded from
`reports/dash/`:

| Dataset id | File | What |
| --- | --- | --- |
| `census` | `reports/dash/census.json` | Phase 1 gate census (sizes 4 to 10) |
| `experiment` | `reports/archive/mushroom-experiment-2026-11-12.json` | Archived mushroom experiment |
| `ramp` | `reports/dash/ramp.json` | Chapters 1 to 3 in play order |
| `players` | `reports/dash/players.json` | Simulated players, chapters 1 to 3 |
| `economy` | `reports/dash/economy.json` | Hint economy sweep and hints per ad |
| `ads` | `reports/dash/ads.json` | Ad views per simulated player |
| `policy` | `reports/dash/policy.json` | Next-level policy comparison |
| `packChapters` | `reports/dash/chapters.json` | Launch pack, one row per chapter |
| `journey` | `reports/dash/journey.json` | Simulated players through the whole pack |
| `pack` | `reports/dash/pack.json` | Launch pack totals |

Note: the dataset for chapters.json is `packChapters`, because the page also
declares a calc named `chapters` (the chapter 1 to 3 summary).

## Refreshing it after `npm run levels`

1. Upload each changed `reports/dash/*.json` to the artifact as an asset
   (Artifact tool: publish with `url`, `asset: true`, `file_path`; JSON files go one
   per call). Each upload returns a `/_blob/<id>` url.
2. Update the matching `datasets/<id>` document's `source.url` and `updated`
   (ArtifactData `update`, pinned with `if_version`).
3. If the page changed, write `files/index.html` / `files/report.js` from these
   copies (ArtifactData `set` with `{text, edit}`), then commit the copies here.
4. Read `data/users/me/check` in the artifact store: it should say `passed`.
