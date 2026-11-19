"""Copy the CloudWMS database from local PostgreSQL into the RDS instance.

Source credentials come from CloudWMS/server/.env (DB_HOST, DB_PORT, DB_USERNAME,
DB_PASSWORD, DB_NAME). Target credentials come from the Secrets Manager secret
created by the foundation stack, so no RDS password is ever typed or printed.

    python scripts/python/migrate_db_to_rds.py -e dev                 # dry run: checks only
    python scripts/python/migrate_db_to_rds.py -e dev --apply         # copy into an EMPTY database
    python scripts/python/migrate_db_to_rds.py -e dev --apply --target-host localhost --target-port 7001

Safety:
  * Refuses to write into a target that already has tables unless --replace is given
    (which drops and recreates the objects in the dump).
  * Passwords are passed to pg_dump/pg_restore via environment variables, never argv.
  * Afterwards, row counts of every table are compared between source and target.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from aws_common import ENVIRONMENTS, PROJECT, session

REPO = Path(__file__).resolve().parents[2]
SERVER_ENV = REPO / "CloudWMS" / "server" / ".env"


def read_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            values[key.strip()] = value.strip()
    return values


def find_pg_bin(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit)
    found = shutil.which("pg_dump")
    if found:
        return Path(found).parent
    candidates = sorted(Path("C:/Program Files/PostgreSQL").glob("*/bin"), reverse=True)
    if candidates:
        return candidates[0]
    sys.exit("pg_dump not found. Install the PostgreSQL client tools or pass --pg-bin.")


class Conn:
    def __init__(self, host: str, port: int, user: str, password: str, db: str, sslmode: str) -> None:
        self.host, self.port, self.user, self.password, self.db, self.sslmode = host, port, user, password, db, sslmode

    def env(self) -> dict[str, str]:
        e = dict(os.environ)
        e.update(PGHOST=self.host, PGPORT=str(self.port), PGUSER=self.user,
                 PGPASSWORD=self.password, PGDATABASE=self.db, PGSSLMODE=self.sslmode,
                 PGCONNECT_TIMEOUT="10")
        return e

    def __str__(self) -> str:
        return f"{self.user}@{self.host}:{self.port}/{self.db} (sslmode={self.sslmode})"


def psql(pg_bin: Path, conn: Conn, sql: str) -> str:
    res = subprocess.run(
        [str(pg_bin / "psql"), "-X", "-tA", "-v", "ON_ERROR_STOP=1", "-c", sql],
        env=conn.env(), capture_output=True, text=True,
    )
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip())
    return res.stdout.strip()


def table_counts(pg_bin: Path, conn: Conn) -> dict[str, int]:
    tables = psql(pg_bin, conn, "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1")
    counts = {}
    for t in filter(None, tables.splitlines()):
        counts[t] = int(psql(pg_bin, conn, f'SELECT count(*) FROM public."{t}"'))
    return counts


def target_from_secret(env: str, region: str | None, secret_arn: str | None) -> dict:
    sess = session(region)
    if not secret_arn:
        outputs = sess.client("cloudformation").describe_stacks(StackName=f"{PROJECT}-{env}")["Stacks"][0]["Outputs"]
        secret_arn = next((o["OutputValue"] for o in outputs if o["OutputKey"] == "DbSecretArn"), None)
        if not secret_arn:
            sys.exit(f"Stack {PROJECT}-{env} has no DbSecretArn output (deployed in the primary region?)")
    return json.loads(sess.client("secretsmanager").get_secret_value(SecretId=secret_arn)["SecretString"])


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--environment", "-e", choices=ENVIRONMENTS, default="dev")
    p.add_argument("--region", "-r")
    p.add_argument("--apply", action="store_true", help="Actually copy data (default: checks only)")
    p.add_argument("--replace", action="store_true", help="Allow overwriting a target that already has tables")
    p.add_argument("--target-secret-arn", help="Override the secret (default: stack output DbSecretArn)")
    p.add_argument("--target-host", help="Override host from the secret (e.g. localhost for a tunnel)")
    p.add_argument("--target-port", type=int, help="Override port from the secret")
    p.add_argument("--target-sslmode", default="require", help="require (default) / verify-full / disable")
    p.add_argument("--pg-bin", help="Directory containing pg_dump, pg_restore and psql")
    a = p.parse_args()

    pg_bin = find_pg_bin(a.pg_bin)
    local = read_env_file(SERVER_ENV)
    source = Conn(local.get("DB_HOST", "localhost"), int(local.get("DB_PORT", 5432)),
                  local.get("DB_USERNAME", "postgres"), local.get("DB_PASSWORD", ""),
                  local.get("DB_NAME", "technova_wms"), "prefer")

    secret = target_from_secret(a.environment, a.region, a.target_secret_arn)
    target = Conn(a.target_host or secret["host"], a.target_port or int(secret["port"]),
                  secret["username"], secret["password"], secret.get("dbname", "technova_wms"), a.target_sslmode)

    print(f"Source: {source}")
    print(f"Target: {target}")

    try:
        src_counts = table_counts(pg_bin, source)
    except RuntimeError as exc:
        sys.exit(f"Cannot read source database: {exc}")
    print(f"Source has {len(src_counts)} tables, {sum(src_counts.values())} rows")

    try:
        existing = int(psql(pg_bin, target, "SELECT count(*) FROM pg_tables WHERE schemaname='public'"))
    except RuntimeError as exc:
        sys.exit(f"Cannot connect to target database: {exc}")
    print(f"Target reachable; it currently has {existing} table(s)")

    if existing and not a.replace:
        sys.exit("Target is not empty. Re-run with --replace to overwrite it (objects in the dump are dropped first).")
    if not a.apply:
        print("\nChecks passed. Re-run with --apply to copy the data.")
        return 0

    with tempfile.TemporaryDirectory() as tmp:
        dump = Path(tmp) / "cloudwms.dump"
        print("Dumping source ...")
        subprocess.run([str(pg_bin / "pg_dump"), "-Fc", "--no-owner", "--no-privileges", "-f", str(dump)],
                       env=source.env(), check=True)
        print(f"Restoring into target ({dump.stat().st_size // 1024} KiB) ...")
        cmd = [str(pg_bin / "pg_restore"), "--no-owner", "--no-privileges", "--exit-on-error", "-d", target.db]
        if a.replace:
            cmd += ["--clean", "--if-exists"]
        subprocess.run(cmd + [str(dump)], env=target.env(), check=True)

    dst_counts = table_counts(pg_bin, target)
    print(f"\n{'table':<28}{'source':>10}{'target':>10}")
    ok = True
    for t, n in src_counts.items():
        m = dst_counts.get(t)
        flag = "" if m == n else "   <-- MISMATCH"
        ok &= m == n
        print(f"{t:<28}{n:>10}{m if m is not None else '-':>10}{flag}")
    print("\nMigration verified: all row counts match." if ok else "\nMigration finished WITH MISMATCHES - investigate before switching the app over.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
