# TechNova Cloud WMS — System Architecture & Cloud Topology

## 1. Architectural Overview

TechNova Cloud WMS is designed as a **modular monolith** with clear domain boundaries, strong transactional isolation, and cloud-native service integration.

```
+-------------------------------------------------------------------------+
|                               Client Layer                              |
|   React 19 + TypeScript + Vite + Tailwind CSS (SPA)                     |
+------------------------------------+------------------------------------+
                                     | HTTPS / REST / JWT
                                     v
+------------------------------------+------------------------------------+
|                             Application Layer                           |
|   NestJS Modular Monolith API                                           |
|   - Global Prefix: /api                                                 |
|   - Rate Limiting: @nestjs/throttler                                    |
|   - Validation: class-validator DTOs                                    |
|   - Authentication: JWT + Argon2 password hashing                       |
+-------------------+--------------------+--------------------+-----------+
                    |                    |                    |
                    v                    v                    v
          +---------+--------+  +--------+--------+  +--------+--------+
          |    PostgreSQL    |  |    Amazon S3    |  | Secrets Manager |
          | TypeORM Entities |  | Object Storage  |  | RDS Credentials |
          | Audit Ledger     |  | Pre-signed URLs |  | JWT Private Key |
          +------------------+  +-----------------+  +-----------------+
```

---

## 2. Core Domain Modules

| Domain Module | Responsibility |
|---|---|
| `AuthModule` | JWT issuance, password verification, role-based authorization guard |
| `UsersModule` | User account lifecycle and warehouse assignment |
| `CompanyModule` | Organization boundary and tenant isolation |
| `WarehousesModule` | Physical warehouse facilities and operational status |
| `ProductsModule` | Product catalog, SKU generation, and category hierarchy |
| `InventoryModule` | Atomic stock movements (Stock IN / OUT / Adjust), negative stock check |
| `StorageModule` | Amazon S3 / Floci object storage with pre-signed upload URLs |
| `HealthModule` | System liveness and readiness probe endpoint (`/api/health`) |
| `BootstrapModule` | Zero-downtime database seeding and default administrator creation |

---

## 3. Database Design & Concurrency Protection

- **Auditable Ledger**: Inventory balances are supported by an append-only `inventory_transactions` ledger.
- **Pessimistic Locking**: Concurrent stock movements utilize database-level transactions with lock acquisition (`SELECT ... FOR UPDATE`) to guarantee updates are never lost during high-throughput order fulfillment.
- **Engine Constraints**: `CHECK ("quantity_on_hand" >= 0)` ensures stock balances never drop below zero.

---

## 4. AWS Cloud Topology (Target Architecture)

```
                            [Route 53]
                                |
                                v
               [Application Load Balancer (ALB)]
                                |
             +------------------+------------------+
             |                                     |
             v                                     v
  [ECS Fargate: Web SPA]               [ECS Fargate: NestJS API]
                                                   |
                        +--------------------------+--------------------------+
                        |                          |                          |
                        v                          v                          v
              [Amazon RDS PostgreSQL]        [Amazon S3 Assets]      [Secrets Manager]
                  (Multi-AZ)               (Private + Pre-signed)      (Auto-rotated)
```
