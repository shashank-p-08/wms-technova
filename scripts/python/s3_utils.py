"""Work with the CloudWMS assets bucket created by the foundation stack.

The bucket name is read from the CloudFormation stack output, so you never have
to copy the account/region-suffixed name by hand.

    python scripts/python/s3_utils.py bucket  -e dev
    python scripts/python/s3_utils.py upload  -e dev ./hero.png products/hero.png
    python scripts/python/s3_utils.py list    -e dev --prefix products/
    python scripts/python/s3_utils.py download -e dev products/hero.png ./hero-copy.png
    python scripts/python/s3_utils.py presign -e dev products/hero.png --expires 900
"""

from __future__ import annotations

import argparse
import sys

from botocore.exceptions import ClientError

from aws_common import ENVIRONMENTS, PROJECT, session


def bucket_for(sess, env: str) -> str:
    stack = f"{PROJECT}-{env}"
    try:
        outputs = sess.client("cloudformation").describe_stacks(StackName=stack)["Stacks"][0].get("Outputs", [])
    except ClientError as exc:
        sys.exit(f"Stack {stack} not found in {sess.region_name}: deploy it first ({exc.response['Error']['Code']})")
    for out in outputs:
        if out["OutputKey"] == "AssetsBucketName":
            return out["OutputValue"]
    sys.exit(f"Stack {stack} has no AssetsBucketName output")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["bucket", "list", "upload", "download", "presign"])
    parser.add_argument("args", nargs="*")
    parser.add_argument("--environment", "-e", choices=ENVIRONMENTS, default="dev")
    parser.add_argument("--region", "-r")
    parser.add_argument("--prefix", default="")
    parser.add_argument("--expires", type=int, default=3600, help="Presigned URL lifetime in seconds")
    a = parser.parse_args()

    sess = session(a.region)
    s3 = sess.client("s3")
    bucket = bucket_for(sess, a.environment)

    need = {"upload": 2, "download": 2, "presign": 1}.get(a.command, 0)
    if len(a.args) != need:
        parser.error(f"'{a.command}' takes {need} positional argument(s)")

    if a.command == "bucket":
        print(bucket)
    elif a.command == "list":
        count = 0
        for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=a.prefix):
            for obj in page.get("Contents", []):
                count += 1
                print(f"{obj['LastModified']:%Y-%m-%d %H:%M}  {obj['Size']:>10}  {obj['Key']}")
        print(f"{count} object(s) in s3://{bucket}/{a.prefix}")
    elif a.command == "upload":
        src, key = a.args
        s3.upload_file(src, bucket, key)
        print(f"Uploaded {src} -> s3://{bucket}/{key}")
    elif a.command == "download":
        key, dest = a.args
        s3.download_file(bucket, key, dest)
        print(f"Downloaded s3://{bucket}/{key} -> {dest}")
    elif a.command == "presign":
        (key,) = a.args
        print(s3.generate_presigned_url("get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=a.expires))
    return 0


if __name__ == "__main__":
    sys.exit(main())
