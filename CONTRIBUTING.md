# Contributing to Riperflow
  
Thanks for your interest. Small thing or large, here's the 30-second onramp.

## Local development

```bash
git clone https://github.com/nitingupta220/riperflow.git
cd riperflow/cli
npm install
npm run build      # also chmods dist/index.js +x
npm link           # so `riperflow` resolves to your local checkout
riperflow --version
```

## Run the tests

```bash
cd cli
npx vitest run     # full suite (~7s)
npx vitest         # watch mode while iterating
```

We expect every PR to keep the suite green and to add a regression test for any bug fix.

## Adding support for a new AI coding tool

There's a thin adapter pattern. The shortest path:

1. Drop a new file at `cli/src/adapters/<tool>.ts` (look at `cli/src/adapters/cursor.ts` for the minimal shape — name, configDir, rulesDir, file extension, override `getRulesContent()` if the tool needs a non-default header).
2. Register it in `cli/src/adapters/base.ts` so `createAdapter()` can return it.
3. Add a markdown template at `cli/templates/adapters/<tool>.md`.
4. Cover it in `cli/test/adapters.test.ts` and `cli/test/templates.test.ts`.
5. Add the tool to the README's [Supported tools](./README.md#supported-tools) table.

## Releasing (maintainers)

1. Bump `cli/package.json` version.
2. Commit it: `git commit -am "release: vX.Y.Z"`.
3. Tag and push: `git tag vX.Y.Z && git push --tags`.
4. The `Publish to npm` workflow takes it from there — runs tests, verifies the tag matches the version in `package.json`, and publishes with provenance.

## Code style

- TypeScript strict; tests in vitest.
- ESLint config in `cli/.eslintrc.json` — run `npm run lint` before submitting.
- Commit messages: short imperative subject, optional body explaining the *why*. Match the existing style if in doubt (`git log --oneline -20`).

## Reporting bugs

Open an issue with:
- The command you ran
- What you expected
- What you saw (paste output)
- `riperflow --version` and `node --version`

## Code of conduct

Be kind. Critique code, not people. Assume good faith.
