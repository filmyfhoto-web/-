# E2E Fixtures

Deterministic data for the document-print regression suite. Keep these stable —
snapshots in `__screenshots__/` and `*.spec.ts-snapshots/` depend on the exact
values below.

## Files

- `documents.ts` — generic invoice/receipt printable-area HTML and the
  `renderTestPage()` helper that wires a mocked `window.print`.
- `companionDocNumbers.ts` — fixed document numbers (`FIXED_DELIVERY_NO`,
  `FIXED_RECEIPT_NO`, `FIXED_INVOICE_NO`) plus `COMPANION_SEED_INIT` for
  freezing `Date` and `crypto.randomUUID` inside Playwright pages.

## Updating numbers

If a numbering scheme genuinely changes (new year prefix, new sequence width):

1. Update the constants in `companionDocNumbers.ts`.
2. Run `bun run test:unit` and `bun run test:e2e -- --update-snapshots`.
3. Commit the new snapshots together with the fixture change.

## Debug trace

The `delivery-with-receipt` spec asserts the stage ordering exposed by
`src/pages/receipts/lib/printDebug.ts → logPrintStage`. New stages may be
added freely; do not remove `cfg-received`, `blocks-collected`,
`snapshot-ready`, or `print-invoked` without updating the spec.