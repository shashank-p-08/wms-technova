"""Set up the AWS Organizations structure for TechNova WMS ("subscriptions").

AWS has no "subscription" object. The equivalent isolation, billing and policy
boundary is an AWS *account*, and accounts are grouped under AWS Organizations:

    Root (management account - billing only, no workloads)
    |-- Security            log archive / audit accounts
    |-- Workloads           <- region SCP + tag policy attached here
    |   |-- NonProd         technova-wms-dev, technova-wms-staging
    |   `-- Prod            technova-wms-prod
    `-- Sandbox             personal experiments, aggressively budgeted

Run from the MANAGEMENT account. Default is a dry run that changes nothing.

    python scripts/python/setup_organization.py                 # plan only
    python scripts/python/setup_organization.py --apply         # create org, OUs, policies
    python scripts/python/setup_organization.py --apply --create-accounts \
        --account-email-template "aws+{name}@yourcompany.com"

WARNING: --create-accounts creates real AWS accounts. Closing an account takes
90 days and each needs a unique, monitored email address.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from botocore.exceptions import ClientError

from aws_common import ENVIRONMENTS, PROJECT, session

POLICY_DIR = Path(__file__).resolve().parents[2] / "iam" / "policies"

# OU path -> parent OU path (None = root)
OU_TREE = {
    "Security": None,
    "Workloads": None,
    "Workloads/NonProd": "Workloads",
    "Workloads/Prod": "Workloads",
    "Sandbox": None,
}

ENV_TO_OU = {"dev": "Workloads/NonProd", "staging": "Workloads/NonProd", "prod": "Workloads/Prod"}

POLICIES = [
    # (name, type, file, OU it is attached to)
    (f"{PROJECT}-region-restriction", "SERVICE_CONTROL_POLICY", "region-restriction-scp.json", "Workloads"),
    (f"{PROJECT}-tagging-standard", "TAG_POLICY", "tag-policy.json", "Workloads"),
]


class Org:
    def __init__(self, apply: bool) -> None:
        self.apply = apply
        self.client = session().client("organizations")

    def act(self, description: str) -> bool:
        """Print the action; return True if it should actually run."""
        print(("  APPLY  " if self.apply else "  PLAN   ") + description)
        return self.apply

    # -- organisation + root ------------------------------------------------
    def ensure_organization(self) -> bool:
        try:
            org = self.client.describe_organization()["Organization"]
            print(f"  exists  Organization {org['Id']} (feature set {org['FeatureSet']})")
            if org["FeatureSet"] != "ALL":
                print("  ERROR   Feature set must be ALL for SCPs/tag policies. Enable all features in the console.")
                return False
            return True
        except ClientError as exc:
            if exc.response["Error"]["Code"] != "AWSOrganizationsNotInUseException":
                raise
        if self.act("Create organization with ALL features"):
            self.client.create_organization(FeatureSet="ALL")
            return True
        return False

    def root_id(self) -> str:
        return self.client.list_roots()["Roots"][0]["Id"]

    def ensure_policy_types(self, root_id: str) -> None:
        root = self.client.list_roots()["Roots"][0]
        enabled = {p["Type"] for p in root.get("PolicyTypes", []) if p["Status"] == "ENABLED"}
        for ptype in ("SERVICE_CONTROL_POLICY", "TAG_POLICY"):
            if ptype in enabled:
                print(f"  exists  Policy type {ptype} enabled")
            elif self.act(f"Enable policy type {ptype}"):
                self.client.enable_policy_type(RootId=root_id, PolicyType=ptype)

    # -- OUs ------------------------------------------------------------------
    def ensure_ous(self, root_id: str) -> dict[str, str]:
        ids: dict[str, str] = {}
        for path, parent in OU_TREE.items():
            parent_id = ids.get(parent) if parent else root_id
            name = path.split("/")[-1]
            existing = None
            if parent_id:
                for page in self.client.get_paginator("list_organizational_units_for_parent").paginate(ParentId=parent_id):
                    existing = next((ou for ou in page["OrganizationalUnits"] if ou["Name"] == name), existing)
            if existing:
                print(f"  exists  OU {path} ({existing['Id']})")
                ids[path] = existing["Id"]
            elif self.act(f"Create OU {path}") and parent_id:
                ids[path] = self.client.create_organizational_unit(ParentId=parent_id, Name=name)["OrganizationalUnit"]["Id"]
        return ids

    # -- SCP + tag policy -----------------------------------------------------
    def ensure_policies(self, ou_ids: dict[str, str]) -> None:
        for name, ptype, filename, ou_path in POLICIES:
            content = json.dumps(json.loads((POLICY_DIR / filename).read_text(encoding="utf-8")))
            existing = next(
                (
                    p
                    for page in self.client.get_paginator("list_policies").paginate(Filter=ptype)
                    for p in page["Policies"]
                    if p["Name"] == name
                ),
                None,
            )
            if existing:
                policy_id = existing["Id"]
                current = self.client.describe_policy(PolicyId=policy_id)["Policy"]["Content"]
                if json.loads(current) == json.loads(content):
                    print(f"  exists  {ptype} {name} (up to date)")
                elif self.act(f"Update {ptype} {name} from {filename}"):
                    self.client.update_policy(PolicyId=policy_id, Content=content)
            elif self.act(f"Create {ptype} {name} from {filename}"):
                policy_id = self.client.create_policy(
                    Name=name, Type=ptype, Content=content, Description=f"{PROJECT} baseline: {filename}"
                )["Policy"]["PolicySummary"]["Id"]
            else:
                policy_id = None

            target = ou_ids.get(ou_path)
            if not (policy_id and target):
                self.act(f"Attach {name} to OU {ou_path}")
                continue
            targets = {
                t["TargetId"]
                for page in self.client.get_paginator("list_targets_for_policy").paginate(PolicyId=policy_id)
                for t in page["Targets"]
            }
            if target in targets:
                print(f"  exists  {name} attached to OU {ou_path}")
            elif self.act(f"Attach {name} to OU {ou_path}"):
                self.client.attach_policy(PolicyId=policy_id, TargetId=target)

    # -- accounts ("subscriptions") -------------------------------------------
    def ensure_accounts(self, ou_ids: dict[str, str], create: bool, email_template: str | None) -> None:
        accounts = {
            a["Name"]: a
            for page in self.client.get_paginator("list_accounts").paginate()
            for a in page["Accounts"]
        }
        for env in ENVIRONMENTS:
            name = f"{PROJECT}-{env}"
            ou_path = ENV_TO_OU[env]
            account = accounts.get(name)
            if not account:
                if not create:
                    print(f"  PLAN   Create account {name} in OU {ou_path} (re-run with --create-accounts)")
                    continue
                email = email_template.format(name=name, env=env, project=PROJECT)
                if not self.act(f"Create account {name} <{email}> in OU {ou_path}"):
                    continue
                account_id = self._create_account(name, email)
                if not account_id:
                    continue
            else:
                account_id = account["Id"]
                print(f"  exists  Account {name} ({account_id})")

            target = ou_ids.get(ou_path)
            if not target:
                continue
            parent = self.client.list_parents(ChildId=account_id)["Parents"][0]["Id"]
            if parent == target:
                print(f"  exists  {name} is in OU {ou_path}")
            elif self.act(f"Move {name} into OU {ou_path}"):
                self.client.move_account(AccountId=account_id, SourceParentId=parent, DestinationParentId=target)

    def _create_account(self, name: str, email: str) -> str | None:
        req = self.client.create_account(AccountName=name, Email=email, Tags=[
            {"Key": "Project", "Value": PROJECT},
            {"Key": "Environment", "Value": name.rsplit("-", 1)[-1]},
        ])["CreateAccountStatus"]
        for _ in range(60):  # account creation is asynchronous; usually < 2 minutes
            status = self.client.describe_create_account_status(CreateAccountRequestId=req["Id"])["CreateAccountStatus"]
            if status["State"] == "SUCCEEDED":
                print(f"          -> created {status['AccountId']}")
                return status["AccountId"]
            if status["State"] == "FAILED":
                print(f"  ERROR   {name}: {status.get('FailureReason')}")
                return None
            time.sleep(5)
        print(f"  ERROR   {name}: timed out waiting for account creation")
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="Make changes (default is a dry run)")
    parser.add_argument("--create-accounts", action="store_true", help="Also create the dev/staging/prod member accounts")
    parser.add_argument("--account-email-template", help="e.g. 'aws+{name}@yourcompany.com' - required with --create-accounts")
    args = parser.parse_args()

    if args.create_accounts and not args.account_email_template:
        parser.error("--create-accounts requires --account-email-template")

    org = Org(apply=args.apply)
    print(f"TechNova WMS organization setup ({'APPLY' if args.apply else 'DRY RUN - no changes'})")

    if not org.ensure_organization():
        print("\nOrganization does not exist yet; remaining steps shown as plan only.")
        for path in OU_TREE:
            print(f"  PLAN   Create OU {path}")
        for name, ptype, filename, ou in POLICIES:
            print(f"  PLAN   Create {ptype} {name} and attach to OU {ou}")
        for env in ENVIRONMENTS:
            print(f"  PLAN   Create account {PROJECT}-{env} in OU {ENV_TO_OU[env]}")
        return 0

    root_id = org.root_id()
    org.ensure_policy_types(root_id)
    ou_ids = org.ensure_ous(root_id)
    org.ensure_policies(ou_ids)
    org.ensure_accounts(ou_ids, args.create_accounts, args.account_email_template)
    print("\nDone." if args.apply else "\nDry run complete. Re-run with --apply to make these changes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
