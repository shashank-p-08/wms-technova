"""Shared settings for the TechNova WMS AWS scripts.

Every script works against real AWS *or* the local Floci emulator. boto3 picks
up AWS_ENDPOINT_URL automatically, so pointing at Floci is just:

    $env:AWS_ENDPOINT_URL = "http://localhost:4566"
"""

from __future__ import annotations

import os

import boto3

PROJECT = "technova-wms"
ENVIRONMENTS = ("dev", "staging", "prod")

# Region strategy: one primary region, one disaster-recovery region.
PRIMARY_REGION = "us-east-1"
DR_REGION = "us-west-2"
APPROVED_REGIONS = (PRIMARY_REGION, DR_REGION)

# Every taggable resource must carry these keys (see iam/policies/tag-policy.json).
REQUIRED_TAGS = ("Project", "Environment", "Owner", "CostCenter", "ManagedBy")


def get_region(cli_region: str | None = None) -> str:
    return (
        cli_region
        or os.environ.get("AWS_REGION")
        or os.environ.get("AWS_DEFAULT_REGION")
        or PRIMARY_REGION
    )


def session(region: str | None = None) -> boto3.session.Session:
    return boto3.session.Session(region_name=get_region(region))


def is_local() -> bool:
    """True when talking to the Floci emulator rather than real AWS."""
    endpoint = os.environ.get("AWS_ENDPOINT_URL", "")
    return "localhost" in endpoint or "127.0.0.1" in endpoint
