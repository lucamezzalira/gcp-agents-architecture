from __future__ import annotations

import argparse

from health_agent.persist import connect, migrate, record_decision


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--id", required=True)
    parser.add_argument("--rule-id", required=True)
    parser.add_argument("--path-glob", required=True)
    parser.add_argument("--decision", default="accept")
    parser.add_argument("--rationale", required=True)
    parser.add_argument("--decided-by", required=True)
    args = parser.parse_args()
    conn = connect()
    migrate(conn)
    record_decision(
        conn,
        decision_id=args.id,
        rule_id=args.rule_id,
        path_glob=args.path_glob,
        decision=args.decision,
        rationale=args.rationale,
        decided_by=args.decided_by,
    )
    print(args.id)


if __name__ == "__main__":
    main()
