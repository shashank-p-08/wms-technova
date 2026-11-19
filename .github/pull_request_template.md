## What and why

<!-- One or two sentences: what changes, and the problem it solves. -->

## How it was tested

- [ ] CI is green (lint, build, migrations, drift check, end-to-end suite, infra validation)
- [ ] Tried locally (`npm run start:dev` / `docker compose up --build` / `deploy-app.ps1 -Local`)

## Checklist

- [ ] Entity changes come with a migration (`npm run migration:generate`)
- [ ] New environment variables are in `.env.example` and `env.validation.ts`
- [ ] No secrets, `.env` files or database dumps committed
- [ ] Docs updated if behaviour or deployment changed (`docs/README.md`)
