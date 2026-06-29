from __future__ import annotations

import argparse
import os
import sys

from api.apps.services.contract_screening_internal_model_migration import ensure_contract_agent_internal_models


def main() -> int:
    parser = argparse.ArgumentParser(description="Configure contract-agent to use Sprixin internal models.")
    parser.add_argument(
        "--tenant-id",
        default=os.getenv("CONTRACT_AGENT_TENANT_ID"),
        required=not os.getenv("CONTRACT_AGENT_TENANT_ID"),
    )
    parser.add_argument(
        "--kb-id",
        action="append",
        default=[],
        help="Knowledge base ID to switch to internal embedding. Repeat for multiple KBs.",
    )
    parser.add_argument(
        "--api-key",
        default=os.getenv("SPRIXIN_MODEL_API_KEY"),
        required=not os.getenv("SPRIXIN_MODEL_API_KEY"),
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    kb_ids = args.kb_id or [item for item in os.getenv("CONTRACT_AGENT_KB_IDS", "").split(",") if item]
    if not kb_ids:
        print("At least one --kb-id or CONTRACT_AGENT_KB_IDS value is required.", file=sys.stderr)
        return 2

    result = ensure_contract_agent_internal_models(
        tenant_id=args.tenant_id,
        api_key=args.api_key,
        kb_ids=kb_ids,
        dry_run=args.dry_run,
    )
    print(f"chat_id={result.chat_id}")
    print(f"embedding_id={result.embedding_id}")
    print(f"rerank_id={result.rerank_id}")
    print("dry_run=true" if args.dry_run else "dry_run=false")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
