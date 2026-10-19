#!/usr/bin/env python3
"""Notify published canonical URLs from current sitemaps & targeted time slots to IndexNow & Bing.
Segmented by time-slot:
  - EVENING (17:00 - 22:59): Targeted prime-time & evening guide (/ce-soir/, /film-ce-soir/, /series-ce-soir/, /sport-ce-soir/, /ce-soir/tf1, etc.)
  - DAYTIME (07:00 - 16:59): Targeted daytime & live guide (/, /en-direct/, /demain/, top channels)
  - NIGHT (23:00 - 06:59): Targeted tomorrow guide (/demain/, /demain/tf1, etc.)

No database access. Ephemeral /programme/... URLs are strictly excluded.
"""
from __future__ import annotations
import argparse
from datetime import datetime
import fcntl
import json
import os
from pathlib import Path
import urllib.request
from urllib.parse import urlparse
import xml.etree.ElementTree as ET
try:
    import zoneinfo
except ImportError:
    from backports import zoneinfo

HOST = 'programmecesoir.fr'
SITE_URL = f'https://{HOST}'
KEY = 'c491fade6de847b39a3bfce7e3e018d9'
KEY_LOCATION = f'{SITE_URL}/{KEY}.txt'
USER_AGENT = 'ProgrammeCeSoir-IndexNow/2.0 (+https://programmecesoir.fr)'
INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'
YANDEX_ENDPOINT = 'https://yandex.com/indexnow'
BING_API_KEY = os.getenv('BING_API_KEY', '4f25c5dc3491468f8459b92c21bb3ac1').strip()

# Only canonical hubs and channel schedules are submitted to IndexNow.
# Ephemeral /programme/... URLs must NEVER be submitted to IndexNow to avoid crawl budget dilution and thin-content penalties.
SITEMAPS = ('/sitemap-channels.xml', '/sitemap-0.xml')
NS = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}

TOP_TNT_CHANNELS = [
    'tf1', 'france-2', 'france-3', 'canal-plus', 'france-5', 'm6', 'arte',
    'c8', 'w9', 'tmc', 'tfx', 'nrj12', 'lcp-public-senat', 'france-4',
    'bfm-tv', 'cnews', 'cstar', 'gulli', 'culturebox', 'lequipe',
    '6ter', 'rmc-story', 'rmc-decouverte', 'cherie-25', 'lci', 'franceinfo'
]


def get_time_slot(override: str | None = None) -> str:
    if override in ('evening', 'daytime', 'night'):
        return override
    try:
        now_paris = datetime.now(zoneinfo.ZoneInfo("Europe/Paris"))
    except Exception:
        now_paris = datetime.now()
    hour = now_paris.hour
    if 17 <= hour < 23:
        return 'evening'
    if hour >= 23 or hour < 7:
        return 'night'
    return 'daytime'


def get_targeted_urls(slot: str) -> list[str]:
    urls = []
    if slot == 'evening':
        # Focus soirée / prime-time
        urls.extend([
            f"{SITE_URL}/",
            f"{SITE_URL}/ce-soir/",
            f"{SITE_URL}/film-ce-soir/",
            f"{SITE_URL}/series-ce-soir/",
            f"{SITE_URL}/sport-ce-soir/",
            f"{SITE_URL}/documentaires-ce-soir/",
            f"{SITE_URL}/infos-ce-soir/",
        ])
        for ch in TOP_TNT_CHANNELS:
            urls.append(f"{SITE_URL}/ce-soir/{ch}")
            urls.append(f"{SITE_URL}/{ch}")
    elif slot == 'night':
        # Focus nuit / lendemain
        urls.extend([
            f"{SITE_URL}/demain/",
            f"{SITE_URL}/",
        ])
        for ch in TOP_TNT_CHANNELS[:10]:
            urls.append(f"{SITE_URL}/demain/{ch}")
            urls.append(f"{SITE_URL}/{ch}")
    else:
        # Daytime: guide du jour et direct
        urls.extend([
            f"{SITE_URL}/",
            f"{SITE_URL}/en-direct/",
            f"{SITE_URL}/demain/",
        ])
        for ch in TOP_TNT_CHANNELS:
            urls.append(f"{SITE_URL}/{ch}")

    # Deduplicate preserving order
    return list(dict.fromkeys(urls))


def collect_urls(origin: str) -> dict[str, str]:
    found = {}
    for path in SITEMAPS:
        req = urllib.request.Request(origin.rstrip('/') + path, headers={'User-Agent': USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=45) as response:
                root = ET.fromstring(response.read(16_000_000))
        except Exception as e:
            print(f"[IndexNow] Warn: failed to read sitemap {path}: {e}")
            continue
        if root.tag != '{' + NS['s'] + '}urlset':
            continue
        entries = root.findall('s:url', NS)
        for entry in entries:
            url = (entry.findtext('s:loc', '', NS)).strip()
            # Never submit ephemeral programme URLs to IndexNow
            if '/programme/' in url:
                continue
            parsed = urlparse(url)
            if parsed.scheme != 'https' or parsed.netloc != HOST or parsed.query or parsed.fragment:
                continue
            found[url] = entry.findtext('s:lastmod', '', NS).strip()
    return found


def submit_indexnow(urls: list[str], dry_run: bool = False, endpoint: str = INDEXNOW_ENDPOINT) -> bool:
    if not urls:
        return True
    if any(urlparse(u).netloc != HOST or urlparse(u).scheme != 'https' for u in urls):
        raise ValueError('Only canonical HTTPS host URLs may be submitted')
    if dry_run:
        print(f'[IndexNow] Dry run ({endpoint}): {len(urls)} URLs; sample {urls[:5]}')
        return True
    payload = dict(host=HOST, key=KEY, keyLocation=KEY_LOCATION, urlList=urls)
    req = urllib.request.Request(endpoint, data=json.dumps(payload).encode(),
        headers={'Content-Type': 'application/json; charset=utf-8', 'User-Agent': USER_AGENT}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            if response.status not in (200, 202):
                raise RuntimeError(f'IndexNow HTTP {response.status}')
            print(f'[IndexNow] {endpoint} -> {len(urls)} URLs: HTTP {response.status}' +
                  (' (key validation pending)' if response.status == 202 else ''))
    except Exception as e:
        print(f'[IndexNow] {endpoint} error: {e}')
        return False
    return True


def submit_bing_api(urls: list[str], dry_run: bool = False) -> bool:
    if not BING_API_KEY or not urls:
        return True
    if dry_run:
        print(f'[BingAPI] Dry run: {len(urls)} URLs')
        return True
    endpoint = f"https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlBatch?apikey={BING_API_KEY}"
    payload = dict(siteUrl=f"https://{HOST}/", urlList=urls[:100])
    req = urllib.request.Request(endpoint, data=json.dumps(payload).encode(),
        headers={'Content-Type': 'application/json; charset=utf-8', 'User-Agent': USER_AGENT}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            if response.status == 200:
                print(f'[BingAPI] SubmitUrlBatch -> {len(urls[:100])} URLs: HTTP 200 (SUCCESS)')
                return True
            print(f'[BingAPI] SubmitUrlBatch -> HTTP {response.status}')
    except Exception as e:
        print(f'[BingAPI] Error: {e}')
    return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--origin', default=f'https://{HOST}')
    parser.add_argument('--state', default='/var/www/programmecesoir.fr/.indexnow-published.json')
    parser.add_argument('--slot', choices=['auto', 'evening', 'daytime', 'night'], default='auto')
    parser.add_argument('--max-urls', type=int, default=2000)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    slot = get_time_slot(None if args.slot == 'auto' else args.slot)
    targeted_urls = get_targeted_urls(slot)

    print(f"=== ProgrammeCeSoir IndexNow & Bing Targeted Notifier ===")
    print(f"Host: {HOST}")
    print(f"Fascia oraria: [{slot.upper()}]")
    print(f"URL mirate selezionate: {len(targeted_urls)}")

    state = Path(args.state)
    state.parent.mkdir(parents=True, exist_ok=True)
    with open(str(state) + '.lock', 'w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('[IndexNow] Another submission is running'); return

        # 1. First priority: submit targeted URLs for this time slot
        print(f"\n[IndexNow] Notifica mirata per slot {slot.upper()} ({len(targeted_urls)} URLs)...")
        if args.dry_run:
            submit_indexnow(targeted_urls, True)
            submit_bing_api(targeted_urls, True)
        else:
            submit_indexnow(targeted_urls, False, INDEXNOW_ENDPOINT)
            submit_bing_api(targeted_urls, False)

        # 2. Sitemaps delta check (for new channels or changed lastmod)
        accepted = json.loads(state.read_text()) if state.exists() else {}
        current = collect_urls(args.origin)
        new = [u for u in current if u not in accepted and u not in targeted_urls]
        changed = [u for u, v in current.items() if u in accepted and accepted[u] != v and u not in targeted_urls]
        pending = (new + changed)[:args.max_urls]

        if pending:
            print(f"[IndexNow] {len(pending)} URL aggiuntive rilevate da sitemap...")
            for start in range(0, len(pending), 250):
                batch = pending[start:start + 250]
                submit_indexnow(batch, args.dry_run, INDEXNOW_ENDPOINT)
                accepted.update({u: current[u] for u in batch})
                tmp = state.with_suffix('.tmp')
                tmp.write_text(json.dumps(accepted, ensure_ascii=False))
                os.replace(tmp, state)
        else:
            print(f"[IndexNow] Nessuna URL nuova da sitemap (delta 0).")

        # Save accepted state for targeted URLs
        for u in targeted_urls:
            accepted[u] = datetime.now().strftime('%Y-%m-%d')
        tmp = state.with_suffix('.tmp')
        tmp.write_text(json.dumps(accepted, ensure_ascii=False))
        os.replace(tmp, state)

    print("\n[IndexNow] Processo completato con successo.")


if __name__ == '__main__':
    main()
