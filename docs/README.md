# TechNova WMS — Cloud Foundation

The full write-up, with concepts, design decisions and test results, is in
[TechNova-WMS-Cloud-Foundation-v3.docx](TechNova-WMS-Cloud-Foundation-v3.docx); a two-page overview for the team is in
[TechNova-WMS-Change-Summary.docx](TechNova-WMS-Change-Summary.docx). This page is the quick reference.

## What is implemented

| Area | AWS mechanism | Where |
|---|---|---|
| Regions | Primary `us-east-1`, DR `us-west-2`; enforced by template rule, Terraform validation and an SCP | `infrastructure/`, `iam/policies/region-restriction-scp.json` |
| Subscriptions | One AWS **account** per environment under AWS Organizations (Security / Workloads{NonProd,Prod} / Sandbox OUs) + monthly budget per environment | `scripts/python/setup_organization.py`, `starter.yaml` |
| IAM | Least-privilege app role, developers & auditors groups, MFA required, no root use | `starter.yaml`, `iam/policies/*.json` |
| Resource groups | Mandatory tags (`Project`, `Environment`, `Owner`, `CostCenter`, `ManagedBy`) + tag-based AWS Resource Group per environment + Org tag policy | `starter.yaml`, `iam/policies/tag-policy.json` |
| Network | Private VPC per environment, two private subnets in two AZs, no internet gateway; DB only reachable from the API security group | `starter.yaml` |
| Database | RDS PostgreSQL 17, encrypted, private, automated backups (Multi-AZ + deletion protection in prod); password generated into Secrets Manager | `starter.yaml`, `migrate_db_to_rds.py` |
| Application | API loads DB credentials from Secrets Manager (`DB_SECRET_ARN`), stores product images in private S3 and serves them via signed URLs; `GET /api/health` checks DB + S3 | `CloudWMS/server/src/config`, `modules/storage`, `modules/health` |
| Verification | Baseline health check across all of the above | `scripts/python/check_aws.py` |

Azure → AWS terms: *subscription* = account, *management group* = OU, *resource group* = tag-based Resource Group (lifecycle grouping = CloudFormation stack), *Azure Policy* = SCP / tag policy, *Entra ID* = IAM Identity Center.

## Quick start (local, Floci emulator on :4566)

```powershell
pip install -r scripts/python/requirements.txt
./scripts/deploy-infra.ps1 -Environment dev -Local
$env:AWS_ENDPOINT_URL = "http://localhost:4566"; $env:AWS_ACCESS_KEY_ID = "test"; $env:AWS_SECRET_ACCESS_KEY = "test"
python scripts/python/check_aws.py -e dev
python scripts/python/setup_organization.py          # dry run
python scripts/python/s3_utils.py bucket -e dev      # -> put into CloudWMS/server/.env as S3_BUCKET_NAME
```

## Authentication and authorization

**Model:** one **company** has many **warehouses**, and each **employee** has one role plus the warehouses they are assigned to. Stock is kept per warehouse, and every stock movement records the warehouse and the employee who made it.

| Action | ADMIN | MANAGER | STAFF | VIEWER |
|---|---|---|---|---|
| View products, stock, ledger | all warehouses | assigned | assigned | assigned |
| Stock in / stock out | ✓ | ✓ | ✓ | – |
| Stock adjustment (cycle count) | ✓ | ✓ | – | – |
| Create / edit products, images | ✓ | ✓ | – | – |
| Delete products | ✓ | – | – | – |
| Manage employees and warehouses | ✓ | – | – | – |

How it works:
- `POST /api/auth/login` returns an 8-hour JWT. Every other endpoint requires `Authorization: Bearer <token>`; only `/api/health` and the login endpoint are public. `GET /api/auth/me` returns the profile and the user's warehouses.
- The global `AuthGuard` (`server/src/modules/auth/auth.guard.ts`) re-loads the user on every request. Deactivating a user, changing their role or removing a warehouse takes effect **immediately**, not when the token expires. A password change or reset revokes all existing tokens.
- `@Roles(...)` on controllers enforces the role column of the table above. The services enforce warehouse assignment (`assertWarehouseAccess`).
- Passwords are hashed with scrypt (N=2^17). After 5 failed sign-ins an account is locked for 15 minutes. Unknown emails and wrong passwords return the same error, so sign-in can't be used to discover accounts.
- Safety rails: admins can't deactivate or demote themselves, and the company always keeps at least one active admin. Users are deactivated, never deleted, to keep the audit trail.
- The signing key comes from `JWT_SECRET_ARN` (Secrets Manager, stack output `JwtSecretArn`) on AWS, or from `JWT_SECRET` locally.

**First start:** the server creates the company, warehouse `HUB-01` and the first admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD`, or a generated password printed once in the server log). Data from before warehouses existed is assigned to `HUB-01` automatically. Forgot the admin password? Run `npm run build && npm run reset-password -- admin@technova.local` in `CloudWMS/server`.

**Frontend:** sign-in page, a warehouse switcher in the header (it scopes the dashboard, inventory and ledger), Employees and Warehouses pages for admins, change password and sign out in the user menu, and buttons hidden when the role can't use them.

## Production readiness

| Concern | How it's handled | Where |
|---|---|---|
| Schema changes | TypeORM migrations. Development uses `synchronize`; production applies pending migrations at startup. The initial migration only records itself as a baseline on databases that synchronize already built. CI fails if the entities and migrations drift apart. | `server/src/database/`, `npm run migration:*` |
| Configuration | Validated at startup. Production refuses to start without a JWT/DB secret or CORS origins, or with `DB_SYNCHRONIZE=true`. | `server/src/config/env.validation.ts` |
| HTTP security | Helmet headers, CORS from `CORS_ORIGINS`, 100 KB JSON limit, `TRUST_PROXY` for the ALB | `server/src/main.ts` |
| Abuse | Per-IP rate limit (300/min), sign-in 10/min, plus the 5-failure account lockout. The limiter is in-memory per instance; use a shared store when running more than one task. | `app.module.ts`, `auth.controller.ts` |
| Performance | Index on ledger `(warehouse_id, transacted_at)`, duplicate SKU index removed, DB pool size configurable, SQL logging off by default, pages loaded on demand in the web app | entities, `database.config.ts`, `client/src/App.tsx` |
| Resilience | Graceful shutdown (drains on SIGTERM), container health checks, React error boundaries | `main.ts`, Dockerfiles, `ErrorBoundary.tsx` |
| Packaging | Multi-stage images (API runs as non-root `node`; web is static nginx with long-lived asset caching); `docker compose up --build` runs the full stack | `server/Dockerfile`, `client/Dockerfile`, `docker-compose.yml` |
| CI | Web lint and build; API build, migrations on an empty Postgres, drift check, production-mode start, 54-check end-to-end suite; cfn-lint and terraform validate; image builds | `.github/workflows/ci.yml`, `server/test/e2e/api_e2e.py` |

## Hosting on AWS (ECS Fargate)

`infrastructure/cloudformation/app-hosting.yaml` builds on the foundation stack: one Application Load Balancer (`/api/*` → API, everything else → web), two Fargate services, ECR registries (immutable tags, scan on push), CPU auto scaling for the API, automatic rollback of unhealthy deployments, and a generated first-admin password in Secrets Manager. Prod runs tasks in private subnets behind a NAT gateway; dev and staging use public subnets (no NAT cost) and the load balancer remains the only way in.

```powershell
./scripts/deploy-infra.ps1 -Environment dev          # foundation, once
./scripts/deploy-app.ps1   -Environment dev          # build, push (tag = git commit), deploy
./scripts/deploy-app.ps1   -Environment prod -CertificateArn arn:aws:acm:...   # HTTPS
```

Add `-Local` to target Floci. Floci can't resolve its own ECR hostname from Docker Desktop and gives tasks no task-role credentials, so `-Local` pushes to Floci's registry container and sets the emulator-only `EmulatorEndpoint` parameter. Leave that parameter empty on AWS.

## Local development against the RDS database

```powershell
./scripts/floci-rds-tunnel.ps1 start     # localhost:7001 -> Floci RDS (stop / status too)
```

`CloudWMS/server/.env` uses `DB_SECRET_ARN` plus `DB_HOST=localhost`, `DB_PORT=7001`, with TLS verified against the Floci CA (`certs/floci-root-ca.crt`). Local PostgreSQL settings remain there, commented out, as a fallback.

## Point the app at AWS

| Setting in `CloudWMS/server/.env` | Value | From |
|---|---|---|
| `S3_BUCKET_NAME` | assets bucket | stack output `AssetsBucketName` |
| `DB_SECRET_ARN` | DB secret ARN | stack output `DbSecretArn` |
| `DB_SSL`, `DB_SSL_CA_PATH` | `true`, `certs/rds-global-bundle.pem` | real AWS only; `./scripts/get-rds-ca.ps1` |

Copy existing data into the new database (checks only until `--apply`; refuses a non-empty target):

```powershell
python scripts/python/migrate_db_to_rds.py -e dev            # connectivity + emptiness check
python scripts/python/migrate_db_to_rds.py -e dev --apply    # copy + verify row counts
```

API endpoints added: `POST /api/products/:id/image` (multipart field `file`, ≤5 MB, jpeg/png/webp/gif), `DELETE /api/products/:id/image`, `GET /api/health`.

**Reaching the database.** RDS is private by design. On real AWS, the API runs inside the VPC (ECS/EC2 using `AppSecurityGroupId` and the app role). From a laptop, connect through an SSM Session Manager port-forward to `localhost` and set `DB_HOST`/`DB_PORT` to that local port; those override the secret. On Floci, the RDS proxy listens on port 7001 *inside* the Floci container, so you need a host port-forward to reach it (see "Floci limitations" below).

## Real AWS

1. From the **management account**: `python scripts/python/setup_organization.py --apply`, then add `--create-accounts --account-email-template "aws+{name}@yourcompany.com"`.
2. Sign in to each member account through IAM Identity Center (`aws sso login`).
3. `./scripts/deploy-infra.ps1 -Environment <env>` (add `-Region us-west-2` for DR).
4. `python scripts/python/check_aws.py -e <env> --strict` must pass.

Use **either** CloudFormation (`infrastructure/cloudformation`) **or** Terraform (`infrastructure/terraform`) for an environment, never both.

## Floci limitations (local only)

Floci accepts these CloudFormation resource types but doesn't actually create them: `AWS::IAM::Group`, `AWS::ResourceGroups::Group` and `AWS::Budgets::Budget`. It also ignores template `Rules`, so the region guard isn't enforced locally. `check_aws.py` falls back to the tagging API when a resource group is missing. Real AWS creates and enforces all of these.

Other Floci limitations:
- `ManageMasterUserPassword` is not supported, which is why the template generates the secret explicitly.
- S3 is served to anonymous requests, because Floci doesn't enforce access control. Real AWS returns 403.
- RDS starts a real `postgres:17-alpine` container behind a proxy on port 7001 inside the `floci` container, and only port 4566 is published. To use it from the host, either recreate Floci with `-p 7001-7010:7001-7010` (this loses Floci's state, because it has no volume), or run a port-forward container, e.g. `docker run -d --name floci-rds-forward --link floci -p 127.0.0.1:7001:7001 alpine/socat tcp-listen:7001,fork,reuseaddr tcp-connect:floci:7001`.
