# Decisions

Deviations from the design docs, and choices the docs left open. Each entry says
what was decided and why, so a later reader can tell a considered change from a
drift.

---

## 2026-08-20 — Day 1

### D1. Tool name: `a11y-ratchet`

`00 §10` gave `a11y-regress` as a placeholder. Settled on `a11y-ratchet`. Avoids
"axe" (Deque trademark) and implies no certification. Baked into `package.json`
`name` and `bin`, and read at runtime from `src/meta.ts` rather than hardcoded in
help text.

### D2. `baseline` is a sixth command group

`00 §4` and the Day 1 scope list five commands. `01 §11` requires
`baseline update | regenerate | check`, and Day 12 depends on it. Registered now,
stubbed, so `--help` reads like the finished tool. Not a scope increase — the
work is still Day 12.

### D3. `Finding` carries its identity evidence

**Added:** `Finding.identity: FindingIdentity` — normalised identity value,
collision ordinal, context signal (landmark + heading + frame path), DOM depth,
normalised text content.

`02 §6`'s fuzzy pass scores candidates on accessible name, context signal,
normalised text content, url template and DOM depth distance. A baseline is a
`Report` on disk, so anything the matcher needs must be serialised on the
finding. Without this, Day 6 cannot match a head run against a baseline at all —
which is exactly the failure `01 §1` warns about.

`identityTier` stays at the top level as the docs specify; it is not repeated
inside `identity`.

### D4. `Finding.bestPractice: boolean`

`01 §7` wants best-practice rules reported with `criteria: []`; `03 §2.4` wants
the clean page to assert zero best-practice findings. But `Bucket` is
`violation | needs-review` and `02 §8` gates on `new + violation + source=axe`, so
a `region` finding as specified would block a PR as a WCAG violation.

Not modelled as a third `Bucket` value: `bucket` mirrors which axe result array a
finding came from, and a best-practice rule can land in either. The two axes are
orthogonal.

Set from the rule's tags, **not** derived from `criteria.length === 0` — a gap in
the rule map would otherwise relabel a real WCAG failure as "not a WCAG failure".

Gate predicate: `bucket === 'violation' && source === 'axe' && !bestPractice`.

### D5. `RunInfo` records the full rendering context

`01 §5` requires viewport, locale and colour scheme to be configurable and
recorded, but the `Report` shape in `01 §3` carries only `viewport`. Added
`locale`, `timezoneId`, `colorScheme`, `deviceScaleFactor`, `reducedMotion`,
`concurrency`, `settle` and `probesEnabled`.

Diffing a light-mode baseline against a dark-mode head produces phantom contrast
regressions of the same class as engine drift, and `01 §9` says concurrency above
~8 destabilises results. If it can change a finding without the site changing, the
envelope has to record it.

### D6. Types the docs reference but never define

`SuccessCriterion`, `PageResult`, `Summary`, `GroupIndex` and `SuppressionRef`
were used in `01 §3` without definitions. Designed in `src/types.ts`. Notable
choices:

- `PageResult.error` is a typed `PageError` with a `kind`, not a string, so the
  diff can act on `02 §7`'s errored-vs-loaded asymmetry and exit code 3 stays
  distinct from a page-level failure.
- `PageResult.probeBlindRegions` gives `01 §6.1`'s `probe-blind` marking a home.
  It had none in the data model.
- `PageResult.probesRun` — a page with no probe findings because probes were
  disabled is not a page that passed them.
- `GroupIndex` is `Record<groupKey, FindingGroup>`; each group carries the highest
  impact among its members, so grouping never hides a critical.

### D7. `DiffResult` corrections

- `schemaVersion: '1.0'` added. It is a written artefact like `Report`.
- `findings.unknown` is `Array<{ reason; finding }>` rather than `Finding[]`.
  `02 §7` defines three distinct unknown categories and `02 §8` gates
  `unknown-page-added` per `newPagePolicy`; a flat array cannot express that.
- `gate.warnings: string[]` added, so `newPagePolicy: 'warn'` — the default — has
  somewhere to land.

### D8. Suppressed findings: partitioned in the report, pooled in the matcher

`01 §3` has both `Finding.suppressed?` and `Report.suppressed: Finding[]` without
saying whether a suppressed finding appears in `findings` too.

Kept the docs' shape: `findings` is the actionable set, `suppressed` holds the
rest, tagged and retained. **The matcher must pool both when building candidate
sets.** Otherwise adding a suppression between two runs makes the finding leave
`findings` and pass 3 classifies it `fixed` — a false fix, goal 2 in `02 §2`.
Suppression is applied at the gate, never at match time. Recorded as a binding
comment on the `Report` type.

### D9. Types included ahead of their day

`CoverageEntry`, `ManualCheck`, `PageFeatures`, `CoverageCounts` (`03 §1.8`) and
the library option interfaces are in `types.ts` now, though `coverage.ts` is Day 3
and config is Day 8. They are contract, and the point of writing types on day one
is not having to re-plumb later. No logic came with them.

`PageFeatures` and `ManualCheck.appliesWhen` support a feature that was **cut**
(`00 §4`, context-derived manual items). The type is here; the derivation is not,
and the comment says so.

### D10. TypeScript pinned to 5.9.3, not 7.x

TypeScript 7 (the native rewrite) is current, but `typescript-eslint@8` declares
`typescript: '>=4.8.4 <6.1.0'` and tsup 8 is not proven against it. A 15-day
budget should not absorb a toolchain migration. Revisit after v1.

`exactOptionalPropertyTypes` is on alongside `strict`. It is stricter than the
working agreement requires, and it catches the class of bug where an optional
field is explicitly set to `undefined` and silently lost on serialisation — which
matters for a tool whose first invariant is that findings are never dropped.

### D11. Fixture expectations are predictions until Day 2

`test/fixtures/pages/manifest.json` records 25 planted defects across the four
first-pass pages, with an expectation for each. Those expectations were written
from the WCAG criteria and from axe's documented rule behaviour — they have not
been executed against axe yet, because scanning is Day 2.

Day 2's done-when is precisely "scanning a fixture page matches its manifest". If
an expectation is wrong, the fix is to correct the manifest and record why, not to
weaken the assertion.

`manifest.json` records the axe-core version it was written against, and a test
fails if that drifts from the pinned dependency.

### D12. LICENSE copyright holder

Set to `Anudeep`, inferred from the git author email. Correct it before the repo
is published.
