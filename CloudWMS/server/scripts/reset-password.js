#!/usr/bin/env node
/**
 * Reset a user's password from the command line (e.g. a forgotten first-admin password).
 * Also unlocks the account and signs the user out of every existing session.
 *
 *   npm run build
 *   npm run reset-password -- admin@technova.local
 *
 * The new password is read from the RESET_PASSWORD environment variable if set,
 * otherwise a strong one is generated and printed once.
 * Uses the same database settings as the API (.env, incl. DB_SECRET_ARN).
 */
require('reflect-metadata');
const path = require('path');
const { randomBytes } = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { ConfigService } = require('@nestjs/config');
const { DataSource } = require('typeorm');
const { buildTypeOrmOptions } = require('../dist/config/database.config');
const { hashPassword, PASSWORD_MIN_LENGTH } = require('../dist/modules/auth/password');

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  if (!email) {
    console.error('Usage: npm run reset-password -- <email>');
    process.exit(2);
  }
  let password = process.env.RESET_PASSWORD;
  const generated = !password;
  if (generated) password = randomBytes(12).toString('base64url');
  if (password.length < PASSWORD_MIN_LENGTH) {
    console.error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
    process.exit(2);
  }

  const options = await buildTypeOrmOptions(new ConfigService(process.env));
  const ds = new DataSource({ ...options, synchronize: false, logging: false });
  await ds.initialize();
  try {
    const res = await ds.query(
      `UPDATE users
          SET "passwordHash" = $1, "tokenVersion" = "tokenVersion" + 1,
              "failedLoginAttempts" = 0, "lockedUntil" = NULL, "isActive" = true
        WHERE LOWER(email) = $2
        RETURNING email, role`,
      [await hashPassword(password), email],
    );
    const rows = Array.isArray(res[0]) ? res[0] : res;
    if (!rows.length) {
      console.error(`No user with email ${email}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Password reset for ${rows[0].email} (${rows[0].role}); account unlocked and other sessions signed out.`);
    if (generated) console.log(`New password: ${password}`);
  } finally {
    await ds.destroy();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
