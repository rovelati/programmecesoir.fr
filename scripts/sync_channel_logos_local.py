#!/usr/bin/env python3
"""
Backfill channel logos to local filesystem and update channels table with local URLs.

Usage:
  python3 sync_channel_logos_local.py --dry-run
  python3 sync_channel_logos_local.py
"""

import argparse
from typing import Dict, List

from epg_importer import (
    CHANNELS_TABLE,
    execute_with_retry,
    get_supabase_client,
    logger,
    mirror_channel_logo,
)


def fetch_channels(supabase, limit: int = 0) -> List[Dict]:
    rows: List[Dict] = []
    batch_size = 500
    offset = 0

    while True:
        result = execute_with_retry(
            supabase.table(CHANNELS_TABLE)
            .select('channel_id, logo_url')
            .order('channel_id')
            .range(offset, offset + batch_size - 1),
            label='fetch channels'
        )
        data = getattr(result, 'data', None) or []
        if not data:
            break

        rows.extend(data)
        if limit and len(rows) >= limit:
            return rows[:limit]
        if len(data) < batch_size:
            break
        offset += batch_size

    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description='Mirror channel logos locally and update DB paths.')
    parser.add_argument('--dry-run', action='store_true', help='Do not write DB updates')
    parser.add_argument('--limit', type=int, default=0, help='Process only first N channels')
    args = parser.parse_args()

    supabase = get_supabase_client()
    channels = fetch_channels(supabase, args.limit)

    logger.info(f"Loaded {len(channels)} channels from {CHANNELS_TABLE}")

    changed = 0
    updated = 0
    failed = 0

    for row in channels:
        channel_id = str(row.get('channel_id') or '').strip()
        current_logo = str(row.get('logo_url') or '').strip()
        if not channel_id:
            continue

        try:
            localized_logo = mirror_channel_logo(channel_id, current_logo)
        except Exception as e:
            failed += 1
            logger.warning(f"[{channel_id}] logo mirror error: {str(e)}")
            continue

        if not localized_logo or localized_logo == current_logo:
            continue

        changed += 1
        logger.info(f"[{channel_id}] {current_logo or '(empty)'} -> {localized_logo}")
        if args.dry_run:
            continue

        try:
            execute_with_retry(
                supabase.table(CHANNELS_TABLE)
                .update({'logo_url': localized_logo})
                .eq('channel_id', channel_id),
                label=f'update logo_url {channel_id}'
            )
            updated += 1
        except Exception as e:
            failed += 1
            logger.warning(f"[{channel_id}] DB update failed: {str(e)}")

    logger.info("=" * 60)
    logger.info("Local logo sync summary")
    logger.info(f"Channels scanned: {len(channels)}")
    logger.info(f"Channels changed: {changed}")
    logger.info(f"Channels updated: {updated}{' (dry-run)' if args.dry_run else ''}")
    logger.info(f"Failures: {failed}")
    logger.info("=" * 60)
    return 0 if failed == 0 else 1


if __name__ == '__main__':
    raise SystemExit(main())
