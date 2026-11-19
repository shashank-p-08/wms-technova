"""Cloud-fundamentals health check for TechNova WMS.

Reports on the five baseline areas and exits non-zero if a hard check fails:

  1. Identity      - who am I, which account ("subscription") am I in?
  2. Regions       - is the active region approved? which AZs does it have?
  3. IAM           - root MFA, password policy, policies attached directly to users
  4. Resource group- every resource for the project/environment, plus tag compliance
  5. Database      - RDS encrypted, private, backed up (+ Multi-AZ for prod)
  6. Cost          - budgets configured for the account

Usage:
    python scripts/python/check_aws.py --environment dev
    python scripts/python/check_aws.py --environment prod --region us-west-2 --strict
"""

from __future__ import annotations

import argparse
import sys

from botocore.exceptions import BotoCoreError, ClientError

from aws_common import (
    APPROVED_REGIONS,
    ENVIRONMENTS,
    PRIMARY_REGION,
    PROJECT,
    REQUIRED_TAGS,
    is_local,
    session,
)


class Report:
    def __init__(self) -> None:
        self.failures = 0
        self.warnings = 0

    @staticmethod
    def section(title: str) -> None:
        print(f"\n== {title} " + "=" * max(0, 60 - len(title)))

    @staticmethod
    def ok(msg: str) -> None:
        print(f"  [ OK ] {msg}")

    @staticmethod
    def info(msg: str) -> None:
        print(f"         {msg}")

    def warn(self, msg: str) -> None:
        self.warnings += 1
        print(f"  [WARN] {msg}")

    def fail(self, msg: str) -> None:
        self.failures += 1
        print(f"  [FAIL] {msg}")


def _err(exc: Exception) -> str:
    if isinstance(exc, ClientError):
        return exc.response.get("Error", {}).get("Code", str(exc))
    return str(exc)


def check_identity(sess, r: Report) -> str | None:
    r.section("1. Identity / account")
    try:
        ident = sess.client("sts").get_caller_identity()
    except (ClientError, BotoCoreError) as exc:
        r.fail(f"Cannot authenticate: {_err(exc)}")
        return None
    r.ok(f"Account  : {ident['Account']}")
    r.info(f"Principal: {ident['Arn']}")
    if ident["Arn"].endswith(":root"):
        r.fail("Running as the ROOT user - use an IAM role / Identity Center user instead")
    try:
        org = sess.client("organizations").describe_organization()["Organization"]
        r.ok(f"Member of AWS Organization {org['Id']} (feature set: {org['FeatureSet']})")
    except ClientError as exc:
        if _err(exc) == "AWSOrganizationsNotInUseException":
            r.warn("Account is not in an AWS Organization - run setup_organization.py")
        else:
            r.info(f"Organization lookup skipped: {_err(exc)}")
    return ident["Account"]


def check_region(sess, r: Report) -> None:
    r.section("2. Region")
    region = sess.region_name
    if region in APPROVED_REGIONS:
        role = "primary" if region == PRIMARY_REGION else "disaster recovery"
        r.ok(f"Active region {region} is approved ({role})")
    else:
        r.fail(f"Active region {region} is NOT approved. Allowed: {', '.join(APPROVED_REGIONS)}")
    try:
        azs = sess.client("ec2").describe_availability_zones(
            Filters=[{"Name": "state", "Values": ["available"]}]
        )["AvailabilityZones"]
        names = sorted(az["ZoneName"] for az in azs)
        if len(names) >= 2:
            r.ok(f"{len(names)} availability zones available: {', '.join(names)}")
        else:
            r.warn(f"Only {len(names)} AZ(s) - multi-AZ high availability not possible")
    except (ClientError, BotoCoreError) as exc:
        r.info(f"AZ lookup skipped: {_err(exc)}")


def check_iam(sess, r: Report) -> None:
    r.section("3. IAM")
    iam = sess.client("iam")

    try:
        summary = iam.get_account_summary()["SummaryMap"]
        if summary.get("AccountMFAEnabled") == 1:
            r.ok("Root user has MFA enabled")
        else:
            r.fail("Root user does NOT have MFA enabled")
        if summary.get("AccountAccessKeysPresent", 0):
            r.fail("Root user has access keys - delete them")
        else:
            r.ok("Root user has no access keys")
    except (ClientError, BotoCoreError) as exc:
        r.info(f"Account summary skipped: {_err(exc)}")

    try:
        pp = iam.get_account_password_policy()["PasswordPolicy"]
        if pp.get("MinimumPasswordLength", 0) >= 14:
            r.ok(f"Password policy: min length {pp['MinimumPasswordLength']}")
        else:
            r.warn(f"Password policy min length {pp.get('MinimumPasswordLength')} < 14")
    except ClientError as exc:
        if _err(exc) == "NoSuchEntity":
            r.warn("No account password policy set")
        else:
            r.info(f"Password policy skipped: {_err(exc)}")

    try:
        offenders = []
        for page in iam.get_paginator("list_users").paginate():
            for user in page["Users"]:
                name = user["UserName"]
                attached = iam.list_attached_user_policies(UserName=name)["AttachedPolicies"]
                inline = iam.list_user_policies(UserName=name)["PolicyNames"]
                if attached or inline:
                    offenders.append(name)
        if offenders:
            r.warn(f"Policies attached directly to users (use groups/roles): {', '.join(offenders)}")
        else:
            r.ok("No policies attached directly to IAM users")
    except (ClientError, BotoCoreError) as exc:
        r.info(f"User policy scan skipped: {_err(exc)}")

    try:
        roles = [
            role["RoleName"]
            for page in iam.get_paginator("list_roles").paginate()
            for role in page["Roles"]
            if role["RoleName"].startswith(PROJECT)
        ]
        if roles:
            r.ok(f"Project roles: {', '.join(sorted(roles))}")
        else:
            r.warn("No project IAM roles found - has the foundation stack been deployed?")
    except (ClientError, BotoCoreError) as exc:
        r.info(f"Role listing skipped: {_err(exc)}")


def check_resource_group(sess, env: str, r: Report) -> None:
    r.section(f"4. Resource group {PROJECT}-{env}")
    group = f"{PROJECT}-{env}"
    arns: list[str] = []
    try:
        pages = sess.client("resource-groups").get_paginator("list_group_resources").paginate(Group=group)
        arns = [res["Identifier"]["ResourceArn"] for page in pages for res in page["Resources"]]
        r.ok(f"Resource group '{group}' resolves to {len(arns)} resource(s)")
    except (ClientError, BotoCoreError) as exc:
        # Floci only emulates capacity-reservation groups; fall back to the tagging API,
        # which is exactly what a TAG_FILTERS_1_0 resource group queries under the hood.
        note = "expected on Floci" if is_local() else "has the stack been deployed?"
        r.info(f"Resource group lookup failed ({_err(exc)}, {note}); using tag query instead")

    tagging = sess.client("resourcegroupstaggingapi")
    try:
        mappings = [
            m
            for page in tagging.get_paginator("get_resources").paginate(
                TagFilters=[
                    {"Key": "Project", "Values": [PROJECT]},
                    {"Key": "Environment", "Values": [env]},
                ]
            )
            for m in page["ResourceTagMappingList"]
        ]
    except (ClientError, BotoCoreError) as exc:
        r.fail(f"Tag query failed: {_err(exc)}")
        return

    if not mappings and not arns:
        r.warn(f"No resources tagged Project={PROJECT}, Environment={env}")
        return

    for m in mappings:
        tags = {t["Key"]: t["Value"] for t in m.get("Tags", [])}
        missing = [k for k in REQUIRED_TAGS if k not in tags]
        if missing:
            r.fail(f"{m['ResourceARN']} missing tags: {', '.join(missing)}")
        else:
            r.ok(f"{m['ResourceARN']}")


def check_database(sess, env: str, r: Report) -> None:
    r.section("5. Database (RDS)")
    ident = f"{PROJECT}-{env}-db"
    try:
        db = sess.client("rds").describe_db_instances(DBInstanceIdentifier=ident)["DBInstances"][0]
    except ClientError as exc:
        if _err(exc) == "DBInstanceNotFound":
            if sess.region_name == PRIMARY_REGION:
                r.warn(f"No RDS instance {ident} - has the stack been deployed?")
            else:
                r.ok(f"No database in DR region {sess.region_name} (expected: database lives in {PRIMARY_REGION})")
        else:
            r.info(f"RDS lookup skipped: {_err(exc)}")
        return
    except BotoCoreError as exc:
        r.info(f"RDS lookup skipped: {exc}")
        return

    r.ok(f"{ident}: {db['Engine']} {db.get('EngineVersion', '?')} on {db['DBInstanceClass']}, status {db['DBInstanceStatus']}")
    (r.ok if db.get("StorageEncrypted") else r.fail)(
        "Storage encrypted at rest" if db.get("StorageEncrypted") else "Storage is NOT encrypted"
    )
    (r.fail if db.get("PubliclyAccessible") else r.ok)(
        "Database is PUBLICLY accessible" if db.get("PubliclyAccessible") else "Not publicly accessible"
    )
    days = db.get("BackupRetentionPeriod", 0)
    (r.ok if days >= 1 else r.fail)(f"Automated backups retained {days} day(s)")
    if env == "prod":
        (r.ok if db.get("MultiAZ") else r.fail)("Multi-AZ enabled" if db.get("MultiAZ") else "Prod database is NOT Multi-AZ")
        (r.ok if db.get("DeletionProtection") else r.fail)(
            "Deletion protection on" if db.get("DeletionProtection") else "Prod database has NO deletion protection"
        )

    try:
        sess.client("secretsmanager").describe_secret(SecretId=f"{PROJECT}/{env}/db-master")
        r.ok(f"Credentials stored in Secrets Manager ({PROJECT}/{env}/db-master)")
    except ClientError as exc:
        r.fail(f"Database secret {PROJECT}/{env}/db-master not found ({_err(exc)})")


def check_budgets(sess, account_id: str, r: Report) -> None:
    r.section("6. Cost / budgets")
    try:
        budgets = sess.client("budgets").describe_budgets(AccountId=account_id).get("Budgets", [])
    except (ClientError, BotoCoreError) as exc:
        r.info(f"Budget lookup skipped: {_err(exc)}")
        return
    ours = [b for b in budgets if b["BudgetName"].startswith(PROJECT)]
    if not ours:
        r.warn("No project budget found - spend is unbounded")
    for b in ours:
        limit = b["BudgetLimit"]
        r.ok(f"{b['BudgetName']}: {limit['Amount']} {limit['Unit']} / {b['TimeUnit'].lower()}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--environment", "-e", choices=ENVIRONMENTS, default="dev")
    parser.add_argument("--region", "-r", help="Override AWS_REGION")
    parser.add_argument("--strict", action="store_true", help="Treat warnings as failures")
    args = parser.parse_args()

    sess = session(args.region)
    r = Report()
    target = "Floci (local emulator)" if is_local() else "AWS"
    print(f"TechNova WMS cloud baseline check -> {target}, env={args.environment}, region={sess.region_name}")

    account_id = check_identity(sess, r)
    if account_id is None:
        return 2
    check_region(sess, r)
    check_iam(sess, r)
    check_resource_group(sess, args.environment, r)
    check_database(sess, args.environment, r)
    check_budgets(sess, account_id, r)

    print(f"\nResult: {r.failures} failure(s), {r.warnings} warning(s)")
    if r.failures or (args.strict and r.warnings):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
