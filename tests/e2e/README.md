
## bulk-delete.spec.ts

Drives the shared `BulkActionBar` confirm dialog: selects 2 of 3 mocked rows,
verifies the title/preview show the count + names, then confirms and asserts
the underlying DELETE call removed exactly those ids. Also covers the
`confirmWord` typing gate on the Customers page.

## product-image-upload.spec.ts

Hermetic check that the local-file image picker on Admin/Products triggers a
`POST` against the `product-images` storage bucket (Supabase REST + storage
endpoints are mocked).
# E2E Smoke Tests

Playwright tests that verify the core flows: POS, Document Form, Dashboard, Settings,
plus draft auto-restore after page reload.

## One-time setup

```bash
bun add -d @playwright/test
bunx playwright install chromium
```

## Run

```bash
# starts vite dev server (if not running) then runs the suite
bunx playwright test
```

The config in `playwright.config.ts` will reuse an existing dev server on `localhost:8080`,
or boot one with `bun run dev`.

## What is covered

- `smoke.spec.ts` — every main page loads without console errors.
- `draft-restore.spec.ts` — fill the document form / POS cart, reload, verify the draft restore
  dialog (document form) or toast + persisted cart (POS) appears.
- `print-recovery.spec.ts` — force `window.print` to throw, verify the form keeps state and
  the "ลองพิมพ์อีกครั้ง" banner appears.
- `prices-import.spec.ts` — Google-Sheet import on `/admin/prices` with duplicate codes:
  verifies the dedupe review panel, that a failed upsert keeps the preview intact, and that
  the "ดาวน์โหลด CSV (หลังรวมรหัสซ้ำ)" button exports the chosen rows.

## Auth

The tests assume an already-signed-in browser session (Supabase auth state persisted in
localStorage). For CI, mint a session via the Lovable preview before running.

## Cross-browser coverage

`playwright.config.ts` ships two projects: **chromium** and **webkit**. The
delivery+receipt suite runs on both in CI (matrix job
`e2e-delivery-receipt`) so layout drift between Blink and WebKit is caught
early. Run locally:

```bash
# both engines
bun run test:e2e:delivery-receipt

# one engine only
bunx playwright test tests/e2e/document-delivery-with-receipt-visual.spec.ts --project=webkit
```

## Updating screenshot / DOM baselines (approve snapshots)

Visual + DOM snapshots live under `tests/e2e/__screenshots__/<spec>/` and are
segmented per **engine** + **OS** via
`{arg}-{projectName}-{platform}{ext}`. When a UI change is intentional,
regenerate baselines for every project you support:

```bash
# whole suite, all projects
bun run test:e2e:update

# delivery+receipt only, both engines
bun run test:e2e:update:delivery-receipt

# single engine (e.g. only webkit baseline changed)
bunx playwright test tests/e2e/document-delivery-with-receipt-visual.spec.ts \
  --project=webkit --update-snapshots
```

Stability guardrails already in place so baselines don't flake:

- `expect.toHaveScreenshot.animations: "disabled"` + per-project
  `reducedMotion: "reduce"` cancel CSS / OS-level motion.
- `fixtures/settle.ts → settleForSnapshot(page)` awaits
  `document.fonts.ready`, cancels in-flight `getAnimations()`, and ticks
  two `requestAnimationFrame`s before any screenshot or DOM dump.
- `fixtures/companionDocNumbers.ts` seeds deterministic doc numbers and
  `fixtures/documents.ts` freezes `Date.now()` + `crypto.randomUUID()`.

**CI rule:** never auto-approve snapshots in a workflow. Always run
`test:e2e:update` locally, eyeball the diff in `git status`, commit the new
PNG/HTML next to the spec, and let CI confirm the new baseline holds on
both engines.