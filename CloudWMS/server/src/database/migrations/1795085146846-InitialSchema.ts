import { Logger } from '@nestjs/common';
import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Baseline schema (companies -> warehouses -> employees, per-warehouse stock).
 *
 * Databases that were created by `synchronize` (local development, or a copy made with
 * scripts/python/migrate_db_to_rds.py) already contain this schema. For those the
 * migration only records itself as applied, so later migrations build on top of it.
 */
export class InitialSchema1795085146846 implements MigrationInterface {
    name = 'InitialSchema1795085146846'

    public async up(queryRunner: QueryRunner): Promise<void> {
        const logger = new Logger('Migration');
        if (await queryRunner.hasTable('warehouses')) {
            logger.log('InitialSchema: schema already present (created by synchronize) - recording as baseline');
            return;
        }
        if (await queryRunner.hasTable('products')) {
            throw new Error(
                'Found a pre-warehouse schema. Start the API once with DB_SYNCHRONIZE=true to upgrade it, then run migrations.',
            );
        }

        // uuid_generate_v4() lives in this extension (synchronize used to create it implicitly)
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(`CREATE TABLE "product_categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_a75bfadcd8291a0538ab7abfdcf" UNIQUE ("name"), CONSTRAINT "PK_7069dac60d88408eca56fdc9e0c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "companies" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_3dacbb3eb4f095e29372ff8e131" UNIQUE ("name"), CONSTRAINT "PK_d4bc3e82a314fa9e29f652c2c22" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "warehouses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying(20) NOT NULL, "name" character varying NOT NULL, "address" character varying, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "company_id" uuid NOT NULL, CONSTRAINT "PK_56ae21ee2432b2270b48867e4be" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_83a2f7c3947e29b4e04b6ccc76" ON "warehouses"  ("company_id", "code") `);
        await queryRunner.query(`CREATE TABLE "inventory" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "quantity_on_hand" integer NOT NULL DEFAULT '0', "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "product_id" uuid, "warehouse_id" uuid, CONSTRAINT "CHK_e8a35666c6c94a6d2ea482a21b" CHECK ("quantity_on_hand" >= 0), CONSTRAINT "PK_82aa5da437c5bbfb80703b08309" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_966106d4cd7a5d8d3aa45ba444" ON "inventory"  ("product_id", "warehouse_id") `);
        await queryRunner.query(`CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sku" character varying NOT NULL, "name" character varying NOT NULL, "description" text, "unitOfMeasurement" character varying NOT NULL DEFAULT 'pcs', "minimumStockLevel" integer NOT NULL DEFAULT '0', "imageUrl" character varying, "image_key" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "category_id" uuid, CONSTRAINT "UQ_c44ac33a05b144dd0d9ddcf9327" UNIQUE ("sku"), CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_4c9fb58de893725258746385e1" ON "products"  ("name") `);
        await queryRunner.query(`CREATE TYPE "public"."inventory_transactions_type_enum" AS ENUM('STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT')`);
        await queryRunner.query(`CREATE TABLE "inventory_transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "type" "public"."inventory_transactions_type_enum" NOT NULL, "quantity" integer NOT NULL, "quantity_before" integer NOT NULL, "quantity_after" integer NOT NULL, "reference" character varying NOT NULL, "notes" text, "transacted_at" TIMESTAMP NOT NULL DEFAULT now(), "product_id" uuid, "warehouse_id" uuid, "user_id" uuid, CONSTRAINT "PK_9b7144851f08f9eededde7edd42" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_e807ed86bffa19adeaa7b0fac6" ON "inventory_transactions"  ("reference") `);
        await queryRunner.query(`CREATE INDEX "IDX_tx_warehouse_time" ON "inventory_transactions"  ("warehouse_id", "transacted_at") `);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('ADMIN', 'MANAGER', 'STAFF', 'VIEWER')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "passwordHash" character varying NOT NULL, "firstName" character varying, "lastName" character varying, "role" "public"."users_role_enum" NOT NULL DEFAULT 'STAFF', "isActive" boolean NOT NULL DEFAULT true, "failedLoginAttempts" integer NOT NULL DEFAULT '0', "lockedUntil" TIMESTAMP WITH TIME ZONE, "lastLoginAt" TIMESTAMP WITH TIME ZONE, "tokenVersion" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "company_id" uuid, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "user_warehouses" ("user_id" uuid NOT NULL, "warehouse_id" uuid NOT NULL, CONSTRAINT "PK_b5ede09dc3bb7549ef1a0885ac4" PRIMARY KEY ("user_id", "warehouse_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_88734270926a01dab68cd7db07" ON "user_warehouses"  ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_e6c056cb4c1d1e2b01fea64417" ON "user_warehouses"  ("warehouse_id") `);
        await queryRunner.query(`ALTER TABLE "warehouses" ADD CONSTRAINT "FK_3fcbfd5832b46945f514a7d1f56" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "inventory" ADD CONSTRAINT "FK_732fdb1f76432d65d2c136340dc" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "inventory" ADD CONSTRAINT "FK_5d9d73a4c5fe0202714a51e4649" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "products" ADD CONSTRAINT "FK_9a5f6868c96e0069e699f33e124" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "inventory_transactions" ADD CONSTRAINT "FK_2520d97de0c9a0fbfc9b00f4c1b" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "inventory_transactions" ADD CONSTRAINT "FK_d49bcd38118deceaeb969a54e4f" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "inventory_transactions" ADD CONSTRAINT "FK_e51672a4898b02f686769f71c2a" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_7ae6334059289559722437bcc1c" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_warehouses" ADD CONSTRAINT "FK_88734270926a01dab68cd7db072" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "user_warehouses" ADD CONSTRAINT "FK_e6c056cb4c1d1e2b01fea64417f" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_warehouses" DROP CONSTRAINT "FK_e6c056cb4c1d1e2b01fea64417f"`);
        await queryRunner.query(`ALTER TABLE "user_warehouses" DROP CONSTRAINT "FK_88734270926a01dab68cd7db072"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_7ae6334059289559722437bcc1c"`);
        await queryRunner.query(`ALTER TABLE "inventory_transactions" DROP CONSTRAINT "FK_e51672a4898b02f686769f71c2a"`);
        await queryRunner.query(`ALTER TABLE "inventory_transactions" DROP CONSTRAINT "FK_d49bcd38118deceaeb969a54e4f"`);
        await queryRunner.query(`ALTER TABLE "inventory_transactions" DROP CONSTRAINT "FK_2520d97de0c9a0fbfc9b00f4c1b"`);
        await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT "FK_9a5f6868c96e0069e699f33e124"`);
        await queryRunner.query(`ALTER TABLE "inventory" DROP CONSTRAINT "FK_5d9d73a4c5fe0202714a51e4649"`);
        await queryRunner.query(`ALTER TABLE "inventory" DROP CONSTRAINT "FK_732fdb1f76432d65d2c136340dc"`);
        await queryRunner.query(`ALTER TABLE "warehouses" DROP CONSTRAINT "FK_3fcbfd5832b46945f514a7d1f56"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e6c056cb4c1d1e2b01fea64417"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_88734270926a01dab68cd7db07"`);
        await queryRunner.query(`DROP TABLE "user_warehouses"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_tx_warehouse_time"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e807ed86bffa19adeaa7b0fac6"`);
        await queryRunner.query(`DROP TABLE "inventory_transactions"`);
        await queryRunner.query(`DROP TYPE "public"."inventory_transactions_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4c9fb58de893725258746385e1"`);
        await queryRunner.query(`DROP TABLE "products"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_966106d4cd7a5d8d3aa45ba444"`);
        await queryRunner.query(`DROP TABLE "inventory"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_83a2f7c3947e29b4e04b6ccc76"`);
        await queryRunner.query(`DROP TABLE "warehouses"`);
        await queryRunner.query(`DROP TABLE "companies"`);
        await queryRunner.query(`DROP TABLE "product_categories"`);
    }

}
