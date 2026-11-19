# Contributing to TechNova Cloud WMS

## Branches

| Branch | Purpose |
|---|---|
| `main` | Always deployable. Changes arrive only through pull requests with green CI. |
| `feature/<topic>` | New behaviour, e.g. `feature/per-warehouse-roles` |
| `fix/<topic>` | Bug fixes |
| `chore/<topic>` | Tooling, dependencies, CI |
| `docs/<topic>` | Documentation only |

Keep branches short-lived and focused on one change. Rebase on or merge from `main` before opening the pull request.

## Workflow

1. `git checkout main && git pull`
2. `git checkout -b feature/<topic>`
3. Make the change, commit in small steps with messages that say *why*
4. `git push -u origin feature/<topic>` and open a pull request (the template lists the checks)
5. CI must pass: web lint and build, API build, migrations on an empty database, schema drift check, 54-check end-to-end suite, CloudFormation and Terraform validation, image builds
6. Merge with a merge commit or squash, then delete the branch

## Local setup

```powershell
# API (needs the Floci emulator running)
./scripts/floci-rds-tunnel.ps1 start          # database: Floci RDS on localhost:7001
cd CloudWMS/server; npm ci; npm run start:dev

# Web app
cd CloudWMS/client; npm ci; npm run dev       # http://localhost:5173
```

Copy `CloudWMS/server/.env.example` to `.env`. Never commit `.env`, database dumps or certificates; `.gitignore` already excludes them.

## Database changes

Development uses `synchronize`, but every deployed environment uses migrations. When you change an entity:

```powershell
cd CloudWMS/server
npm run build
npm run migration:generate -- src/database/migrations/<DescribeTheChange>
```

Review the generated SQL, commit it with the entity change, and check `npm run migration:run` on a scratch database. CI fails if entities and migrations disagree.

## Tests

```powershell
# API end-to-end suite against a disposable database (raises the login rate limit)
$env:LOGIN_RATE_LIMIT_PER_MINUTE = '1000'
python CloudWMS/server/test/e2e/api_e2e.py      # needs API_URL, ADMIN_EMAIL, ADMIN_PASSWORD
```

## Deploying

```powershell
./scripts/deploy-infra.ps1 -Environment dev     # foundation stack (rarely changes)
./scripts/deploy-app.ps1   -Environment dev     # build, push, deploy the app (tag = commit)
```

Deploy from a clean `main`. The image tag is the commit hash, so every running version can be traced back to the code. Add `-Local` to target Floci.
