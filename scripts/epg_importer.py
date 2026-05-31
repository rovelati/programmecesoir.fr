#!/usr/bin/env python3
"""
EPG Importer for programmecesoir.fr
Downloads XMLTV (xmltvfr) and populates Supabase database (FR tables)
Run daily via crontab: 0 0 * * * /usr/bin/python3 /path/to/epg_importer.py
"""

import os
import sys
import logging
import gzip
import io
import time
import json
import uuid
import subprocess
from bisect import bisect_left, bisect_right
from functools import lru_cache
from urllib.parse import quote, urlencode, urlparse
from datetime import datetime, timedelta, date, timezone
from typing import Any, Dict, List, Optional, Tuple
import pytz
import re
import unicodedata
import xml.etree.ElementTree as ET

import requests
from supabase import create_client, Client, ClientOptions
from dotenv import load_dotenv
from postgrest import APIError
from pg_adapter import create_postgres_client

# Load env before reading configuration constants and logger setup.
load_dotenv()

# ============================================
# CONFIGURATION
# ============================================

EPG_XMLTV_URL = os.getenv('EPG_XMLTV_URL', 'https://xmltvfr.fr/xmltv/xmltv_fr.xml.gz')
TIMEZONE = pytz.timezone('Europe/Paris')
BATCH_SIZE = 100
RETENTION_DAYS = int(os.getenv('RETENTION_DAYS', '10'))
DEFAULT_PUBLIC_DIR = '/home/u914016995/domains/programmecesoir.fr/public_html'

# Supabase tables (FR)
CHANNELS_TABLE = os.getenv('SUPABASE_CHANNELS_TABLE', 'channels_fr')
PROGRAMS_TABLE = os.getenv('SUPABASE_PROGRAMS_TABLE', 'programs_fr')
IMPORT_STATUS_TABLE = os.getenv('IMPORT_STATUS_TABLE', 'import_status')
IMPORT_STATUS_ID = os.getenv('IMPORT_STATUS_ID', 'epg_fr')

# Sitemap domain
SITEMAP_DOMAIN = os.getenv('SITEMAP_DOMAIN', 'https://programmecesoir.fr')
INDEXNOW_ENABLED = os.getenv('INDEXNOW_ENABLED', '1') in ('1', 'true', 'yes', 'on')
INDEXNOW_ENDPOINT = os.getenv('INDEXNOW_ENDPOINT', 'https://api.indexnow.org/indexnow').strip()
INDEXNOW_KEY = os.getenv('INDEXNOW_KEY', '').strip()
INDEXNOW_KEY_LOCATION = os.getenv('INDEXNOW_KEY_LOCATION', '').strip()
INDEXNOW_TIMEOUT = int(os.getenv('INDEXNOW_TIMEOUT', '20'))
INDEXNOW_BATCH_SIZE = max(1, min(10000, int(os.getenv('INDEXNOW_BATCH_SIZE', '25'))))
INDEXNOW_REQUEST_DELAY_MS = max(0, int(os.getenv('INDEXNOW_REQUEST_DELAY_MS', '250')))
INDEXNOW_MAX_URLS = max(1, int(os.getenv('INDEXNOW_MAX_URLS', '120')))
INDEXNOW_MAX_RETRIES = max(1, int(os.getenv('INDEXNOW_MAX_RETRIES', '3')))
WEBSUB_ENABLED = os.getenv('WEBSUB_ENABLED', '1') in ('1', 'true', 'yes', 'on')
WEBSUB_HUB_URLS = [u.strip() for u in os.getenv('WEBSUB_HUB_URLS', '').split(',') if u.strip()]
WEBSUB_TIMEOUT = int(os.getenv('WEBSUB_TIMEOUT', '20'))
WEBSUB_TOPIC_BATCH_SIZE = max(1, int(os.getenv('WEBSUB_TOPIC_BATCH_SIZE', '25')))
WEBSUB_REQUEST_DELAY_MS = max(0, int(os.getenv('WEBSUB_REQUEST_DELAY_MS', '750')))
WEBSUB_HUB_DELAY_MS = max(0, int(os.getenv('WEBSUB_HUB_DELAY_MS', '1250')))
WEBSUB_MAX_RETRIES = max(1, int(os.getenv('WEBSUB_MAX_RETRIES', '4')))
WEBSUB_OPTIONAL_HUB_PATTERNS = [
    pattern.strip().lower()
    for pattern in os.getenv(
        'WEBSUB_OPTIONAL_HUB_PATTERNS',
        'pubsubhubbub.appspot.com',
    ).split(',')
    if pattern.strip()
]
NOTIFY_INCLUDE_SITEMAPS = os.getenv('NOTIFY_INCLUDE_SITEMAPS', '1') in ('1', 'true', 'yes', 'on')
GOOGLE_INDEXING_ENABLED = os.getenv('GOOGLE_INDEXING_ENABLED', '0') in ('1', 'true', 'yes', 'on')
GOOGLE_INDEXING_SERVICE_ACCOUNT_FILE = os.getenv('GOOGLE_INDEXING_SERVICE_ACCOUNT_FILE', '').strip()
GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON = os.getenv('GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON', '').strip()
GOOGLE_INDEXING_ENDPOINT = os.getenv('GOOGLE_INDEXING_ENDPOINT', 'https://indexing.googleapis.com/v3/urlNotifications:publish').strip()
GOOGLE_INDEXING_TIMEOUT = int(os.getenv('GOOGLE_INDEXING_TIMEOUT', '20'))
GOOGLE_INDEXING_URL_TYPE = os.getenv('GOOGLE_INDEXING_URL_TYPE', 'URL_UPDATED').strip() or 'URL_UPDATED'
GOOGLE_INDEXING_REQUEST_DELAY_MS = max(0, int(os.getenv('GOOGLE_INDEXING_REQUEST_DELAY_MS', '250')))
GOOGLE_INDEXING_MAX_URLS = max(1, int(os.getenv('GOOGLE_INDEXING_MAX_URLS', '30')))
GOOGLE_INDEXING_MAX_RETRIES = max(1, int(os.getenv('GOOGLE_INDEXING_MAX_RETRIES', '3')))
GOOGLE_INDEXING_DAILY_BUDGET = max(1, int(os.getenv('GOOGLE_INDEXING_DAILY_BUDGET', '30')))
GOOGLE_INDEXING_STATE_PATH = os.getenv(
    'GOOGLE_INDEXING_STATE_PATH',
    os.path.abspath(os.path.join(os.path.dirname(__file__), 'google_indexing_state.json'))
)
GOOGLE_INDEXING_SCOPES = ['https://www.googleapis.com/auth/indexing']
DEFAULT_GOOGLE_INDEXING_TARGETS = 'tf1,france-2,france-3,m6,arte,canal,tmc,w9,cnews,lci'
GOOGLE_INDEXING_TARGET_CHANNELS_RAW = os.getenv('GOOGLE_INDEXING_TARGET_CHANNELS', DEFAULT_GOOGLE_INDEXING_TARGETS)
DEFAULT_GOOGLE_INDEXING_ROOT_PATHS = '/,/en-direct,/demain,/film-ce-soir,/series-ce-soir,/sport-ce-soir'
GOOGLE_INDEXING_ROOT_PATHS_RAW = os.getenv('GOOGLE_INDEXING_ROOT_PATHS', DEFAULT_GOOGLE_INDEXING_ROOT_PATHS)
DEFAULT_GOOGLE_HEAD_PINNED_TARGETS = 'tf1,france-2,france-3,m6,arte,canal'
GOOGLE_HEAD_PINNED_TARGET_CHANNELS_RAW = os.getenv(
    'GOOGLE_HEAD_PINNED_TARGET_CHANNELS',
    DEFAULT_GOOGLE_HEAD_PINNED_TARGETS,
)
DEFAULT_GOOGLE_HEAD_ROTATION_TARGETS = 'france-5,franceinfo,bfm-tv,cstar,gulli,6ter,rmc-decouverte,rmc-story'
GOOGLE_HEAD_ROTATION_TARGET_CHANNELS_RAW = os.getenv(
    'GOOGLE_HEAD_ROTATION_TARGET_CHANNELS',
    DEFAULT_GOOGLE_HEAD_ROTATION_TARGETS,
)
GOOGLE_URL_INSPECTION_ENABLED = os.getenv('GOOGLE_URL_INSPECTION_ENABLED', '0') in ('1', 'true', 'yes', 'on')
GOOGLE_URL_INSPECTION_SITE_URL = os.getenv('GOOGLE_URL_INSPECTION_SITE_URL', SITEMAP_DOMAIN).strip().rstrip('/') + '/'
GOOGLE_URL_INSPECTION_ENDPOINT = os.getenv('GOOGLE_URL_INSPECTION_ENDPOINT', 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect').strip()
GOOGLE_URL_INSPECTION_TIMEOUT = int(os.getenv('GOOGLE_URL_INSPECTION_TIMEOUT', '25'))
GOOGLE_URL_INSPECTION_LANGUAGE_CODE = os.getenv('GOOGLE_URL_INSPECTION_LANGUAGE_CODE', 'fr-FR').strip() or 'fr-FR'
GOOGLE_URL_INSPECTION_SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly']
GOOGLE_SEARCH_ANALYTICS_ENDPOINT_TEMPLATE = os.getenv(
    'GOOGLE_SEARCH_ANALYTICS_ENDPOINT_TEMPLATE',
    'https://www.googleapis.com/webmasters/v3/sites/{site_url}/searchAnalytics/query',
).strip()
GOOGLE_SEARCH_ANALYTICS_ENABLED = os.getenv('GOOGLE_SEARCH_ANALYTICS_ENABLED', '1') in ('1', 'true', 'yes', 'on')
GOOGLE_SEARCH_ANALYTICS_TIMEOUT = int(os.getenv('GOOGLE_SEARCH_ANALYTICS_TIMEOUT', '30'))
GOOGLE_SEARCH_ANALYTICS_DAYS = max(7, int(os.getenv('GOOGLE_SEARCH_ANALYTICS_DAYS', '7')))
GOOGLE_SEARCH_ANALYTICS_DELAY_DAYS = max(0, int(os.getenv('GOOGLE_SEARCH_ANALYTICS_DELAY_DAYS', '3')))
GOOGLE_SEARCH_ANALYTICS_TOP_QUERIES = max(5, int(os.getenv('GOOGLE_SEARCH_ANALYTICS_TOP_QUERIES', '15')))
GOOGLE_URL_INSPECTION_HISTORY_DAYS = max(1, int(os.getenv('GOOGLE_URL_INSPECTION_HISTORY_DAYS', '7')))
GOOGLE_URL_INSPECTION_STABLE_DAYS = max(2, int(os.getenv('GOOGLE_URL_INSPECTION_STABLE_DAYS', '3')))
GOOGLE_HEAD_EXPLORATORY_FORCE_INDEX_LIMIT = max(1, int(os.getenv('GOOGLE_HEAD_EXPLORATORY_FORCE_INDEX_LIMIT', '2')))
GOOGLE_SEARCH_ANALYTICS_REPORT_RELATIVE_PATH = os.getenv(
    'GOOGLE_SEARCH_ANALYTICS_REPORT_RELATIVE_PATH',
    'search-console/search-performance-latest.json',
).strip() or 'search-console/search-performance-latest.json'
GA4_ANALYTICS_ENABLED = os.getenv('GA4_ANALYTICS_ENABLED', '1') in ('1', 'true', 'yes', 'on')
GA4_PROPERTY_ID = os.getenv('GA4_PROPERTY_ID', '').strip()
GA4_MEASUREMENT_ID = os.getenv('GA4_MEASUREMENT_ID', '').strip()
GA4_PROPERTY_DISPLAY_NAME = os.getenv('GA4_PROPERTY_DISPLAY_NAME', '').strip()
GA4_DISCOVERY_ENABLED = os.getenv('GA4_DISCOVERY_ENABLED', '1') in ('1', 'true', 'yes', 'on')
GA4_ACCOUNT_SUMMARIES_ENDPOINT = os.getenv(
    'GA4_ACCOUNT_SUMMARIES_ENDPOINT',
    'https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200',
).strip()
GA4_DATA_STREAMS_ENDPOINT_TEMPLATE = os.getenv(
    'GA4_DATA_STREAMS_ENDPOINT_TEMPLATE',
    'https://analyticsadmin.googleapis.com/v1beta/properties/{property_id}/dataStreams',
).strip()
GA4_DATA_ENDPOINT_TEMPLATE = os.getenv(
    'GA4_DATA_ENDPOINT_TEMPLATE',
    'https://analyticsdata.googleapis.com/v1beta/properties/{property_id}:runReport',
).strip()
GA4_TIMEOUT = int(os.getenv('GA4_TIMEOUT', '30'))
GA4_DAYS = max(7, int(os.getenv('GA4_DAYS', '7')))
GA4_DELAY_DAYS = max(0, int(os.getenv('GA4_DELAY_DAYS', '1')))
GA4_TOP_PAGES = max(5, int(os.getenv('GA4_TOP_PAGES', '10')))
GA4_SCOPES = ['https://www.googleapis.com/auth/analytics.readonly']
DEFAULT_GOOGLE_URL_INSPECTION_TARGETS = 'tf1,france-2,france-3,m6,arte,canal,tmc,w9,cnews,lci'
GOOGLE_URL_INSPECTION_TARGET_CHANNELS_RAW = os.getenv('GOOGLE_URL_INSPECTION_TARGET_CHANNELS', DEFAULT_GOOGLE_URL_INSPECTION_TARGETS)
DEFAULT_GOOGLE_URL_INSPECTION_ROOT_PATHS = '/,/en-direct,/demain,/film-ce-soir,/series-ce-soir,/sport-ce-soir'
GOOGLE_URL_INSPECTION_ROOT_PATHS_RAW = os.getenv(
    'GOOGLE_URL_INSPECTION_ROOT_PATHS',
    DEFAULT_GOOGLE_URL_INSPECTION_ROOT_PATHS,
)
HEAD_CHANNEL_SEO_LINKS: List[Tuple[str, str]] = [
    ('tf1', 'Programme TF1 ce soir'),
    ('france-2', 'Programme France 2 ce soir'),
    ('france-3', 'Programme France 3 ce soir'),
    ('m6', 'Programme M6 ce soir'),
    ('arte', 'Programme ARTE ce soir'),
    ('canal-plus', 'Programme Canal+ ce soir'),
]
IMPORT_PIPELINE_REPORT_RELATIVE_PATH = os.getenv('IMPORT_PIPELINE_REPORT_RELATIVE_PATH', 'search-console/import-pipeline-latest.json').strip() or 'search-console/import-pipeline-latest.json'
SUPABASE_USAGE_REPORT_RELATIVE_PATH = os.getenv('SUPABASE_USAGE_REPORT_RELATIVE_PATH', 'search-console/supabase-usage-latest.json').strip() or 'search-console/supabase-usage-latest.json'
SUPABASE_DB_LIMIT_BYTES = max(1, int(os.getenv('SUPABASE_DB_LIMIT_BYTES', str(512 * 1024 * 1024))))
SUPABASE_EGRESS_LIMIT_BYTES = max(1, int(os.getenv('SUPABASE_EGRESS_LIMIT_BYTES', str(5 * 1024 * 1024 * 1024))))
SUPABASE_MANAGEMENT_TOKEN = os.getenv('SUPABASE_MANAGEMENT_TOKEN', '').strip()
SUPABASE_PROJECT_REF = os.getenv('SUPABASE_PROJECT_REF', '').strip()

IMPORT_PIPELINE_STEPS: List[Tuple[str, str]] = [
    ('supabase_ready', 'Connexion Supabase'),
    ('fetch_parse', 'Téléchargement et parsing XMLTV'),
    ('upsert_channels', 'Mise à jour des chaînes'),
    ('cleanup_old_programs', 'Nettoyage anciens programmes'),
    ('insert_programs', 'Insertion des programmes'),
    ('programs_sitemap', 'Sitemap programmes'),
    ('static_sitemap', 'Sitemap statique'),
    ('html_sitemap', 'Plan du site HTML'),
    ('head_channel_snapshots', 'Routes head canaux'),
    ('entity_airings_refresh', 'Liens futurs fiches entités'),
    ('supabase_usage_report', 'Rapport usage Supabase'),
    ('indexnow', 'Notification IndexNow'),
    ('websub', 'Notification WebSub'),
    ('google_indexing', 'Notification Google Indexing API'),
    ('google_url_inspection', 'Rapport Google URL Inspection'),
    ('google_search_analytics', 'Rapport Google Search Analytics'),
    ('program_share_snapshots', 'Snapshots pages programme'),
]

# Optional allowlist (comma-separated slugs). If set, only these channels are imported.
CHANNEL_ALLOWLIST = [s.strip().lower() for s in os.getenv('CHANNEL_ALLOWLIST', '').split(',') if s.strip()]

SUPABASE_MAX_RETRIES = int(os.getenv('SUPABASE_MAX_RETRIES', '6'))
SUPABASE_RETRY_DELAY = float(os.getenv('SUPABASE_RETRY_DELAY', '2'))
RETENTION_SCAN_LIMIT = int(os.getenv('RETENTION_SCAN_LIMIT', '2000'))
RETENTION_MAX_CYCLES = int(os.getenv('RETENTION_MAX_CYCLES', '40'))
SITEMAP_FUTURE_DAYS = int(os.getenv('SITEMAP_FUTURE_DAYS', '10'))
PROGRAM_SITEMAP_PAST_DAYS = max(0, int(os.getenv('PROGRAM_SITEMAP_PAST_DAYS', '1')))
PROGRAM_SITEMAP_FUTURE_DAYS = max(1, int(os.getenv('PROGRAM_SITEMAP_FUTURE_DAYS', '3')))
PROGRAM_SITEMAP_MAX_URLS = max(1000, int(os.getenv('PROGRAM_SITEMAP_MAX_URLS', '25000')))
_logos_subdir_env = os.getenv('LOGOS_SUBDIR', 'loghi')
LOGOS_SUBDIR = (_logos_subdir_env or 'loghi').strip().strip('/') or 'loghi'
LOGO_DOWNLOAD_TIMEOUT = int(os.getenv('LOGO_DOWNLOAD_TIMEOUT', '20'))
LOGO_MAX_BYTES = int(os.getenv('LOGO_MAX_BYTES', str(2 * 1024 * 1024)))
LOGO_PLACEHOLDER_ON_FAIL = os.getenv('LOGO_PLACEHOLDER_ON_FAIL', '1') in ('1', 'true', 'yes', 'on')
LOGO_USER_AGENT = os.getenv(
    'LOGO_USER_AGENT',
    'ProgrammeCeSoir-LogoSync/1.0 (+https://programmecesoir.fr)'
)
LOGO_EXT_BY_CONTENT_TYPE: Dict[str, str] = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/gif': 'gif',
    'image/avif': 'avif',
}
ALLOWED_LOGO_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'svg', 'gif', 'avif'}
_logo_mirror_cache: Dict[str, Optional[str]] = {}
_resolved_public_dir: Optional[str] = None

# TNT fallback mapping when XMLTV doesn't expose LCN.
# Keep this list conservative: only nationally stable channels.
FR_TNT_CHANNEL_NUMBERS: Dict[str, int] = {
    'tf1': 1,
    'france-2': 2,
    'france-3': 3,
    'canal-plus': 4,
    'canal': 4,
    'france-5': 5,
    'm6': 6,
    'arte': 7,
    'c8': 8,
    'w9': 9,
    'tmc': 10,
    'tfx': 11,
    'nrj12': 12,
    'lci': 13,
    'france-4': 14,
    'bfm-tv': 15,
    'cnews': 16,
    'cstar': 17,
    'gulli': 18,
    '6ter': 21,
    'rmc-decouverte': 23,
    'numero-23': 23,
    'rmc-story': 23,
    'cherie-25': 24,
    'franceinfo': 27,
}

CHANNEL_WIKIDATA_SAME_AS: Dict[str, str] = {
    'tf1': 'https://www.wikidata.org/wiki/Q235729',
    'france-2': 'https://www.wikidata.org/wiki/Q596005',
    'france-3': 'https://www.wikidata.org/wiki/Q596010',
    'canal-plus': 'https://www.wikidata.org/wiki/Q193852',
    'canal': 'https://www.wikidata.org/wiki/Q193852',
    'france-5': 'https://www.wikidata.org/wiki/Q596014',
    'm6': 'https://www.wikidata.org/wiki/Q602487',
    'arte': 'https://www.wikidata.org/wiki/Q161566',
    'c8': 'https://www.wikidata.org/wiki/Q2830516',
    'w9': 'https://www.wikidata.org/wiki/Q2830524',
    'tmc': 'https://www.wikidata.org/wiki/Q2830525',
    'tfx': 'https://www.wikidata.org/wiki/Q15704982',
    'nrj12': 'https://www.wikidata.org/wiki/Q2830534',
    'lci': 'https://www.wikidata.org/wiki/Q3214682',
    'france-4': 'https://www.wikidata.org/wiki/Q596018',
    'bfm-tv': 'https://www.wikidata.org/wiki/Q1350914',
    'cnews': 'https://www.wikidata.org/wiki/Q18006965',
    'cstar': 'https://www.wikidata.org/wiki/Q2830528',
    'gulli': 'https://www.wikidata.org/wiki/Q3118658',
    '6ter': 'https://www.wikidata.org/wiki/Q18385065',
    'rmc-decouverte': 'https://www.wikidata.org/wiki/Q3424521',
    'rmc-story': 'https://www.wikidata.org/wiki/Q3424519',
    'franceinfo': 'https://www.wikidata.org/wiki/Q18006967',
}

CHANNEL_HEAD_PROGRAM_LIMIT = int(os.getenv('CHANNEL_HEAD_PROGRAM_LIMIT', '12'))
PROGRAM_SHARE_SNAPSHOT_PAST_HOURS = int(os.getenv('PROGRAM_SHARE_SNAPSHOT_PAST_HOURS', '6'))
PROGRAM_SHARE_SNAPSHOT_FUTURE_DAYS = int(os.getenv('PROGRAM_SHARE_SNAPSHOT_FUTURE_DAYS', '4'))
PROGRAM_SHARE_SNAPSHOT_AIRING_LIMIT = int(os.getenv('PROGRAM_SHARE_SNAPSHOT_AIRING_LIMIT', '6'))
PROGRAM_SHARE_DETACHED_ENABLED = os.getenv('PROGRAM_SHARE_DETACHED_ENABLED', '1') in ('1', 'true', 'yes', 'on')
ENTITY_AIRINGS_REFRESH_ENABLED = os.getenv('ENTITY_AIRINGS_REFRESH_ENABLED', '1') in ('1', 'true', 'yes', 'on')
ENTITY_AIRINGS_SCRIPT_PATH = os.getenv('ENTITY_AIRINGS_SCRIPT_PATH', '').strip()
ENTITY_AIRINGS_ENV_FILE = os.getenv(
    'ENTITY_AIRINGS_ENV_FILE',
    os.getenv('ENV_FILE', os.path.abspath(os.path.join(os.path.dirname(__file__), '.env')))
).strip()
ENTITY_AIRINGS_DIR = os.getenv('ENTITY_AIRINGS_DIR', '').strip()
ENTITY_AIRINGS_HORIZON_DAYS = max(1, int(os.getenv('ENTITY_AIRINGS_HORIZON_DAYS', '7')))
ENTITY_AIRINGS_PAST_HOURS = max(0, int(os.getenv('ENTITY_AIRINGS_PAST_HOURS', '2')))
ENTITY_AIRINGS_MAX = max(1, int(os.getenv('ENTITY_AIRINGS_MAX', '18')))
DEFAULT_OG_IMAGE_URL = f"{SITEMAP_DOMAIN}/static/img/programmecesoir-social.jpg"
SITE_MARK_URL = f"{SITEMAP_DOMAIN}/apple-touch-icon.png"
PROGRAM_RELATED_SUGGESTION_LIMIT = 4
PROGRAM_RELATED_WINDOW_BEFORE_MINUTES = 90
PROGRAM_RELATED_WINDOW_AFTER_MINUTES = 120
REPLAY_RESOLVE_ENABLED = os.getenv('REPLAY_RESOLVE_ENABLED', '1') in ('1', 'true', 'yes', 'on')
REPLAY_RESOLVE_TIMEOUT = int(os.getenv('REPLAY_RESOLVE_TIMEOUT', '12'))
REPLAY_RESOLVE_DELAY_MS = max(0, int(os.getenv('REPLAY_RESOLVE_DELAY_MS', '250')))
REPLAY_RESOLVE_LIMIT_PER_RUN = max(0, int(os.getenv('REPLAY_RESOLVE_LIMIT_PER_RUN', '500')))
REPLAY_CACHE_TTL_DAYS = max(1, int(os.getenv('REPLAY_CACHE_TTL_DAYS', '30')))
REPLAY_NEGATIVE_CACHE_TTL_HOURS = max(1, int(os.getenv('REPLAY_NEGATIVE_CACHE_TTL_HOURS', '12')))
REPLAY_ENABLE_NON_FRANCETV = os.getenv('REPLAY_ENABLE_NON_FRANCETV', '0') in ('1', 'true', 'yes', 'on')
REPLAY_CACHE_PATH = os.getenv(
    'REPLAY_CACHE_PATH',
    os.path.abspath(os.path.join(os.path.dirname(__file__), 'replay_cache.json'))
)
PROGRAM_TITLE_STOPWORDS = {
    'de', 'du', 'des', 'la', 'le', 'les', 'un', 'une', 'et', 'sur', 'avec',
    'pour', 'dans', 'the', 'plus', 'direct', 'programme', 'tele', 'television',
    'tv', 'soir', 'ce', 'cet', 'cette', 'en', 'a', 'au', 'aux', 'par', 'ou',
}
TV_STREAMS: Dict[str, Dict[str, str]] = {
    'tf1': {'streamUrl': 'https://www.tf1.fr/tf1/direct', 'provider': 'TF1+'},
    'tmc': {'streamUrl': 'https://www.tf1.fr/tmc/direct', 'provider': 'TF1+'},
    'tfx': {'streamUrl': 'https://www.tf1.fr/tfx/direct', 'provider': 'TF1+'},
    'lci': {'streamUrl': 'https://www.tf1.fr/lci/direct', 'provider': 'TF1+'},
    'france-2': {'streamUrl': 'https://www.france.tv/france-2/direct.html', 'provider': 'france.tv'},
    'france-3': {'streamUrl': 'https://www.france.tv/france-3/direct.html', 'provider': 'france.tv'},
    'france-4': {'streamUrl': 'https://www.france.tv/france-4/direct.html', 'provider': 'france.tv'},
    'france-5': {'streamUrl': 'https://www.france.tv/france-5/direct.html', 'provider': 'france.tv'},
    'franceinfo': {'streamUrl': 'https://www.france.tv/franceinfo/direct.html', 'provider': 'france.tv'},
    'm6': {'streamUrl': 'https://www.m6.fr/m6/direct', 'provider': 'M6+'},
    'w9': {'streamUrl': 'https://www.m6.fr/w9/direct', 'provider': 'M6+'},
    '6ter': {'streamUrl': 'https://www.m6.fr/6ter/direct', 'provider': 'M6+'},
    'gulli': {'streamUrl': 'https://www.m6.fr/gulli/direct', 'provider': 'M6+'},
    'arte': {'streamUrl': 'https://www.arte.tv/fr/direct/', 'provider': 'ARTE'},
    'bfm-tv': {'streamUrl': 'https://www.bfmtv.com/en-direct/', 'provider': 'BFM TV'},
    'cnews': {'streamUrl': 'https://www.cnews.fr/le-direct', 'provider': 'CNEWS'},
    'rmc-story': {'streamUrl': 'https://www.rmcbfmplay.com/chaine/rmc-story', 'provider': 'RMC BFM Play'},
    'rmc-decouverte': {'streamUrl': 'https://www.rmcbfmplay.com/chaine/rmc-decouverte', 'provider': 'RMC BFM Play'},
}
TV_STREAM_ALIASES: Dict[str, str] = {
    'tf1': 'tf1',
    'tmc': 'tmc',
    'tfx': 'tfx',
    'lci': 'lci',
    'france2': 'france-2',
    'france-2': 'france-2',
    'france3': 'france-3',
    'france-3': 'france-3',
    'france4': 'france-4',
    'france-4': 'france-4',
    'france5': 'france-5',
    'france-5': 'france-5',
    'franceinfo': 'franceinfo',
    'france-info': 'franceinfo',
    'm6': 'm6',
    'w9': 'w9',
    '6ter': '6ter',
    'gulli': 'gulli',
    'arte': 'arte',
    'bfmtv': 'bfm-tv',
    'bfm-tv': 'bfm-tv',
    'cnews': 'cnews',
    'rmc-story': 'rmc-story',
    'rmcstory': 'rmc-story',
    'rmc-decouverte': 'rmc-decouverte',
    'rmcdecouverte': 'rmc-decouverte',
}
REPLAY_PLATFORM_BY_CHANNEL: Dict[str, str] = {
    'france-2': 'francetv',
    'france-3': 'francetv',
    'france-4': 'francetv',
    'france-5': 'francetv',
    'franceinfo': 'francetv',
    'france-info': 'francetv',
    'tf1': 'tf1plus',
    'tmc': 'tf1plus',
    'tfx': 'tf1plus',
    'tf1-series-films': 'tf1plus',
    'lci': 'tf1plus',
    'm6': 'm6plus',
    'w9': 'm6plus',
    '6ter': 'm6plus',
    'paris-premiere': 'm6plus',
    'gulli': 'm6plus',
    'arte': 'arte',
}
REPLAY_PROVIDER_LABELS: Dict[str, str] = {
    'francetv': 'France.tv',
    'tf1plus': 'TF1+',
    'm6plus': 'M6+',
    'arte': 'ARTE',
}
_replay_cache: Optional[Dict[str, Dict[str, Any]]] = None
_replay_cache_dirty = False
_replay_session: Optional[requests.Session] = None

def normalize_channel_key(value: Optional[str]) -> str:
    return re.sub(r'[^a-z0-9]+', '', (value or '').lower())


def get_replay_session() -> requests.Session:
    global _replay_session
    if _replay_session is None:
        session = requests.Session()
        session.headers.update({
            'User-Agent': 'ProgrammeCeSoir-ReplayResolver/1.0 (+https://programmecesoir.fr)',
            'Accept': 'application/json, text/plain, */*',
        })
        _replay_session = session
    return _replay_session


def normalize_replay_title(value: str) -> str:
    text = str(value or '').strip()
    if not text:
        return ''
    text = re.sub(r'\bS\d+\s*E\d+\b', ' ', text, flags=re.I)
    text = re.sub(r'\b(?:episode|ep|partie|numero|n°|no)\s*\d+\b', ' ', text, flags=re.I)
    text = re.sub(r'\b(?:saison|season)\s*\d+\b', ' ', text, flags=re.I)
    text = re.sub(r'\s+', ' ', text).strip(' -–—:;,.')
    return text


def normalize_replay_compare(value: str) -> str:
    return re.sub(r'\s+', ' ', slugify_for_url(normalize_replay_title(value)).replace('-', ' ')).strip()


def get_replay_platform(channel_id: Optional[str]) -> Optional[str]:
    normalized = slugify_for_url(str(channel_id or ''))
    return REPLAY_PLATFORM_BY_CHANNEL.get(normalized)


def get_replay_label(channel_id: Optional[str]) -> str:
    platform = get_replay_platform(channel_id)
    provider = REPLAY_PROVIDER_LABELS.get(platform or '', '')
    return f'Revoir sur {provider}' if provider else 'Revoir en replay'


def get_replay_cache_key(channel_id: str, title: str) -> str:
    normalized_channel = slugify_for_url(channel_id)
    normalized_title = normalize_replay_compare(title)
    return f'{normalized_channel}::{normalized_title}'


def load_replay_cache() -> Dict[str, Dict[str, Any]]:
    global _replay_cache
    if _replay_cache is not None:
        return _replay_cache

    try:
        with open(REPLAY_CACHE_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
            _replay_cache = data if isinstance(data, dict) else {}
    except FileNotFoundError:
        _replay_cache = {}
    except Exception as e:
        logger.warning(f"Failed to load replay cache {REPLAY_CACHE_PATH}: {str(e)}")
        _replay_cache = {}
    return _replay_cache


def get_cached_replay_entry(cache_key: str) -> Optional[Dict[str, Any]]:
    cache = load_replay_cache()
    entry = cache.get(cache_key)
    if not isinstance(entry, dict):
        return None

    resolved_at_raw = str(entry.get('resolvedAt') or '').strip()
    if not resolved_at_raw:
        return None

    try:
        resolved_at = datetime.fromisoformat(resolved_at_raw.replace('Z', '+00:00'))
        if resolved_at.tzinfo is None:
            resolved_at = resolved_at.replace(tzinfo=timezone.utc)
    except Exception:
        return None

    ttl = timedelta(days=REPLAY_CACHE_TTL_DAYS) if entry.get('url') else timedelta(hours=REPLAY_NEGATIVE_CACHE_TTL_HOURS)
    if datetime.now(timezone.utc) - resolved_at > ttl:
        return None

    return entry


def set_cached_replay_entry(cache_key: str, url: Optional[str], platform: Optional[str], title: str) -> None:
    global _replay_cache_dirty
    cache = load_replay_cache()
    cache[cache_key] = {
        'url': url,
        'platform': platform,
        'title': title,
        'resolvedAt': datetime.now(timezone.utc).isoformat(),
    }
    _replay_cache_dirty = True


def save_replay_cache() -> None:
    global _replay_cache_dirty
    if not _replay_cache_dirty or _replay_cache is None:
        return

    target_dir = os.path.dirname(REPLAY_CACHE_PATH) or '.'
    os.makedirs(target_dir, exist_ok=True)
    temp_path = f'{REPLAY_CACHE_PATH}.tmp'
    with open(temp_path, 'w', encoding='utf-8') as f:
        json.dump(_replay_cache, f, ensure_ascii=False, indent=2, sort_keys=True)
    os.replace(temp_path, REPLAY_CACHE_PATH)
    _replay_cache_dirty = False


def choose_replay_match(query_title: str, candidates: List[Dict[str, Any]]) -> Optional[str]:
    normalized_query = normalize_replay_compare(query_title)
    query_tokens = set(normalized_query.split())
    best_url = None
    best_score = -1

    for item in candidates:
        candidate_title = str(item.get('title') or item.get('label') or '').strip()
        candidate_url = str(item.get('url') or '').strip()
        if not candidate_title or not candidate_url:
            continue

        normalized_candidate = normalize_replay_compare(candidate_title)
        candidate_tokens = set(normalized_candidate.split())
        score = 0
        if normalized_candidate == normalized_query:
            score += 100
        elif normalized_candidate.startswith(normalized_query) or normalized_query.startswith(normalized_candidate):
            score += 80
        elif normalized_query and normalized_query in normalized_candidate:
            score += 70

        overlap = len(query_tokens & candidate_tokens)
        if overlap:
            score += overlap * 10
        if query_tokens:
            score += int((overlap / max(1, len(query_tokens))) * 20)

        if score > best_score:
            best_score = score
            best_url = candidate_url

    return best_url if best_score >= 30 else None


def build_france_tv_fallback_url(title: str, channel_id: str) -> Optional[str]:
    slug = slugify_for_url(title)
    normalized_channel = slugify_for_url(channel_id)
    if not slug or not normalized_channel:
        return None
    return f'https://www.france.tv/{normalized_channel}/{slug}/'


def resolve_france_tv_replay_url(title: str, channel_id: str) -> Optional[str]:
    session = get_replay_session()
    query = '''
    query ContentSearch($query: String!, $channels: [String!], $limit: Int) {
      contentSearch(query: $query, channels: $channels, limit: $limit) {
        items {
          url
          title
        }
      }
    }
    '''
    try:
        response = session.post(
            'https://api.france.tv/graphql',
            json={
                'query': query,
                'variables': {
                    'query': title,
                    'channels': [slugify_for_url(channel_id)],
                    'limit': 3,
                },
            },
            timeout=REPLAY_RESOLVE_TIMEOUT,
            headers={'Content-Type': 'application/json'},
        )
        response.raise_for_status()
        data = response.json()
        items = (((data or {}).get('data') or {}).get('contentSearch') or {}).get('items') or []
        match_url = choose_replay_match(title, items)
        if match_url:
            return match_url if match_url.startswith('http') else f'https://www.france.tv{match_url}'
    except Exception as e:
        logger.debug(f"France.tv replay lookup failed for {title} / {channel_id}: {str(e)}")

    return build_france_tv_fallback_url(title, channel_id)


def resolve_tf1plus_replay_url(title: str) -> Optional[str]:
    session = get_replay_session()
    try:
        response = session.get(
            f'https://api.tf1plus.fr/api/v1/search?q={quote(title)}&type=program&limit=3',
            timeout=REPLAY_RESOLVE_TIMEOUT,
        )
        response.raise_for_status()
        data = response.json()
        items = (data or {}).get('data') or []
        candidates = []
        for item in items:
            url = str(item.get('url') or '').strip()
            if not url:
                continue
            candidates.append({
                'title': item.get('title'),
                'url': url if url.startswith('http') else f'https://www.tf1plus.fr{url}',
            })
        return choose_replay_match(title, candidates)
    except Exception as e:
        logger.debug(f"TF1+ replay lookup failed for {title}: {str(e)}")
        return None


def resolve_m6plus_replay_url(title: str) -> Optional[str]:
    session = get_replay_session()
    try:
        response = session.get(
            f'https://search.6play.fr/6play/query?q={quote(title)}&limit=3&type=video',
            timeout=REPLAY_RESOLVE_TIMEOUT,
        )
        response.raise_for_status()
        data = response.json()
        hits = (((data or {}).get('hits') or {}).get('hits')) or []
        candidates = []
        for hit in hits:
            source = hit.get('_source') or {}
            hit_id = str(source.get('id') or '').strip()
            hit_title = str(source.get('title') or '').strip()
            if not hit_id or not hit_title:
                continue
            candidates.append({
                'title': hit_title,
                'url': f'https://www.6play.fr/{slugify_for_url(hit_title)}/p-{hit_id}',
            })
        return choose_replay_match(title, candidates)
    except Exception as e:
        logger.debug(f"M6+ replay lookup failed for {title}: {str(e)}")
        return None


def resolve_arte_replay_url(title: str) -> Optional[str]:
    session = get_replay_session()
    try:
        response = session.get(
            f'https://api.arte.tv/api/search/v3/search?q={quote(title)}&language=fr&platform=ARTEPLUS7&limit=3',
            timeout=REPLAY_RESOLVE_TIMEOUT,
        )
        response.raise_for_status()
        data = response.json()
        hits = (((data or {}).get('videoResults') or {}).get('hits')) or []
        candidates = []
        for hit in hits:
            hit_id = str(hit.get('id') or '').strip()
            hit_title = str(hit.get('title') or '').strip()
            if not hit_id or not hit_title:
                continue
            candidates.append({
                'title': hit_title,
                'url': f'https://www.arte.tv/fr/videos/{hit_id}/{slugify_for_url(hit_title)}/',
            })
        return choose_replay_match(title, candidates)
    except Exception as e:
        logger.debug(f"ARTE replay lookup failed for {title}: {str(e)}")
        return None


def resolve_replay_url(title: str, channel_id: str) -> Optional[str]:
    platform = get_replay_platform(channel_id)
    if not platform:
        return None

    clean_title = normalize_replay_title(title)
    if not clean_title:
        return None

    if platform == 'francetv':
        return build_france_tv_fallback_url(clean_title, channel_id)
    if not REPLAY_ENABLE_NON_FRANCETV:
        return None
    if platform == 'tf1plus':
        return resolve_tf1plus_replay_url(clean_title)
    if platform == 'm6plus':
        return resolve_m6plus_replay_url(clean_title)
    if platform == 'arte':
        return resolve_arte_replay_url(clean_title)
    return None


def enrich_programs_with_replay_urls(programs_data: List[Dict[str, Any]]) -> None:
    if not REPLAY_RESOLVE_ENABLED or not programs_data:
        return

    targets: Dict[str, Dict[str, Any]] = {}
    for program in programs_data:
        channel_id = str(program.get('channel_id') or '').strip()
        title = str(program.get('title') or '').strip()
        platform = get_replay_platform(channel_id)
        normalized_title = normalize_replay_title(title)
        if not platform or not normalized_title:
            continue
        cache_key = get_replay_cache_key(channel_id, normalized_title)
        item = targets.setdefault(cache_key, {
            'cache_key': cache_key,
            'channel_id': channel_id,
            'title': normalized_title,
            'platform': platform,
            'count': 0,
        })
        item['count'] += 1

    if not targets:
        return

    cached_urls: Dict[str, Optional[str]] = {}
    unresolved: List[Dict[str, Any]] = []
    for cache_key, item in targets.items():
        cached = get_cached_replay_entry(cache_key)
        if cached is not None:
            cached_urls[cache_key] = cached.get('url')
            continue
        unresolved.append(item)

    unresolved.sort(key=lambda item: (-int(item.get('count') or 0), str(item.get('channel_id') or ''), str(item.get('title') or '')))
    if REPLAY_RESOLVE_LIMIT_PER_RUN and len(unresolved) > REPLAY_RESOLVE_LIMIT_PER_RUN:
        unresolved = unresolved[:REPLAY_RESOLVE_LIMIT_PER_RUN]

    resolved_count = 0
    for index, item in enumerate(unresolved):
        replay_url = resolve_replay_url(str(item['title']), str(item['channel_id']))
        cached_urls[item['cache_key']] = replay_url
        set_cached_replay_entry(item['cache_key'], replay_url, item.get('platform'), str(item['title']))
        if replay_url:
            resolved_count += 1
        if REPLAY_RESOLVE_DELAY_MS > 0 and index < len(unresolved) - 1:
            time.sleep(REPLAY_RESOLVE_DELAY_MS / 1000)

    save_replay_cache()

    applied = 0
    for program in programs_data:
        channel_id = str(program.get('channel_id') or '').strip()
        title = normalize_replay_title(str(program.get('title') or '').strip())
        if not channel_id or not title:
            continue
        replay_url = cached_urls.get(get_replay_cache_key(channel_id, title))
        if replay_url:
            program['replay_url'] = replay_url
            applied += 1

    logger.info(
        "Replay enrichment completed: %s targets, %s unresolved lookups, %s replay URLs applied",
        len(targets),
        len(unresolved),
        applied,
    )

def resolve_channel_number(display_names: List[str], channel_slug: str, channel_name: str) -> Optional[int]:
    # Prefer explicit numeric labels when available in XMLTV metadata.
    for txt in display_names:
        num_match = re.match(r'^(?:HD\s*)?(\d{1,3})$', txt, re.I)
        if not num_match:
            continue
        number = int(num_match.group(1))
        if 1 <= number <= 999:
            return number

    fallback_by_key = {
        normalize_channel_key(key): number
        for key, number in FR_TNT_CHANNEL_NUMBERS.items()
    }
    for candidate in (channel_slug, channel_name):
        mapped = fallback_by_key.get(normalize_channel_key(candidate))
        if mapped:
            return mapped
    return None


def get_effective_channel_number(raw_number: Any, channel_slug: str, channel_name: str) -> Optional[int]:
    if isinstance(raw_number, int) and raw_number > 0:
        return raw_number
    if isinstance(raw_number, str):
        stripped = raw_number.strip()
        if stripped.isdigit():
            parsed = int(stripped)
            if parsed > 0:
                return parsed
    return resolve_channel_number([], channel_slug, channel_name)

# ============================================
# LOGGING SETUP
# ============================================

def setup_logging():
    """Configure logging to file and console"""
    log_file = os.path.abspath(os.getenv('LOG_FILE', '/tmp/epg_importer_fr.log'))
    log_parent = os.path.dirname(log_file) or '.'
    try:
        os.makedirs(log_parent, exist_ok=True)
    except Exception:
        log_file = '/tmp/epg_importer_fr.log'
        log_parent = os.path.dirname(log_file) or '.'
        os.makedirs(log_parent, exist_ok=True)

    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(log_file),
            logging.StreamHandler(sys.stdout)
        ]
    )
    return logging.getLogger(__name__)

logger = setup_logging()

# ============================================
# SUPABASE RETRIES
# ============================================

def is_retryable_error(err: Exception) -> bool:
    msg = str(err)
    return 'PGRST002' in msg or 'schema cache' in msg or '503' in msg


def execute_with_retry(request, label: str = ''):
    retries = max(1, SUPABASE_MAX_RETRIES)
    for attempt in range(1, retries + 1):
        try:
            return request.execute()
        except APIError as e:
            if not is_retryable_error(e) or attempt == retries:
                raise
            delay = min(60, SUPABASE_RETRY_DELAY * (2 ** (attempt - 1)))
            logger.warning(f"{label} failed with retryable error (attempt {attempt}/{retries}). Waiting {delay:.1f}s...")
            time.sleep(delay)


def get_supabase_admin_key() -> Optional[str]:
    return (
        os.getenv('SUPABASE_SERVICE_KEY')
        or os.getenv('SUPABASE_READ_KEY')
    )


def try_create_postgres_client(database_url: str):
    if not database_url:
        return None
    client = None
    try:
        client = create_postgres_client(database_url)
        with client.cursor() as cur:
            cur.execute("SELECT 1")
            cur.fetchone()
        logger.info("Using direct Postgres connection from DATABASE_URL")
        return client
    except Exception as e:
        logger.warning(f"DATABASE_URL unavailable, falling back to Supabase REST: {str(e)}")
        try:
            client.close()
        except Exception:
            pass
        return None


def wait_for_supabase(supabase: Client) -> None:
    logger.info("Waiting for Supabase API to be ready...")
    for attempt in range(1, 11):
        try:
            execute_with_retry(
                supabase.table(CHANNELS_TABLE).select('channel_id').limit(1),
                label='Supabase readiness check'
            )
            logger.info("Supabase API ready.")
            return
        except APIError as e:
            if not is_retryable_error(e):
                raise
            delay = min(60, 5 * attempt)
            logger.warning(f"Supabase not ready yet (attempt {attempt}/10). Waiting {delay:.1f}s...")
            time.sleep(delay)
    raise RuntimeError("Supabase API not ready after multiple attempts")

# ============================================
# IMPORT STATUS
# ============================================

def update_import_status(supabase: Client, payload: Dict) -> None:
    try:
        # Use upsert with explicit on_conflict handling
        result = execute_with_retry(
            supabase.table(IMPORT_STATUS_TABLE).upsert(
                payload,
                on_conflict='id'
            ),
            label='update import_status'
        )
        logger.debug(f"Import status updated: {payload.get('id')}")
    except Exception as e:
        # If upsert fails, try update instead
        try:
            status_id = payload.get('id')
            if status_id:
                update_payload = {k: v for k, v in payload.items() if k != 'id'}
                execute_with_retry(
                    supabase.table(IMPORT_STATUS_TABLE).update(update_payload).eq('id', status_id),
                    label='update import_status (fallback)'
                )
                logger.debug(f"Import status updated via fallback: {status_id}")
        except Exception as e2:
            logger.warning(f"Failed to update import status: {str(e)} (fallback also failed: {str(e2)})")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_sql_identifier(value: str) -> str:
    if not re.match(r'^[A-Za-z_][A-Za-z0-9_]*$', value or ''):
        raise ValueError(f"Unsafe SQL identifier: {value}")
    return value


def ensure_import_status_schema() -> None:
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        return

    table_name = safe_sql_identifier(IMPORT_STATUS_TABLE)
    pg = None
    try:
        pg = try_create_postgres_client(database_url)
        if pg is None:
            return
        with pg.cursor() as cur:
            cur.execute(f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS run_id text")
            cur.execute(f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS current_step text")
            cur.execute(f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS last_successful_step text")
            cur.execute(f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS step_status jsonb NOT NULL DEFAULT '{{}}'::jsonb")
            cur.execute(f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS warnings jsonb NOT NULL DEFAULT '[]'::jsonb")
            cur.execute(f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS last_report_path text")
            cur.execute(f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS background_jobs jsonb NOT NULL DEFAULT '{{}}'::jsonb")
    except Exception as e:
        logger.warning(f"Failed to ensure import_status schema: {str(e)}")
    finally:
        if pg is not None:
            try:
                pg.close()
            except Exception:
                pass


def ensure_programs_schema() -> None:
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        return

    table_name = safe_sql_identifier(PROGRAMS_TABLE)
    pg = None
    try:
        pg = try_create_postgres_client(database_url)
        if pg is None:
            return
        with pg.cursor() as cur:
            cur.execute(f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS replay_url text")
    except Exception as e:
        logger.warning(f"Failed to ensure {PROGRAMS_TABLE} schema: {str(e)}")
    finally:
        if pg is not None:
            try:
                pg.close()
            except Exception:
                pass


def init_import_run_state() -> Dict[str, Any]:
    started_at = utc_now_iso()
    return {
        'runId': f"{datetime.now(TIMEZONE).strftime('%Y%m%dT%H%M%S')}-{uuid.uuid4().hex[:8]}",
        'status': 'running',
        'startedAt': started_at,
        'finishedAt': None,
        'currentStep': None,
        'lastSuccessfulStep': None,
        'errorMessage': None,
        'sourceUrl': EPG_XMLTV_URL,
        'channelsProcessed': None,
        'programsInserted': None,
        'programsDeleted': None,
        'warnings': [],
        'backgroundJobs': {},
        'steps': {
            key: {
                'key': key,
                'label': label,
                'status': 'pending',
                'startedAt': None,
                'finishedAt': None,
                'detail': None,
                'error': None,
            }
            for key, label in IMPORT_PIPELINE_STEPS
        },
    }


def mark_import_step_started(run_state: Dict[str, Any], step_key: str, detail: Optional[str] = None) -> None:
    step = run_state['steps'][step_key]
    step['status'] = 'running'
    step['startedAt'] = utc_now_iso()
    step['finishedAt'] = None
    step['error'] = None
    if detail is not None:
        step['detail'] = detail
    run_state['currentStep'] = step_key


def mark_import_step_completed(run_state: Dict[str, Any], step_key: str, detail: Optional[str] = None) -> None:
    step = run_state['steps'][step_key]
    if step.get('startedAt') is None:
        step['startedAt'] = utc_now_iso()
    step['status'] = 'completed'
    step['finishedAt'] = utc_now_iso()
    step['error'] = None
    if detail is not None:
        step['detail'] = detail
    run_state['currentStep'] = None
    run_state['lastSuccessfulStep'] = step_key


def mark_import_step_warning(run_state: Dict[str, Any], step_key: str, message: str, detail: Optional[str] = None) -> None:
    step = run_state['steps'][step_key]
    if step.get('startedAt') is None:
        step['startedAt'] = utc_now_iso()
    step['status'] = 'warning'
    step['finishedAt'] = utc_now_iso()
    step['error'] = message
    if detail is not None:
        step['detail'] = detail
    elif not step.get('detail'):
        step['detail'] = message
    run_state['currentStep'] = None
    run_state['warnings'].append({
        'step': step_key,
        'message': message,
        'at': utc_now_iso(),
    })


def mark_import_step_failed(run_state: Dict[str, Any], step_key: str, message: str, detail: Optional[str] = None) -> None:
    step = run_state['steps'][step_key]
    if step.get('startedAt') is None:
        step['startedAt'] = utc_now_iso()
    step['status'] = 'failed'
    step['finishedAt'] = utc_now_iso()
    step['error'] = message
    if detail is not None:
        step['detail'] = detail
    elif not step.get('detail'):
        step['detail'] = message
    run_state['currentStep'] = step_key


def set_background_job_state(
    run_state: Dict[str, Any],
    job_key: str,
    status: str,
    detail: Optional[str] = None,
    error: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> None:
    jobs = run_state.setdefault('backgroundJobs', {})
    job = dict(jobs.get(job_key) or {})
    now = utc_now_iso()
    if not job.get('startedAt'):
        job['startedAt'] = now
    job['status'] = status
    if detail is not None:
        job['detail'] = detail
    if error is not None:
        job['error'] = error
    if status in ('completed', 'warning', 'failed'):
        job['finishedAt'] = now
    if extra:
        job.update(extra)
    jobs[job_key] = job


def build_import_pipeline_report(run_state: Dict[str, Any]) -> Dict[str, Any]:
    step_rows = []
    summary = {
        'total': len(IMPORT_PIPELINE_STEPS),
        'completed': 0,
        'warnings': 0,
        'failed': 0,
        'running': 0,
        'pending': 0,
    }

    for key, label in IMPORT_PIPELINE_STEPS:
        step = dict(run_state['steps'].get(key) or {})
        step.setdefault('key', key)
        step.setdefault('label', label)
        step.setdefault('status', 'pending')
        step_rows.append(step)
        status = step.get('status') or 'pending'
        if status == 'completed':
            summary['completed'] += 1
        elif status == 'warning':
            summary['warnings'] += 1
        elif status == 'failed':
            summary['failed'] += 1
        elif status == 'running':
            summary['running'] += 1
        else:
            summary['pending'] += 1

    return {
        'ok': True,
        'generatedAt': utc_now_iso(),
        'runId': run_state.get('runId'),
        'status': run_state.get('status'),
        'currentStep': run_state.get('currentStep'),
        'lastSuccessfulStep': run_state.get('lastSuccessfulStep'),
        'startedAt': run_state.get('startedAt'),
        'finishedAt': run_state.get('finishedAt'),
        'sourceUrl': run_state.get('sourceUrl'),
        'errorMessage': run_state.get('errorMessage'),
        'warnings': run_state.get('warnings') or [],
        'summary': summary,
        'metrics': {
            'channelsProcessed': run_state.get('channelsProcessed'),
            'programsInserted': run_state.get('programsInserted'),
            'programsDeleted': run_state.get('programsDeleted'),
        },
        'backgroundJobs': run_state.get('backgroundJobs') or {},
        'steps': step_rows,
    }


def write_import_pipeline_report(run_state: Dict[str, Any]) -> str:
    public_dir = get_public_dir()
    latest_path = os.path.join(public_dir, IMPORT_PIPELINE_REPORT_RELATIVE_PATH)
    os.makedirs(os.path.dirname(latest_path), exist_ok=True)
    payload = build_import_pipeline_report(run_state)
    with open(latest_path, 'w', encoding='utf-8') as handle:
        handle.write(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
    return latest_path


def persist_import_run_state(supabase: Client, run_state: Dict[str, Any], include_last_run_at: bool = False) -> None:
    report_path = write_import_pipeline_report(run_state)
    payload: Dict[str, Any] = {
        'id': IMPORT_STATUS_ID,
        'run_id': run_state.get('runId'),
        'status': run_state.get('status'),
        'started_at': run_state.get('startedAt'),
        'finished_at': run_state.get('finishedAt'),
        'current_step': run_state.get('currentStep'),
        'last_successful_step': run_state.get('lastSuccessfulStep'),
        'step_status': run_state.get('steps'),
        'warnings': run_state.get('warnings'),
        'background_jobs': run_state.get('backgroundJobs') or {},
        'channels_processed': run_state.get('channelsProcessed'),
        'programs_inserted': run_state.get('programsInserted'),
        'programs_deleted': run_state.get('programsDeleted'),
        'error_message': run_state.get('errorMessage'),
        'updated_at': utc_now_iso(),
        'source_url': run_state.get('sourceUrl'),
        'last_report_path': report_path,
    }
    if include_last_run_at and run_state.get('finishedAt'):
        payload['last_run_at'] = run_state.get('finishedAt')
    update_import_status(supabase, payload)


def get_program_share_job_log_file() -> str:
    configured = os.getenv('PROGRAM_SHARE_JOB_LOG_FILE', '').strip()
    if configured:
        return configured
    log_file = os.path.abspath(os.getenv('LOG_FILE', '/tmp/epg_importer_fr.log'))
    return os.path.join(os.path.dirname(log_file), 'program_share_snapshots_job.log')


def get_import_pipeline_report_path() -> str:
    return os.path.join(get_public_dir(), IMPORT_PIPELINE_REPORT_RELATIVE_PATH)


def update_detached_program_share_state(
    expected_run_id: str,
    status: str,
    detail: Optional[str] = None,
    error: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> None:
    now = utc_now_iso()
    report_path = get_import_pipeline_report_path()

    if os.path.exists(report_path):
        try:
            with open(report_path, 'r', encoding='utf-8') as handle:
                payload = json.load(handle)
            if payload.get('runId') == expected_run_id:
                jobs = payload.setdefault('backgroundJobs', {})
                job = dict(jobs.get('program_share_snapshots') or {})
                if not job.get('startedAt'):
                    job['startedAt'] = now
                job['status'] = status
                if detail is not None:
                    job['detail'] = detail
                if error is not None:
                    job['error'] = error
                if status in ('completed', 'warning', 'failed'):
                    job['finishedAt'] = now
                if extra:
                    job.update(extra)
                jobs['program_share_snapshots'] = job

                for step in payload.get('steps') or []:
                    if step.get('key') != 'program_share_snapshots':
                        continue
                    if detail is not None:
                        step['detail'] = detail
                    if error is not None:
                        step['error'] = error
                    if status in ('completed', 'warning', 'failed'):
                        step['finishedAt'] = now
                        if status == 'failed':
                            step['status'] = 'warning'
                    break
                payload['generatedAt'] = now
                with open(report_path, 'w', encoding='utf-8') as handle:
                    handle.write(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
        except Exception as e:
            logger.warning(f"Failed to update detached program share report: {str(e)}")

    try:
        supabase = get_supabase_client()
        result = execute_with_retry(
            supabase.table(IMPORT_STATUS_TABLE)
            .select('run_id, step_status, background_jobs')
            .eq('id', IMPORT_STATUS_ID)
            .limit(1),
            label='fetch import_status for detached program snapshots',
        )
        rows = getattr(result, 'data', None) or []
        if not rows:
            return
        current = rows[0]
        if str(current.get('run_id') or '') != expected_run_id:
            logger.warning(
                f"Detached program snapshot status skipped: current run_id {current.get('run_id')} "
                f"!= expected {expected_run_id}"
            )
            return

        background_jobs = current.get('background_jobs') or {}
        job = dict(background_jobs.get('program_share_snapshots') or {})
        if not job.get('startedAt'):
            job['startedAt'] = now
        job['status'] = status
        if detail is not None:
            job['detail'] = detail
        if error is not None:
            job['error'] = error
        if status in ('completed', 'warning', 'failed'):
            job['finishedAt'] = now
        if extra:
            job.update(extra)
        background_jobs['program_share_snapshots'] = job

        step_status = current.get('step_status') or {}
        step = dict(step_status.get('program_share_snapshots') or {
            'key': 'program_share_snapshots',
            'label': 'Snapshots pages programme',
        })
        if detail is not None:
            step['detail'] = detail
        if error is not None:
            step['error'] = error
        if status in ('completed', 'warning', 'failed'):
            step['finishedAt'] = now
            if status == 'failed':
                step['status'] = 'warning'
        step_status['program_share_snapshots'] = step

        update_import_status(supabase, {
            'id': IMPORT_STATUS_ID,
            'updated_at': now,
            'background_jobs': background_jobs,
            'step_status': step_status,
        })
    except Exception as e:
        logger.warning(f"Failed to persist detached program snapshot state: {str(e)}")


def launch_detached_program_share_snapshots(
    run_state: Dict[str, Any],
) -> Dict[str, Any]:
    log_path = get_program_share_job_log_file()
    os.makedirs(os.path.dirname(log_path), exist_ok=True)

    command = [
        sys.executable,
        os.path.abspath(__file__),
        '--run-program-share-snapshots',
        '--parent-run-id',
        run_state['runId'],
    ]

    with open(log_path, 'a', encoding='utf-8') as log_handle:
        process = subprocess.Popen(
            command,
            stdout=log_handle,
            stderr=log_handle,
            stdin=subprocess.DEVNULL,
            start_new_session=True,
            close_fds=True,
        )

    return {
        'logPath': log_path,
        'pid': process.pid,
    }

# ============================================
# TIME SLOT LOGIC
# ============================================

def get_time_slot(start_time: datetime) -> str:
    """
    Calculate time_slot based on program start time (Paris time)
    - aujourdhui: 06:00-17:59
    - ce-soir: 18:00-23:59
    - nuit: 00:00-05:59
    """
    paris_time = start_time.astimezone(TIMEZONE)
    hour = paris_time.hour

    if 6 <= hour < 18:
        return 'aujourdhui'
    if 18 <= hour < 24:
        return 'ce-soir'
    return 'nuit'

# ============================================
# XMLTV PARSING
# ============================================

def parse_xmltv_datetime(value: str) -> datetime:
    """Parse XMLTV datetime format: YYYYMMDDHHMMSS +ZZZZ"""
    value = (value or '').strip()
    if not value:
        raise ValueError('Empty XMLTV datetime')

    if ' ' in value:
        dt_part, tz_part = value.split(' ', 1)
    else:
        dt_part, tz_part = value, ''

    dt = datetime.strptime(dt_part, '%Y%m%d%H%M%S')
    if tz_part:
        sign = 1 if tz_part.startswith('+') else -1
        hours = int(tz_part[1:3])
        minutes = int(tz_part[3:5])
        offset_minutes = sign * (hours * 60 + minutes)
        tzinfo = pytz.FixedOffset(offset_minutes)
        return dt.replace(tzinfo=tzinfo)

    return TIMEZONE.localize(dt)


def slugify(value: str) -> str:
    """Match frontend slugification logic: normalize NFD, strip diacritics."""
    value = (value or '').lower().strip()
    value = unicodedata.normalize('NFD', value)
    value = ''.join(ch for ch in value if unicodedata.category(ch) != 'Mn')
    value = re.sub(r'[^a-z0-9\s-]', '', value)
    value = re.sub(r'\s+', '-', value)
    value = re.sub(r'-+', '-', value)
    return value.strip('-')


def slugify_for_url(value: str) -> str:
    """
    Match frontend program/channel slug logic:
    - lowercase
    - strip accents (NFD + remove diacritics)
    - remove non alnum/space/hyphen
    - collapse spaces/hyphens
    """
    value = (value or '').lower().strip()
    value = unicodedata.normalize('NFD', value)
    value = ''.join(ch for ch in value if unicodedata.category(ch) != 'Mn')
    value = re.sub(r'[^a-z0-9\s-]', '', value)
    value = re.sub(r'\s+', '-', value)
    value = re.sub(r'-+', '-', value)
    return value.strip('-')


GOOGLE_CANONICAL_SLUG_OVERRIDES = {
    'canal': 'canal-plus',
    'bfmtv': 'bfm-tv',
    'france-info': 'franceinfo',
}


def canonicalize_head_channel_slug(value: str) -> str:
    slug = slugify_for_url(value)
    return GOOGLE_CANONICAL_SLUG_OVERRIDES.get(slug, slug)


def _parse_google_head_channel_list(raw_value: str) -> List[str]:
    parsed: List[str] = []
    seen: set[str] = set()
    for item in raw_value.split(','):
        slug = canonicalize_head_channel_slug(item)
        if not slug or slug in seen:
            continue
        seen.add(slug)
        parsed.append(slug)
    return parsed


def get_google_url_inspection_targets() -> List[str]:
    return _parse_google_head_channel_list(GOOGLE_URL_INSPECTION_TARGET_CHANNELS_RAW)


def get_google_url_inspection_root_paths() -> List[str]:
    return [
        item.strip()
        for item in GOOGLE_URL_INSPECTION_ROOT_PATHS_RAW.split(',')
        if item.strip()
    ]


HEAD_ROOT_LABELS: Dict[str, Tuple[str, str]] = {
    '/': ('home', 'Accueil'),
    '/en-direct': ('en-direct', 'Programme TV en direct'),
    '/demain': ('demain', 'Programme TV demain'),
    '/film-ce-soir': ('film-ce-soir', 'Films ce soir'),
    '/series-ce-soir': ('series-ce-soir', 'Séries ce soir'),
    '/sport-ce-soir': ('sport-ce-soir', 'Sport ce soir'),
    '/documentaires-ce-soir': ('documentaires-ce-soir', 'Documentaires ce soir'),
    '/infos-ce-soir': ('infos-ce-soir', 'Infos ce soir'),
}

HOME_PAGE_CONFIGS: Dict[str, Dict[str, str]] = {
    '/': {
        'title': 'Programme TV TNT ce soir : toutes les chaînes - Programme Ce Soir',
        'description': 'Découvrez le programme TV TNT de ce soir : toutes les chaînes en un coup d’œil, horaires détaillés, films, séries et émissions.',
        'heading': 'Programme TV TNT ce soir',
    },
    '/en-direct': {
        'title': 'Programme TNT en direct : ce qui passe à la TV - Programme Ce Soir',
        'description': 'Regardez en un coup d’œil ce qui passe en ce moment à la TV sur toutes les chaînes TNT : films, séries, magazines et émissions en direct.',
        'heading': 'Programme TNT en direct',
    },
    '/demain': {
        'title': 'Programme TNT de demain : toutes les chaînes TV - Programme Ce Soir',
        'description': 'Consultez le programme TV TNT de demain : horaires détaillés de toutes les chaînes, films, séries, documentaires et divertissements.',
        'heading': 'Programme TNT de demain',
    },
}

CATEGORY_PAGE_CONFIGS: Dict[str, Dict[str, str]] = {
    '/film-ce-soir': {
        'label': 'Films',
        'title': 'Films à la TV ce soir - Programme Ce Soir',
        'description': 'Tous les films diffusés ce soir à la TV sur la TNT. Horaires, chaînes et synopsis.',
    },
    '/series-ce-soir': {
        'label': 'Séries',
        'title': 'Séries à la TV ce soir - Programme Ce Soir',
        'description': 'Séries diffusées ce soir à la TV sur la TNT. Vos séries préférées en prime time.',
    },
    '/sport-ce-soir': {
        'label': 'Sport',
        'title': 'Sport à la TV ce soir - Programme Ce Soir',
        'description': 'Sport diffusé ce soir à la TV. Tous les événements en direct.',
    },
    '/documentaires-ce-soir': {
        'label': 'Documentaires',
        'title': 'Documentaires à la TV ce soir - Programme Ce Soir',
        'description': 'Documentaires diffusés ce soir à la TV sur la TNT. Découvrez les meilleurs sujets.',
    },
    '/divertissement-ce-soir': {
        'label': 'Divertissements',
        'title': 'Divertissements à la TV ce soir - Programme Ce Soir',
        'description': 'Divertissements diffusés ce soir à la TV. Jeux, variétés et magazines.',
    },
    '/infos-ce-soir': {
        'label': 'Info',
        'title': 'Info et journaux TV ce soir - Programme Ce Soir',
        'description': 'Tous les journaux et émissions d’info diffusés ce soir à la TV.',
    },
    '/jeunesse-ce-soir': {
        'label': 'Jeunesse',
        'title': 'Programmes jeunesse ce soir - Programme Ce Soir',
        'description': 'Programmes jeunesse diffusés ce soir. Dessins animés et émissions famille.',
    },
    '/culture-ce-soir': {
        'label': 'Culture',
        'title': 'Culture et arts à la TV ce soir - Programme Ce Soir',
        'description': 'Culture et arts diffusés ce soir à la TV. Musique, théâtre, documentaires.',
    },
}

CATEGORY_ROUTE_GENRES: Dict[str, List[str]] = {
    '/film-ce-soir': ['Film', 'Cinéma', 'Téléfilm', 'Movie'],
    '/series-ce-soir': ['Série', 'Séries', 'Serie', 'Fiction', 'Sitcom', 'Soap'],
    '/sport-ce-soir': ['Sport'],
    '/documentaires-ce-soir': ['Documentaire', 'Documentary', 'Découverte'],
    '/divertissement-ce-soir': ['Divertissement', 'Jeu', 'Téléréalité', 'Show', 'Magazine', 'Variétés'],
    '/infos-ce-soir': ['Information', 'Info', 'Journal', 'Actualité', 'Débat'],
    '/jeunesse-ce-soir': ['Jeunesse', 'Enfants', 'Animation', 'Famille'],
    '/culture-ce-soir': ['Culture', 'Musique', 'Théâtre', 'Art', 'Histoire'],
}

HOME_BOOTSTRAP_CHANNEL_LIMIT = int(os.getenv('HOME_BOOTSTRAP_CHANNEL_LIMIT', '60'))
HOME_BOOTSTRAP_PROGRAMS_PER_CHANNEL = int(os.getenv('HOME_BOOTSTRAP_PROGRAMS_PER_CHANNEL', '3'))
HEAD_LISTING_GRAPH_LIMIT = int(os.getenv('HEAD_LISTING_GRAPH_LIMIT', '30'))


def build_google_head_target_rows(channels_data: List[Dict]) -> List[Tuple[str, str, str]]:
    active_target_info = get_active_google_head_channel_targets(channels_data)
    targets = set(active_target_info.get('activeTargets') or [])
    urls: List[Tuple[str, str, str]] = []
    seen: set[str] = set()

    for root_path in GOOGLE_URL_INSPECTION_ROOT_PATHS:
        root_slug, root_name = HEAD_ROOT_LABELS.get(
            root_path,
            (slugify_for_url(root_path.strip('/')) or 'root', root_path),
        )
        url = f"{SITEMAP_DOMAIN}{root_path}"
        if url in seen:
            continue
        seen.add(url)
        urls.append((root_slug, root_name, url))

    for channel in channels_data:
        channel_id = canonicalize_head_channel_slug(str(channel.get('channel_id') or ''))
        if not channel_id or channel_id not in targets:
            continue
        channel_url = f"{SITEMAP_DOMAIN}/{channel_id}"
        if channel_url in seen:
            continue
        seen.add(channel_url)
        urls.append((channel_id, str(channel.get('name') or channel_id), channel_url))

    return urls


def parse_iso_datetime(value: Any) -> Optional[datetime]:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace('Z', '+00:00'))
    except Exception:
        return None


def is_google_inspection_known(item: Dict[str, Any]) -> bool:
    if str(item.get('status') or '').lower() != 'ok':
        return False
    if item.get('lastCrawlTime'):
        return True
    verdict = str(item.get('verdict') or '').strip().upper()
    if verdict == 'PASS':
        return True
    coverage = str(item.get('coverageState') or '').lower()
    if 'ne reconna' in coverage or 'not indexed' in coverage:
        return False
    return False


def load_recent_url_inspection_history(days: int = GOOGLE_URL_INSPECTION_HISTORY_DAYS) -> List[Dict[str, Any]]:
    public_dir = get_public_dir()
    history_dir = os.path.join(public_dir, 'search-console', 'history')
    if not os.path.isdir(history_dir):
        return []

    cutoff_date = (datetime.now(TIMEZONE) - timedelta(days=max(0, days - 1))).date()
    latest_by_day: Dict[str, Tuple[datetime, Dict[str, Any]]] = {}

    for filename in os.listdir(history_dir):
        if not filename.startswith('url-inspection-') or not filename.endswith('.json'):
            continue
        path = os.path.join(history_dir, filename)
        try:
            with open(path, 'r', encoding='utf-8') as fh:
                payload = json.load(fh)
        except Exception:
            continue

        generated_at = parse_iso_datetime(payload.get('generatedAt'))
        if not generated_at:
            continue
        generated_local = generated_at.astimezone(TIMEZONE) if generated_at.tzinfo else TIMEZONE.localize(generated_at)
        day_key = generated_local.date().isoformat()
        if generated_local.date() < cutoff_date:
            continue
        current = latest_by_day.get(day_key)
        if current is None or generated_local > current[0]:
            latest_by_day[day_key] = (generated_local, payload)

    return [
        payload
        for _, payload in sorted(latest_by_day.values(), key=lambda item: item[0])
    ]


def build_recent_url_inspection_summary(days: int = GOOGLE_URL_INSPECTION_HISTORY_DAYS) -> Dict[str, Dict[str, Any]]:
    summaries: Dict[str, Dict[str, Any]] = {}
    reports = load_recent_url_inspection_history(days)

    for payload in reports:
        generated_at = parse_iso_datetime(payload.get('generatedAt'))
        if not generated_at:
            continue
        generated_local = generated_at.astimezone(TIMEZONE) if generated_at.tzinfo else TIMEZONE.localize(generated_at)
        day_key = generated_local.date().isoformat()

        for item in payload.get('results') or []:
            url = str(item.get('url') or '').strip()
            if not url:
                continue
            summary = summaries.setdefault(url, {
                'observedDays': 0,
                'indexedDays': 0,
                'latestSeenAt': None,
                'latestIndexedAt': None,
                'currentIndexed': False,
                'stableIndexed': False,
                'recentStatuses': [],
            })
            indexed = is_google_inspection_known(item)
            summary['observedDays'] += 1
            if indexed:
                summary['indexedDays'] += 1
                summary['latestIndexedAt'] = generated_local.isoformat()
            summary['latestSeenAt'] = generated_local.isoformat()
            summary['currentIndexed'] = indexed
            summary['recentStatuses'].append({
                'date': day_key,
                'indexed': indexed,
                'status': str(item.get('status') or ''),
                'verdict': str(item.get('verdict') or ''),
                'lastCrawlTime': item.get('lastCrawlTime'),
            })

    for summary in summaries.values():
        summary['stableIndexed'] = bool(
            summary['currentIndexed']
            and int(summary['observedDays'] or 0) >= GOOGLE_URL_INSPECTION_STABLE_DAYS
            and int(summary['indexedDays'] or 0) == int(summary['observedDays'] or 0)
        )

    return summaries


def get_active_google_head_channel_targets(channels_data: List[Dict]) -> Dict[str, Any]:
    available_channels: Dict[str, Dict[str, Any]] = {}
    for channel in channels_data:
        channel_slug = canonicalize_head_channel_slug(str(channel.get('channel_id') or ''))
        if channel_slug and channel_slug not in available_channels:
            available_channels[channel_slug] = channel

    base_targets = [slug for slug in get_google_url_inspection_targets() if slug in available_channels]
    pinned_targets = [slug for slug in GOOGLE_HEAD_PINNED_TARGET_CHANNELS if slug in base_targets]
    reserve_targets = [
        slug for slug in GOOGLE_HEAD_ROTATION_TARGET_CHANNELS
        if slug in available_channels and slug not in base_targets
    ]
    non_pinned_base = [slug for slug in base_targets if slug not in pinned_targets]

    history_summary = build_recent_url_inspection_summary()
    stable_non_pinned: List[str] = []
    for slug in non_pinned_base:
        channel_url = f"{SITEMAP_DOMAIN}/{slug}"
        if history_summary.get(channel_url, {}).get('stableIndexed'):
            stable_non_pinned.append(slug)

    secondary_slots = max(0, len(base_targets) - len(pinned_targets))
    candidate_order: List[str] = []
    seen: set[str] = set()
    for slug in non_pinned_base:
        if slug in stable_non_pinned or slug in seen:
            continue
        seen.add(slug)
        candidate_order.append(slug)
    for slug in reserve_targets:
        if slug in seen:
            continue
        seen.add(slug)
        candidate_order.append(slug)
    for slug in stable_non_pinned:
        if slug in seen:
            continue
        seen.add(slug)
        candidate_order.append(slug)

    active_targets = pinned_targets + candidate_order[:secondary_slots]
    deferred_targets = [slug for slug in stable_non_pinned if slug not in active_targets]
    next_candidates = [
        slug for slug in reserve_targets
        if slug not in active_targets
    ][:max(0, secondary_slots)]

    return {
        'activeTargets': active_targets,
        'baseTargets': base_targets,
        'pinnedTargets': pinned_targets,
        'reserveTargets': reserve_targets,
        'deferredTargets': deferred_targets,
        'nextCandidates': next_candidates,
        'historySummary': history_summary,
        'rotationEnabled': bool(reserve_targets),
        'stableThresholdDays': GOOGLE_URL_INSPECTION_STABLE_DAYS,
        'historyWindowDays': GOOGLE_URL_INSPECTION_HISTORY_DAYS,
    }


def build_local_logo_url(filename: str) -> str:
    return f"/{LOGOS_SUBDIR}/{filename}"


def get_logos_dir() -> str:
    return os.path.join(get_public_dir(), LOGOS_SUBDIR)


def is_http_url(value: Optional[str]) -> bool:
    if not value:
        return False
    parsed = urlparse(value)
    return parsed.scheme in ('http', 'https')


def guess_logo_extension(logo_url: str, content_type: Optional[str]) -> str:
    content_type_key = (content_type or '').split(';', 1)[0].strip().lower()
    if content_type_key in LOGO_EXT_BY_CONTENT_TYPE:
        return LOGO_EXT_BY_CONTENT_TYPE[content_type_key]

    path_ext = os.path.splitext(urlparse(logo_url).path)[1].lower().lstrip('.')
    if path_ext == 'svgz':
        return 'svg'
    if path_ext in ALLOWED_LOGO_EXTENSIONS:
        return 'jpg' if path_ext == 'jpeg' else path_ext
    return 'png'


def _logo_filename_base(channel_id: str) -> str:
    base = slugify_for_url(channel_id) or slugify(channel_id) or 'channel'
    return base


def create_logo_placeholder(channel_id: str, logos_dir: Optional[str] = None) -> Optional[str]:
    base = _logo_filename_base(channel_id)
    target_dir = logos_dir or get_logos_dir()
    os.makedirs(target_dir, exist_ok=True)
    filename = f"{base}.svg"
    filepath = os.path.join(target_dir, filename)
    if not os.path.exists(filepath):
        label = (str(channel_id or '').strip().upper() or 'TV')
        label = re.sub(r'[^A-Z0-9-]+', ' ', label)
        label = re.sub(r'\s+', ' ', label).strip()[:20] or 'TV'
        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">'
            '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
            '<stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#1e293b"/>'
            '</linearGradient></defs>'
            '<rect width="512" height="512" rx="96" fill="url(#g)"/>'
            '<text x="256" y="290" text-anchor="middle" fill="#f8fafc" '
            'font-family="Arial, Helvetica, sans-serif" font-size="56" font-weight="700">'
            f'{label}</text></svg>'
        )
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(svg)
    return build_local_logo_url(filename)


def find_existing_local_logo(channel_id: str, logos_dir: Optional[str] = None) -> Optional[str]:
    base = _logo_filename_base(channel_id)
    target_dir = logos_dir or get_logos_dir()
    if not os.path.isdir(target_dir):
        return None

    preferred_exts = ('png', 'svg', 'webp', 'jpg', 'jpeg', 'gif', 'avif')
    for ext in preferred_exts:
        name = f"{base}.{ext}"
        if os.path.exists(os.path.join(target_dir, name)):
            return build_local_logo_url(name)

    prefix = f"{base}."
    for name in sorted(os.listdir(target_dir)):
        if name.startswith(prefix):
            return build_local_logo_url(name)
    return None


def mirror_channel_logo(channel_id: str, logo_source: Optional[str]) -> Optional[str]:
    normalized_channel_id = str(channel_id or '').strip()
    source = str(logo_source or '').strip()
    if not normalized_channel_id:
        return None

    cache_key = f"{normalized_channel_id}|{source}"
    if cache_key in _logo_mirror_cache:
        return _logo_mirror_cache[cache_key]

    logos_dir = get_logos_dir()
    os.makedirs(logos_dir, exist_ok=True)
    existing_local = find_existing_local_logo(normalized_channel_id, logos_dir)

    if source.startswith('/'):
        _logo_mirror_cache[cache_key] = source
        return source

    if is_http_url(source):
        parsed = urlparse(source)
        source_host = parsed.netloc.lower()
        site_host = urlparse(SITEMAP_DOMAIN).netloc.lower()
        if source_host == site_host and parsed.path.startswith(f"/{LOGOS_SUBDIR}/"):
            _logo_mirror_cache[cache_key] = parsed.path
            return parsed.path

        base = _logo_filename_base(normalized_channel_id)
        try:
            with requests.get(
                source,
                timeout=LOGO_DOWNLOAD_TIMEOUT,
                stream=True,
                headers={'User-Agent': LOGO_USER_AGENT},
            ) as response:
                response.raise_for_status()
                ext = guess_logo_extension(source, response.headers.get('Content-Type'))
                filename = f"{base}.{ext}"
                final_path = os.path.join(logos_dir, filename)
                temp_path = f"{final_path}.tmp"

                written = 0
                with open(temp_path, 'wb') as tmp_file:
                    for chunk in response.iter_content(chunk_size=8192):
                        if not chunk:
                            continue
                        written += len(chunk)
                        if written > LOGO_MAX_BYTES:
                            raise ValueError(
                                f"logo exceeds max size ({LOGO_MAX_BYTES} bytes)"
                            )
                        tmp_file.write(chunk)
                os.replace(temp_path, final_path)

            prefix = f"{base}."
            for existing_name in os.listdir(logos_dir):
                if existing_name.startswith(prefix) and existing_name != filename:
                    stale = os.path.join(logos_dir, existing_name)
                    try:
                        os.remove(stale)
                    except OSError:
                        pass

            local_url = build_local_logo_url(filename)
            _logo_mirror_cache[cache_key] = local_url
            return local_url
        except Exception as e:
            logger.warning(f"Logo mirror failed for {normalized_channel_id}: {str(e)}")
            if existing_local:
                _logo_mirror_cache[cache_key] = existing_local
                return existing_local
            if LOGO_PLACEHOLDER_ON_FAIL:
                placeholder = create_logo_placeholder(normalized_channel_id, logos_dir)
                if placeholder:
                    _logo_mirror_cache[cache_key] = placeholder
                    return placeholder
            if source:
                _logo_mirror_cache[cache_key] = source
                return source
            return None

    if existing_local:
        _logo_mirror_cache[cache_key] = existing_local
        return existing_local

    if LOGO_PLACEHOLDER_ON_FAIL:
        placeholder = create_logo_placeholder(normalized_channel_id, logos_dir)
        if placeholder:
            _logo_mirror_cache[cache_key] = placeholder
            return placeholder

    if source:
        _logo_mirror_cache[cache_key] = source
        return source
    _logo_mirror_cache[cache_key] = None
    return None


def resolve_snapshot_logo_url(channel_id: str, logo_source: Optional[str]) -> Optional[str]:
    normalized_channel_id = str(channel_id or '').strip()
    source = str(logo_source or '').strip()
    if not normalized_channel_id:
        return source or None

    existing_local = find_existing_local_logo(normalized_channel_id)
    if existing_local:
        return existing_local

    if source.startswith('/'):
        return source

    if is_http_url(source):
        parsed = urlparse(source)
        source_host = parsed.netloc.lower()
        site_host = urlparse(SITEMAP_DOMAIN).netloc.lower()
        if source_host == site_host and parsed.path.startswith(f"/{LOGOS_SUBDIR}/"):
            return parsed.path

    return source or None


def fetch_xmltv() -> bytes:
    logger.info(f"Fetching XMLTV from {EPG_XMLTV_URL}")
    response = requests.get(EPG_XMLTV_URL, timeout=60)
    response.raise_for_status()
    return response.content


def parse_xmltv(content: bytes) -> Tuple[List[Dict], List[Dict]]:
    """Parse XMLTV gz content into channels and programs lists."""
    with gzip.GzipFile(fileobj=io.BytesIO(content)) as gz:
        xml_data = gz.read()

    root = ET.fromstring(xml_data)

    # Channels
    channels = []
    channel_id_map: Dict[str, str] = {}
    used_slugs = set()

    for ch in root.findall('channel'):
        xml_id = ch.get('id') or ''
        display_names = ch.findall('display-name')
        display_name_values: List[str] = []
        name = ''
        for dn in display_names:
            txt = (dn.text or '').strip()
            if not txt:
                continue
            display_name_values.append(txt)
            if not name:
                name = txt
        if not name:
            name = xml_id
        icon_el = ch.find('icon')
        logo_url = icon_el.get('src') if icon_el is not None else None

        slug_base = slugify(name) or slugify(xml_id)
        slug = slug_base
        suffix = 2
        while slug in used_slugs or not slug:
            slug = f"{slug_base}-{suffix}"
            suffix += 1
        used_slugs.add(slug)
        channel_id_map[xml_id] = slug

        if CHANNEL_ALLOWLIST and slug not in CHANNEL_ALLOWLIST:
            continue

        channel_number = resolve_channel_number(display_name_values, slug, name)

        channels.append({
            'channel_id': slug,
            'name': name,
            'logo_url': logo_url,
            'channel_number': channel_number,
            'category': None,
        })

    # Programs
    programs = []
    for prog in root.findall('programme'):
        xml_channel_id = prog.get('channel') or ''
        channel_id = channel_id_map.get(xml_channel_id) or slugify(xml_channel_id)
        if CHANNEL_ALLOWLIST and channel_id not in CHANNEL_ALLOWLIST:
            continue

        start_raw = prog.get('start')
        end_raw = prog.get('stop')
        if not start_raw or not end_raw:
            continue

        try:
            start_time = parse_xmltv_datetime(start_raw)
            end_time = parse_xmltv_datetime(end_raw)
        except Exception:
            continue

        title_el = prog.find('title')
        desc_el = prog.find('desc')
        cat_el = prog.find('category')

        title = title_el.text.strip() if title_el is not None and title_el.text else ''
        desc = desc_el.text.strip() if desc_el is not None and desc_el.text else ''
        category = cat_el.text.strip() if cat_el is not None and cat_el.text else None

        if not title:
            continue

        programs.append({
            'channel_id': channel_id,
            'title': title,
            'description': desc,
            'start': start_time.isoformat(),
            'end': end_time.isoformat(),
            'category': category,
        })

    return channels, programs

# ============================================
# SUPABASE OPERATIONS
# ============================================

def get_supabase_client() -> Any:
    database_url = os.getenv('DATABASE_URL', '').strip()
    if database_url:
        pg_client = try_create_postgres_client(database_url)
        if pg_client is not None:
            return pg_client

    url = os.getenv('SUPABASE_URL')
    key = get_supabase_admin_key()

    if not url or not key:
        raise ValueError(
            "Missing working DATABASE_URL or SUPABASE_URL with SUPABASE_SERVICE_KEY/SUPABASE_READ_KEY environment variables"
        )

    # Do not force a global Prefer header: upsert requires
    # `resolution=merge-duplicates` and per-request headers.
    logger.info("Using Supabase REST client")
    options = ClientOptions(schema='public')
    return create_client(url, key, options=options)


def upsert_channels_batch(supabase: Client, batch: List[Dict], label: str) -> int:
    if not batch:
        return 0

    cleaned_batch = []
    for row in batch:
        channel_id = str(row.get('channel_id') or '').strip()
        name = str(row.get('name') or '').strip()
        if not channel_id or not name:
            continue

        cleaned_row = {
            'channel_id': channel_id,
            'name': name,
        }

        logo_url = row.get('logo_url')
        mirrored_logo_url = mirror_channel_logo(channel_id, logo_url)
        if isinstance(mirrored_logo_url, str) and mirrored_logo_url.strip():
            cleaned_row['logo_url'] = mirrored_logo_url.strip()
        elif isinstance(logo_url, str) and logo_url.strip():
            cleaned_row['logo_url'] = logo_url.strip()

        channel_number = row.get('channel_number')
        if isinstance(channel_number, int) and channel_number > 0:
            cleaned_row['channel_number'] = channel_number

        category = row.get('category')
        if isinstance(category, str) and category.strip():
            cleaned_row['category'] = category.strip()

        cleaned_batch.append(cleaned_row)

    if not cleaned_batch:
        return 0

    try:
        execute_with_retry(
            supabase.table(CHANNELS_TABLE).upsert(
                cleaned_batch,
                on_conflict='channel_id'
            ),
            label=label
        )
        return len(cleaned_batch)
    except Exception as e:
        logger.warning(f"{label} failed, falling back to per-channel upsert: {str(e)}")

    processed = 0
    for row in cleaned_batch:
        channel_id = row.get('channel_id')
        if not channel_id:
            continue
        try:
            execute_with_retry(
                supabase.table(CHANNELS_TABLE).upsert(
                    row,
                    on_conflict='channel_id'
                ),
                label=f"{label} single {channel_id}"
            )
            processed += 1
            continue
        except Exception as single_error:
            logger.warning(f"Single upsert failed for channel {channel_id}: {str(single_error)}")

        # Last-resort fallback: update existing row by channel_id.
        try:
            update_payload = {
                k: v for k, v in row.items()
                if k != 'channel_id' and v is not None and (not isinstance(v, str) or v.strip())
            }
            if not update_payload:
                processed += 1
                continue
            execute_with_retry(
                supabase.table(CHANNELS_TABLE).update(update_payload).eq('channel_id', channel_id),
                label=f"{label} update fallback {channel_id}"
            )
            processed += 1
        except Exception as update_error:
            logger.error(f"Failed channel upsert/update for {channel_id}: {str(update_error)}")

    return processed


def upsert_channels(supabase: Client, channels_data: List[Dict]) -> int:
    deduped_channels: Dict[str, Dict] = {}
    for channel in channels_data:
        channel_id = str(channel.get('channel_id') or '').strip()
        if not channel_id:
            continue
        deduped_channels[channel_id] = channel

    channels = list(deduped_channels.values())
    logger.info(f"Upserting {len(channels)} unique channels into {CHANNELS_TABLE} (from {len(channels_data)} rows)")
    processed = 0
    batch_size = 200
    batch = []
    for channel in channels:
        channel_record = {
            'channel_id': channel.get('channel_id'),
            'name': channel.get('name'),
            'logo_url': channel.get('logo_url'),
            'channel_number': channel.get('channel_number'),
            'category': channel.get('category')
        }
        batch.append(channel_record)

        if len(batch) >= batch_size:
            processed += upsert_channels_batch(supabase, batch, 'upsert channels batch')
            batch = []

    if batch:
        processed += upsert_channels_batch(supabase, batch, 'upsert channels final batch')

    logger.info(f"Successfully upserted {processed} channels")
    return processed


def parse_program_datetime(value: str) -> datetime:
    if not value:
        raise ValueError("Missing program datetime")

    text = str(value).strip()
    if 'T' in text:
        dt = datetime.fromisoformat(text.replace('Z', '+00:00'))
    else:
        dt = parse_xmltv_datetime(text)

    if dt.tzinfo is None:
        dt = TIMEZONE.localize(dt)
    return dt


def clear_programs_for_date(supabase: Client, target_date: str, channel_ids: List[str]) -> List[str]:
    """
    Clear one day before insert.
    Returns channels that could not be cleaned (to skip insertion and avoid duplicates).
    """
    try:
        execute_with_retry(
            supabase.table(PROGRAMS_TABLE).delete().eq('date', target_date),
            label=f'delete programs for date {target_date}'
        )
        return []
    except Exception as e:
        logger.warning(f"Date-wide cleanup failed for {target_date}, falling back to per-channel deletes: {str(e)}")

    failed_channels: List[str] = []
    for channel_id in sorted(set(channel_ids)):
        try:
            execute_with_retry(
                supabase.table(PROGRAMS_TABLE).delete().eq('date', target_date).eq('channel_id', channel_id),
                label=f'delete programs for date {target_date} channel {channel_id}'
            )
        except Exception as e:
            failed_channels.append(channel_id)
            logger.warning(f"Failed to clear {target_date} channel {channel_id}: {str(e)}")

    return failed_channels


def insert_programs(supabase: Client, programs_data: List[Dict]) -> int:
    if not programs_data:
        logger.info("No programs to insert")
        return 0

    # Deduplicate by channel + start + end; keep the richest record
    unique: Dict[Tuple[str, str, str], Tuple[Dict, int]] = {}
    for program in programs_data:
        channel_id = program.get('channel_id') or ''
        start = program.get('start') or ''
        end = program.get('end') or ''
        if not channel_id or not start or not end:
            continue
        title = program.get('title') or ''
        desc = program.get('description') or program.get('desc') or ''
        category = program.get('category') or program.get('genre') or ''
        score = len(title) + len(desc) + (10 if category else 0)
        key = (channel_id, start, end)
        existing = unique.get(key)
        if not existing or score > existing[1]:
            unique[key] = (program, score)

    deduped_programs = [p for p, _ in unique.values()]
    if len(deduped_programs) != len(programs_data):
        logger.info(f"Deduped programs: {len(programs_data)} -> {len(deduped_programs)}")

    enrich_programs_with_replay_urls(deduped_programs)

    prepared_programs: List[Dict] = []
    for program in deduped_programs:
        try:
            start_time = parse_program_datetime(program['start'])
            end_time = parse_program_datetime(program['end'])
            channel_id = str(program.get('channel_id') or '').strip()
            title = str(program.get('title') or '').strip()
            if not channel_id or not title:
                continue

            time_slot = get_time_slot(start_time)
            paris_date = start_time.astimezone(TIMEZONE).date().isoformat()

            prepared_programs.append({
                'channel_id': channel_id,
                'title': title,
                'description': program.get('description') or program.get('desc'),
                'start_time': start_time.isoformat(),
                'end_time': end_time.isoformat(),
                'date': paris_date,
                'time_slot': time_slot,
                'genre': program.get('genre') or program.get('category'),
                'rating': program.get('rating'),
                'poster_url': program.get('poster'),
                'replay_url': program.get('replay_url'),
                'slug': slugify_for_url(title)
            })
        except Exception as e:
            logger.error(f"Failed to prepare program {program.get('title')}: {str(e)}")

    cleanup_targets: Dict[str, set] = {}
    for record in prepared_programs:
        cleanup_targets.setdefault(record['date'], set()).add(record['channel_id'])

    blocked_segments = set()
    if cleanup_targets:
        sorted_dates = sorted(cleanup_targets.keys())
        logger.info(
            f"Clearing existing programs for {len(sorted_dates)} dates before insert: "
            f"{sorted_dates[:10]}{'...' if len(sorted_dates) > 10 else ''}"
        )
        for target_date in sorted_dates:
            failed_channels = clear_programs_for_date(
                supabase,
                target_date,
                list(cleanup_targets.get(target_date, set()))
            )
            for channel_id in failed_channels:
                blocked_segments.add((target_date, channel_id))

    insertable_programs = [
        record for record in prepared_programs
        if (record['date'], record['channel_id']) not in blocked_segments
    ]
    skipped = len(prepared_programs) - len(insertable_programs)
    if skipped:
        logger.warning(
            f"Skipping {skipped} programs because cleanup failed for some date/channel segments "
            f"(prevents duplicate growth)"
        )

    logger.info(f"Inserting {len(insertable_programs)} programs into {PROGRAMS_TABLE}")
    batch = []
    inserted = 0

    for program_record in insertable_programs:
        batch.append(program_record)
        if len(batch) >= BATCH_SIZE:
            execute_with_retry(
                supabase.table(PROGRAMS_TABLE).insert(batch),
                label='insert programs batch'
            )
            inserted += len(batch)
            logger.info(f"Inserted batch of {len(batch)} programs (total: {inserted})")
            batch = []

    if batch:
        execute_with_retry(
            supabase.table(PROGRAMS_TABLE).insert(batch),
            label='insert programs final batch'
        )
        inserted += len(batch)
        logger.info(f"Inserted final batch of {len(batch)} programs")

    logger.info(f"Successfully inserted {inserted} programs")
    return inserted


def cleanup_old_programs(supabase: Client) -> int:
    cutoff_date = (datetime.now(TIMEZONE).date() - timedelta(days=RETENTION_DAYS))
    logger.info(f"Cleaning up programs older than {cutoff_date} (RETENTION_DAYS={RETENTION_DAYS})")

    cleaned_date_scopes = 0
    for cycle in range(1, RETENTION_MAX_CYCLES + 1):
        try:
            result = execute_with_retry(
                supabase.table(PROGRAMS_TABLE)
                .select('date,channel_id')
                .lt('date', cutoff_date.isoformat())
                .order('date')
                .limit(RETENTION_SCAN_LIMIT),
                label=f'scan old programs batch #{cycle}'
            )
        except Exception as e:
            logger.error(f"Failed to scan old programs (cycle {cycle}): {str(e)}")
            break

        rows = getattr(result, 'data', None) or []
        if not rows:
            break

        dates_to_channels: Dict[str, set] = {}
        for row in rows:
            target_date = row.get('date')
            channel_id = row.get('channel_id')
            if not target_date:
                continue
            dates_to_channels.setdefault(target_date, set())
            if channel_id:
                dates_to_channels[target_date].add(channel_id)

        if not dates_to_channels:
            break

        cycle_progress = False
        for target_date in sorted(dates_to_channels.keys()):
            failed_channels = clear_programs_for_date(
                supabase,
                target_date,
                list(dates_to_channels.get(target_date, set()))
            )
            if len(failed_channels) < len(dates_to_channels.get(target_date, set())):
                cleaned_date_scopes += 1
                cycle_progress = True

        if not cycle_progress:
            logger.warning("Old data cleanup is stalled (no progress in current cycle), stopping")
            break

    logger.info(f"Old programs cleanup finished (date scopes cleaned: {cleaned_date_scopes})")
    return cleaned_date_scopes


def delete_programs_in_range(supabase: Client, start_date: str, end_date: str) -> int:
    """Delete existing programs in date range to prevent duplicates"""
    logger.info(f"Deleting programs from {start_date} to {end_date} before insert")
    try:
        result = execute_with_retry(
            supabase.table(PROGRAMS_TABLE)
            .delete()
            .gte('date', start_date)
            .lte('date', end_date),
            label='delete programs in range'
        )
        deleted = len(result.data) if hasattr(result, 'data') else 0
        logger.info(f"Deleted {deleted} programs in date range")
        return deleted
    except Exception as e:
        logger.warning(f"Failed to delete programs in range: {str(e)}")
        return 0

# ============================================
# SITEMAP GENERATION (PROGRAM PAGES)
# ============================================

def get_public_dir() -> str:
    global _resolved_public_dir
    if _resolved_public_dir:
        return _resolved_public_dir

    env_dir = os.getenv('SITEMAP_PUBLIC_DIR')
    if env_dir:
        env_dir = os.path.abspath(env_dir)
        parent_dir = os.path.dirname(env_dir) or '.'
        if os.path.isdir(env_dir):
            _resolved_public_dir = env_dir
            return _resolved_public_dir
        if os.path.isdir(parent_dir) and os.access(parent_dir, os.W_OK):
            _resolved_public_dir = env_dir
            return _resolved_public_dir
        logger.warning(
            f"SITEMAP_PUBLIC_DIR not accessible ({env_dir}), using local frontend/public fallback"
        )
    if os.path.isdir(DEFAULT_PUBLIC_DIR):
        _resolved_public_dir = DEFAULT_PUBLIC_DIR
        return _resolved_public_dir
    local_public = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend', 'public'))
    _resolved_public_dir = local_public
    return _resolved_public_dir


def get_program_slug(title: str) -> str:
    return slugify_for_url(title)


def get_program_slug_aliases(title: str) -> List[str]:
    aliases: List[str] = []
    canonical = get_program_slug(title)
    if canonical:
        aliases.append(canonical)

    raw_title = str(title or '').strip()
    if raw_title:
        # Support legacy/internal URLs that expanded episode fractions like (6/24)
        # into "-6-24" instead of the current compact "-624" slug.
        expanded_fraction_title = re.sub(r'(?<=\d)/(?=\d)', '-', raw_title)
        expanded_fraction_slug = slugify_for_url(expanded_fraction_title)
        if expanded_fraction_slug and expanded_fraction_slug not in aliases:
            aliases.append(expanded_fraction_slug)

    return aliases


def build_program_snapshot_slug_aliases(program: Dict[str, Any], title: str) -> List[str]:
    aliases: List[str] = []

    stored_slug = slugify_for_url(str(program.get('slug') or '').strip())
    if stored_slug:
        aliases.append(stored_slug)

    for alias in get_program_slug_aliases(title):
        if alias and alias not in aliases:
            aliases.append(alias)

    return aliases


def fetch_program_snapshot_backfill_rows(start_cutoff: datetime, end_cutoff: datetime) -> List[Dict[str, Any]]:
    try:
        supabase = get_supabase_client()
    except Exception as exc:
        logger.warning(f"Program snapshot DB backfill unavailable: {str(exc)}")
        return []

    batch_size = 1000
    offset = 0
    rows: List[Dict[str, Any]] = []

    select_columns = 'channel_id,title,description,start_time,end_time,genre,poster_url,replay_url,slug'
    while True:
        try:
            result = (
                supabase.table(PROGRAMS_TABLE)
                .select(select_columns)
                .gte('start_time', start_cutoff.isoformat())
                .lte('start_time', end_cutoff.isoformat())
                .order('start_time')
                .range(offset, offset + batch_size - 1)
                .execute()
            )
        except Exception as exc:
            logger.warning(f"Program snapshot DB backfill query failed: {str(exc)}")
            break

        data = getattr(result, 'data', None) or []
        if not data:
            break

        rows.extend(data)
        if len(data) < batch_size:
            break
        offset += batch_size

    normalized_rows: List[Dict[str, Any]] = []
    for row in rows:
        channel_id = str(row.get('channel_id') or '').strip()
        title = str(row.get('title') or '').strip()
        start_time = row.get('start_time')
        end_time = row.get('end_time')
        if not channel_id or not title or not start_time or not end_time:
            continue
        normalized_rows.append({
            'channel_id': channel_id,
            'title': title,
            'description': str(row.get('description') or ''),
            'start': str(start_time),
            'end': str(end_time),
            'category': str(row.get('genre') or ''),
            'poster': row.get('poster_url'),
            'replay_url': row.get('replay_url'),
            'slug': row.get('slug'),
        })

    if normalized_rows:
        logger.info(f"Program snapshot DB backfill loaded: {len(normalized_rows)} rows")
    return normalized_rows


def fetch_programs_for_sitemap(supabase: Client) -> List[Dict]:
    today = datetime.now(TIMEZONE).date()
    min_date = (today - timedelta(days=PROGRAM_SITEMAP_PAST_DAYS)).isoformat()
    max_date = (today + timedelta(days=PROGRAM_SITEMAP_FUTURE_DAYS)).isoformat()
    batch_size = 1000
    all_rows: List[Dict] = []
    cursor = datetime.fromisoformat(min_date).date()
    end_date = datetime.fromisoformat(max_date).date()

    while cursor <= end_date:
        day = cursor.isoformat()
        offset = 0
        while True:
            result = supabase.table(PROGRAMS_TABLE)\
                .select('title, channel_id, date')\
                .eq('date', day)\
                .range(offset, offset + batch_size - 1)\
                .execute()
            data = getattr(result, 'data', None) or []
            if not data:
                break
            all_rows.extend(data)
            if len(data) < batch_size:
                break
            offset += batch_size
        cursor = cursor + timedelta(days=1)
    return all_rows


def write_sitemap_index(
    public_dir: str,
    *,
    lastmod_head: Optional[str] = None,
    lastmod_static: Optional[str] = None,
    lastmod_programs: Optional[str] = None,
    include_programs: bool = True,
) -> str:
    today = datetime.now(TIMEZONE).date().isoformat()
    sitemap_index = os.path.join(public_dir, 'sitemap.xml')

    items: List[Tuple[str, str]] = []
    head_path = os.path.join(public_dir, 'sitemap-head.xml')
    static_path = os.path.join(public_dir, 'sitemap-static.xml')
    programs_path = os.path.join(public_dir, 'sitemap-programmes.xml')

    if os.path.exists(head_path):
        items.append((f'{SITEMAP_DOMAIN}/sitemap-head.xml', lastmod_head or today))
    if os.path.exists(static_path):
        items.append((f'{SITEMAP_DOMAIN}/sitemap-static.xml', lastmod_static or today))
    if include_programs and os.path.exists(programs_path):
        items.append((f'{SITEMAP_DOMAIN}/sitemap-programmes.xml', lastmod_programs or today))

    with open(sitemap_index, 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n')
        f.write('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')
        for loc, lastmod in items:
            f.write('  <sitemap>\n')
            f.write(f'    <loc>{loc}</loc>\n')
            f.write(f'    <lastmod>{lastmod}</lastmod>\n')
            f.write('  </sitemap>\n')
        f.write('</sitemapindex>\n')

    return sitemap_index


def generate_programs_sitemap(supabase: Client) -> Optional[str]:
    public_dir = get_public_dir()
    os.makedirs(public_dir, exist_ok=True)
    programs = fetch_programs_for_sitemap(supabase)
    if not programs:
        logger.warning("No programs found for sitemap generation")
        return None

    today = datetime.now(TIMEZONE).date()
    entries: Dict[str, Dict] = {}

    def parse_iso_date(value: Optional[str]) -> Optional[date]:
        text = str(value or '').strip()
        if not text:
            return None
        try:
            return datetime.fromisoformat(text).date()
        except Exception:
            return None

    for p in programs:
        channel_id = p.get('channel_id') or ''
        title = p.get('title') or ''
        if not channel_id or not title:
            continue
        channel_slug = canonicalize_head_channel_slug(channel_id)
        program_slug = get_program_slug(title)
        if not channel_slug or not program_slug:
            continue
        loc = f"{SITEMAP_DOMAIN}/programme/{channel_slug}/{program_slug}"
        airing_date = parse_iso_date(p.get('date'))
        row = entries.get(loc)
        if not row:
            row = {
                'loc': loc,
                'next_airing': None,
                'latest_past_airing': None,
            }
            entries[loc] = row

        if airing_date is None:
            continue

        if airing_date >= today:
            if row['next_airing'] is None or airing_date < row['next_airing']:
                row['next_airing'] = airing_date
        else:
            if row['latest_past_airing'] is None or airing_date > row['latest_past_airing']:
                row['latest_past_airing'] = airing_date

    sitemap_rows: List[Dict] = []
    for row in entries.values():
        next_airing = row.get('next_airing')
        latest_past_airing = row.get('latest_past_airing')

        # `lastmod` must represent URL content evolution, not importer run time.
        # Since rows are reinserted daily, created_at would make every URL "today".
        if latest_past_airing is not None:
            lastmod = latest_past_airing
        elif next_airing is not None and (next_airing - today).days <= 1:
            lastmod = today
        else:
            lastmod = today - timedelta(days=1)

        if next_airing is not None:
            days_to_air = (next_airing - today).days
            if days_to_air > PROGRAM_SITEMAP_FUTURE_DAYS:
                continue
            if days_to_air <= 0:
                priority = '1.0'
                changefreq = 'daily'
                sort_key = (0, -lastmod.toordinal(), row['loc'])
            elif days_to_air == 1:
                priority = '0.9'
                changefreq = 'daily'
                sort_key = (1, -lastmod.toordinal(), row['loc'])
            elif days_to_air <= 3:
                priority = '0.8'
                changefreq = 'daily'
                sort_key = (2, -lastmod.toordinal(), row['loc'])
            elif days_to_air <= 7:
                priority = '0.7'
                changefreq = 'daily'
                sort_key = (3, -lastmod.toordinal(), row['loc'])
            else:
                priority = '0.6'
                changefreq = 'weekly'
                sort_key = (4, -lastmod.toordinal(), row['loc'])
        else:
            if latest_past_airing is not None and (today - latest_past_airing).days <= PROGRAM_SITEMAP_PAST_DAYS:
                priority = '0.5'
                changefreq = 'daily'
                sort_key = (5, -lastmod.toordinal(), row['loc'])
            else:
                # Exclude stale pages from program sitemap: no upcoming airing
                # and latest past airing outside the narrow freshness window.
                continue

        sitemap_rows.append({
            'loc': row['loc'],
            'lastmod': lastmod.isoformat(),
            'changefreq': changefreq,
            'priority': priority,
            'sort_key': sort_key,
        })

    sitemap_rows.sort(key=lambda item: item['sort_key'])
    if len(sitemap_rows) > PROGRAM_SITEMAP_MAX_URLS:
        sitemap_rows = sitemap_rows[:PROGRAM_SITEMAP_MAX_URLS]

    programs_path = os.path.join(public_dir, 'sitemap-programmes.xml')
    with open(programs_path, 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n')
        f.write('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')
        for item in sitemap_rows:
            f.write('  <url>\n')
            f.write(f'    <loc>{item["loc"]}</loc>\n')
            f.write(f'    <lastmod>{item["lastmod"]}</lastmod>\n')
            f.write(f'    <changefreq>{item["changefreq"]}</changefreq>\n')
            f.write(f'    <priority>{item["priority"]}</priority>\n')
            f.write('  </url>\n')
        f.write('</urlset>\n')

    sitemap_static = os.path.join(public_dir, 'sitemap-static.xml')
    sitemap_index = os.path.join(public_dir, 'sitemap.xml')
    if not os.path.exists(sitemap_static) and os.path.exists(sitemap_index):
        try:
            with open(sitemap_index, 'r', encoding='utf-8') as src:
                content = src.read()
            if '<urlset' in content and '<sitemapindex' not in content:
                with open(sitemap_static, 'w', encoding='utf-8') as dst:
                    dst.write(content)
        except Exception as e:
            logger.warning(f"Failed to create sitemap-static.xml: {str(e)}")

    if sitemap_rows:
        lastmod_programs = max(item['lastmod'] for item in sitemap_rows)
    else:
        lastmod_programs = datetime.now(TIMEZONE).date().isoformat()
    write_sitemap_index(
        public_dir,
        lastmod_programs=lastmod_programs,
        lastmod_static=datetime.now(TIMEZONE).date().isoformat(),
        include_programs=bool(sitemap_rows),
    )

    logger.info(f"Sitemaps generated in {public_dir}")
    return lastmod_programs


def fetch_all_channels_for_sitemap(supabase: Client) -> List[Dict]:
    batch_size = 1000
    offset = 0
    all_rows: List[Dict] = []

    while True:
        result = supabase.table(CHANNELS_TABLE)\
            .select('channel_id, name')\
            .order('channel_id')\
            .range(offset, offset + batch_size - 1)\
            .execute()
        rows = getattr(result, 'data', None) or []
        if not rows:
            break
        all_rows.extend(rows)
        if len(rows) < batch_size:
            break
        offset += batch_size

    return all_rows


def generate_html_sitemap(supabase: Client) -> Optional[str]:
    public_dir = get_public_dir()
    html_dir = os.path.join(public_dir, 'plan-du-site')
    os.makedirs(html_dir, exist_ok=True)

    channels = fetch_all_channels_for_sitemap(supabase)
    seen = set()
    channel_links: List[str] = []

    for channel in channels:
        channel_id = str(channel.get('channel_id') or '').strip()
        if not channel_id:
            continue
        slug = slugify_for_url(channel_id)
        if not slug:
            continue

        is_radio = 'radio' in channel_id.lower()
        candidates = (
            [f"/radio/{slug}", f"/radio/{slug}/en-direct", f"/radio/{slug}/demain"]
            if is_radio else
            [f"/{slug}", f"/en-direct/{slug}", f"/ce-soir/{slug}", f"/demain/{slug}"]
        )

        for href in candidates:
            if href in seen:
                continue
            seen.add(href)
            channel_links.append(href)

    channel_links.sort()

    root_pages = [
        '/',
        '/en-direct',
        '/demain',
        '/plan-du-site/',
        '/recommandes',
        '/recherche',
        '/film-ce-soir',
        '/series-ce-soir',
        '/sport-ce-soir',
        '/documentaires-ce-soir',
        '/divertissement-ce-soir',
        '/infos-ce-soir',
        '/jeunesse-ce-soir',
        '/culture-ce-soir',
        '/conditions-generales',
        '/politique-cookies',
        '/credits',
        '/sitemap.xml',
        '/sitemap-static.xml',
        '/sitemap-programmes.xml',
    ]

    html_path = os.path.join(html_dir, 'index.html')
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write('<!doctype html>\n')
        f.write('<html lang="fr">\n<head>\n')
        f.write('  <meta charset="utf-8">\n')
        f.write('  <meta name="viewport" content="width=device-width, initial-scale=1">\n')
        f.write('  <title>Plan du site - Programme Ce Soir</title>\n')
        f.write('  <meta name="description" content="Plan du site Programme Ce Soir : accès aux pages principales et chaînes TV.">\n')
        f.write('  <meta name="robots" content="index,follow">\n')
        f.write(f'  <link rel="canonical" href="{SITEMAP_DOMAIN}/plan-du-site/">\n')
        f.write('</head>\n')
        f.write('<body style="font-family:Inter,Arial,sans-serif;max-width:1200px;margin:0 auto;padding:24px;">\n')
        f.write('  <h1>Plan du site Programme Ce Soir</h1>\n')
        f.write('  <p>Accès rapide aux pages principales et aux pages de chaînes.</p>\n')
        f.write('  <h2>Pages principales</h2>\n')
        f.write('  <ul>\n')
        for href in root_pages:
            f.write(f'    <li><a href="{href}">{href}</a></li>\n')
        f.write('  </ul>\n')
        f.write('  <h2>Pages chaînes</h2>\n')
        f.write(f'  <p>Total liens chaînes: {len(channel_links)}</p>\n')
        f.write('  <ul>\n')
        for href in channel_links:
            f.write(f'    <li><a href="{href}">{href}</a></li>\n')
        f.write('  </ul>\n')
        f.write('</body>\n</html>\n')

    logger.info(f"HTML sitemap generated: {html_path} ({len(channel_links)} channel links)")
    return html_path


def generate_static_sitemap(supabase: Client) -> Optional[str]:
    """Generate static sitemap with evergreen pages and root channel listings only."""
    public_dir = get_public_dir()
    os.makedirs(public_dir, exist_ok=True)
    
    today = datetime.now(TIMEZONE).date().isoformat()
    urls = []
    
    # Static pages
    static_pages = [
        ('', '1.0'),
        ('/en-direct', '0.8'),
        ('/demain', '0.8'),
        ('/plan-du-site/', '0.8'),
        ('/recommandes', '0.8'),
        ('/politique-cookies', '0.8'),
        ('/conditions-generales', '0.8')
    ]
    
    for page, priority in static_pages:
        urls.append({
            'loc': f"{SITEMAP_DOMAIN}{page}",
            'lastmod': today,
            'changefreq': 'daily',
            'priority': priority
        })
    
    # Category pages
    categories = [
        'film-ce-soir', 'series-ce-soir', 'sport-ce-soir',
        'documentaires-ce-soir', 'divertissement-ce-soir',
        'infos-ce-soir', 'jeunesse-ce-soir', 'culture-ce-soir'
    ]
    
    for category in categories:
        urls.append({
            'loc': f"{SITEMAP_DOMAIN}/{category}",
            'lastmod': today,
            'changefreq': 'hourly',
            'priority': '0.9'
        })
    
    # Channel root pages only. Per-view channel URLs are intentionally kept out
    # of the broad static sitemap and moved into the dedicated head sitemap.
    try:
        channels = fetch_all_channels_for_sitemap(supabase)
        
        for channel in channels:
            channel_id = channel.get('channel_id', '')
            if not channel_id:
                continue
            channel_slug = canonicalize_head_channel_slug(channel_id)
            if not channel_slug:
                continue
            urls.append({
                'loc': f"{SITEMAP_DOMAIN}/{channel_slug}",
                'lastmod': today,
                'changefreq': 'daily',
                'priority': '0.7'
            })
    except Exception as e:
        logger.warning(f"Failed to fetch channels for static sitemap: {str(e)}")
    
    # Write static sitemap
    static_path = os.path.join(public_dir, 'sitemap-static.xml')
    with open(static_path, 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n')
        f.write('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')
        for url in urls:
            f.write('  <url>\n')
            f.write(f'    <loc>{url["loc"]}</loc>\n')
            f.write(f'    <lastmod>{url["lastmod"]}</lastmod>\n')
            f.write(f'    <changefreq>{url["changefreq"]}</changefreq>\n')
            f.write(f'    <priority>{url["priority"]}</priority>\n')
            f.write('  </url>\n')
        f.write('</urlset>\n')
    
    generate_head_sitemap(supabase)
    write_sitemap_index(
        public_dir,
        lastmod_head=today,
        lastmod_static=today,
        lastmod_programs=today,
        include_programs=True,
    )

    logger.info(f"Static sitemap generated: {static_path} ({len(urls)} URLs)")
    return today


def generate_head_sitemap(supabase: Client) -> Optional[str]:
    public_dir = get_public_dir()
    os.makedirs(public_dir, exist_ok=True)
    today = datetime.now(TIMEZONE).date().isoformat()
    urls: List[Dict[str, str]] = []
    seen: set[str] = set()

    def add_url(path: str, priority: str, changefreq: str = 'daily') -> None:
        loc = f"{SITEMAP_DOMAIN}{path}"
        if loc in seen:
            return
        seen.add(loc)
        urls.append({
            'loc': loc,
            'lastmod': today,
            'changefreq': changefreq,
            'priority': priority,
        })

    for path, priority in [
        ('', '1.0'),
        ('/en-direct', '0.95'),
        ('/demain', '0.9'),
        ('/film-ce-soir', '0.9'),
        ('/series-ce-soir', '0.85'),
        ('/sport-ce-soir', '0.85'),
        ('/documentaires-ce-soir', '0.8'),
        ('/recommandes', '0.8'),
        ('/actualites', '0.75'),
        ('/films', '0.75'),
        ('/series', '0.75'),
        ('/acteurs', '0.7'),
    ]:
        add_url(path, priority, 'daily')

    channels = fetch_all_channels_for_sitemap(supabase)
    active_target_info = get_active_google_head_channel_targets(channels)
    for channel_slug in active_target_info.get('activeTargets') or []:
        add_url(f'/{channel_slug}', '0.95', 'hourly')
        add_url(f'/ce-soir/{channel_slug}', '0.9', 'hourly')
        add_url(f'/en-direct/{channel_slug}', '0.85', 'hourly')
        add_url(f'/demain/{channel_slug}', '0.85', 'hourly')

    head_path = os.path.join(public_dir, 'sitemap-head.xml')
    with open(head_path, 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n')
        f.write('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')
        for url in urls:
            f.write('  <url>\n')
            f.write(f'    <loc>{url["loc"]}</loc>\n')
            f.write(f'    <lastmod>{url["lastmod"]}</lastmod>\n')
            f.write(f'    <changefreq>{url["changefreq"]}</changefreq>\n')
            f.write(f'    <priority>{url["priority"]}</priority>\n')
            f.write('  </url>\n')
        f.write('</urlset>\n')

    logger.info(f"Head sitemap generated: {head_path} ({len(urls)} URLs)")
    return today


# ============================================
# HEAD CHANNEL SNAPSHOTS
# ============================================

def escape_html(value: Any) -> str:
    text = str(value or '')
    return (
        text.replace('&', '&amp;')
        .replace('<', '&lt;')
        .replace('>', '&gt;')
        .replace('"', '&quot;')
        .replace("'", '&#39;')
    )


def escape_json_for_html(value: Any) -> str:
    return (
        json.dumps(value, ensure_ascii=False, separators=(',', ':'))
        .replace('<', '\\u003c')
        .replace('>', '\\u003e')
        .replace('&', '\\u0026')
        .replace('\u2028', '\\u2028')
        .replace('\u2029', '\\u2029')
    )


def to_absolute_url(url: Optional[str]) -> str:
    text = str(url or '').strip()
    if not text:
        return f"{SITEMAP_DOMAIN}/apple-touch-icon.png"
    if text.startswith('http://') or text.startswith('https://'):
        return text
    if not text.startswith('/'):
        text = f'/{text}'
    return f"{SITEMAP_DOMAIN}{text}"


def compact_text(value: Optional[str], max_length: int = 220) -> str:
    text = re.sub(r'\s+', ' ', str(value or '')).strip()
    if len(text) <= max_length:
        return text
    clipped = text[: max_length - 1].rstrip(' ,;:-')
    return f"{clipped}…"


def strip_existing_head_tags(html: str) -> str:
    patterns = [
        r'\s*<script type="application/ld\+json" data-seo="[^"]*">[\s\S]*?</script>',
        r'\s*<script id="app-bootstrap-data" type="application/json">[\s\S]*?</script>',
        r'\s*<style data-seo="program-fallback">[\s\S]*?</style>',
        r'\s*<link rel="canonical" href="[^"]*">\s*',
        r'\s*<meta name="author" content="[^"]*">\s*',
        r'\s*<meta name="publisher" content="[^"]*">\s*',
        r'\s*<meta property="og:[^"]+" content="[^"]*">\s*',
        r'\s*<meta name="twitter:[^"]+" content="[^"]*">\s*',
    ]
    for pattern in patterns:
        html = re.sub(pattern, '\n', html, flags=re.IGNORECASE)
    return html


def replace_single_tag(html: str, pattern: str, replacement: str) -> str:
    if re.search(pattern, html, flags=re.IGNORECASE):
        return re.sub(pattern, lambda _match: replacement, html, count=1, flags=re.IGNORECASE)
    return html


def replace_single_block(html: str, pattern: str, replacement: str) -> str:
    if re.search(pattern, html, flags=re.IGNORECASE):
        return re.sub(pattern, lambda _match: replacement, html, count=1, flags=re.IGNORECASE)
    return html


def format_fr_datetime(iso_value: str) -> str:
    dt = parse_program_datetime(iso_value).astimezone(TIMEZONE)
    weekdays = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
    months = [
        'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
        'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
    ]
    return f"{weekdays[dt.weekday()].capitalize()} {dt.day:02d} {months[dt.month - 1]} {dt.year} à {dt:%H:%M}"


def build_channel_program_url(channel_slug: str, title: str) -> str:
    return f"/programme/{channel_slug}/{slugify_for_url(title)}"


def normalize_media_lookup_time(value: Any) -> str:
    try:
        if isinstance(value, datetime):
            return value.astimezone(timezone.utc).replace(second=0, microsecond=0).isoformat()
        return parse_program_datetime(str(value)).astimezone(timezone.utc).replace(second=0, microsecond=0).isoformat()
    except Exception:
        return ''


def fetch_program_media_lookup() -> Dict[str, Dict[Tuple[str, str, str], Dict[str, Any]]]:
    database_url = os.getenv('DATABASE_URL', '').strip()
    if not database_url:
        return {'exact': {}, 'title': {}, 'global': {}}

    cutoff_start = datetime.now(timezone.utc) - timedelta(hours=8)
    cutoff_end = datetime.now(timezone.utc) + timedelta(days=8)
    rows: List[Dict[str, Any]] = []

    try:
        pg = create_postgres_client(database_url)
        try:
            with pg.cursor() as cursor:
                cursor.execute(
                    f"""
                    SELECT channel_id, title, slug, start_time, poster_url, replay_url
                    FROM {PROGRAMS_TABLE}
                    WHERE start_time >= %s
                      AND start_time <= %s
                      AND (poster_url IS NOT NULL OR replay_url IS NOT NULL)
                    ORDER BY start_time ASC
                    LIMIT 20000
                    """,
                    (cutoff_start.isoformat(), cutoff_end.isoformat()),
                )
                names = [desc[0] for desc in cursor.description]
                rows = [dict(zip(names, row)) for row in cursor.fetchall()]
        finally:
            pg.close()
    except Exception as exc:
        logger.warning(f"Program media lookup unavailable: {str(exc)}")
        return {'exact': {}, 'title': {}, 'global': {}}

    exact: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
    title: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
    global_title: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
    for row in rows:
        channel_id = str(row.get('channel_id') or '').strip()
        program_slug = str(row.get('slug') or slugify_for_url(str(row.get('title') or ''))).strip()
        if not program_slug:
            continue
        media = {
            'poster_url': row.get('poster_url'),
            'replay_url': row.get('replay_url'),
        }
        minute = normalize_media_lookup_time(row.get('start_time'))
        if channel_id:
            title.setdefault((channel_id, program_slug, ''), media)
            if minute:
                exact[(channel_id, program_slug, minute)] = media
        global_title.setdefault(('', program_slug, ''), media)

    logger.info(f"Program media lookup loaded: exact={len(exact)} title={len(title)} global={len(global_title)}")
    return {'exact': exact, 'title': title, 'global': global_title}


def attach_program_media_from_db(programs_data: List[Dict[str, Any]]) -> None:
    lookup = fetch_program_media_lookup()
    exact = lookup.get('exact') or {}
    title = lookup.get('title') or {}
    global_title = lookup.get('global') or {}
    attached = 0

    for program in programs_data:
        if program.get('poster_url') and program.get('replay_url'):
            continue
        channel_id = str(program.get('channel_id') or '').strip()
        canonical_channel = canonicalize_head_channel_slug(channel_id)
        program_slug = slugify_for_url(str(program.get('title') or ''))
        if not program_slug:
            continue
        minute = normalize_media_lookup_time(program.get('start'))
        media = (
            exact.get((channel_id, program_slug, minute))
            or exact.get((canonical_channel, program_slug, minute))
            or title.get((channel_id, program_slug, ''))
            or title.get((canonical_channel, program_slug, ''))
            or global_title.get(('', program_slug, ''))
        )
        if not media:
            continue
        if media.get('poster_url') and not program.get('poster_url'):
            program['poster_url'] = media.get('poster_url')
        if media.get('replay_url') and not program.get('replay_url'):
            program['replay_url'] = media.get('replay_url')
        attached += 1

    if attached:
        logger.info(f"Program media attached to XMLTV rows: {attached}")


def build_head_channel_sections(channel: Dict[str, Any], programs: List[Dict]) -> List[Dict]:
    channel_id = str(channel.get('channel_id') or '')
    channel_slug = canonicalize_head_channel_slug(channel_id)
    now = datetime.now(TIMEZONE)
    today = now.date().isoformat()
    tomorrow = (now.date() + timedelta(days=1)).isoformat()
    tonight_start = now.replace(hour=18, minute=0, second=0, microsecond=0)
    tonight_end = (tonight_start + timedelta(days=1)).replace(hour=2, minute=0, second=0, microsecond=0)

    normalized_rows: List[Dict[str, Any]] = []
    for program in programs:
        start = parse_program_datetime(program['start']).astimezone(TIMEZONE)
        end = parse_program_datetime(program['end']).astimezone(TIMEZONE)
        normalized_rows.append({
            'id': f"{channel_slug}-{start.isoformat()}-{slugify_for_url(program.get('title') or '')}",
            'channel_id': channel_id,
            'title': str(program.get('title') or ''),
            'description': str(program.get('description') or ''),
            'genre': str(program.get('category') or program.get('genre') or ''),
            'start_time': start.isoformat(),
            'end_time': end.isoformat(),
            'date': start.date().isoformat(),
            'url': build_channel_program_url(channel_slug, str(program.get('title') or '')),
            'poster_url': program.get('poster') or program.get('poster_url'),
            'replay_url': program.get('replay_url'),
            'channels': {
                'name': str(channel.get('name') or channel_slug),
                'logo_url': str(channel.get('logo_url') or ''),
                'channel_number': channel.get('channel_number'),
            },
        })

    normalized_rows.sort(key=lambda item: item['start_time'])

    def select_root_day_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        day_start = now.replace(hour=8, minute=0, second=0, microsecond=0)
        day_end = now.replace(hour=23, minute=59, second=59, microsecond=999999)
        visible_rows = [
            row for row in rows
            if parse_program_datetime(row['end_time']).astimezone(TIMEZONE) > day_start
            and parse_program_datetime(row['start_time']).astimezone(TIMEZONE) <= day_end
        ]
        return visible_rows or rows

    def section_payload(key: str, label: str, rows: List[Dict[str, Any]]) -> Dict[str, Any]:
        route_path = f'/{channel_slug}'
        sub_view = 'now'
        if key == 'maintenant':
            route_path = f'/en-direct/{channel_slug}'
            sub_view = 'now'
        elif key == 'ce-soir':
            route_path = f'/ce-soir/{channel_slug}'
            sub_view = 'tonight'
        elif key == 'demain':
            route_path = f'/demain/{channel_slug}'
            sub_view = 'tomorrow'
        payload_rows = select_root_day_rows(rows) if key == 'aujourdhui' else rows[:CHANNEL_HEAD_PROGRAM_LIMIT]
        return {
            'key': key,
            'label': label,
            'payload': {
                'routePath': route_path,
                'pageState': {
                    'type': 'channel',
                    'channelId': channel_id,
                    'subView': sub_view,
                    'channelViewMode': key,
                },
                'programs': payload_rows,
                'generatedAt': now.isoformat(),
            },
        }

    live_rows = [
        row for row in normalized_rows
        if parse_program_datetime(row['end_time']).astimezone(TIMEZONE) >= now
        and parse_program_datetime(row['start_time']).astimezone(TIMEZONE) <= (now + timedelta(hours=4))
    ]
    tonight_rows = [
        row for row in normalized_rows
        if tonight_start <= parse_program_datetime(row['start_time']).astimezone(TIMEZONE) <= tonight_end
    ]
    tomorrow_rows = [row for row in normalized_rows if row['date'] == tomorrow]
    today_rows = [row for row in normalized_rows if row['date'] == today]

    return [
        section_payload('aujourdhui', 'Aujourd’hui', today_rows),
        section_payload('maintenant', 'En direct', live_rows),
        section_payload('ce-soir', 'Ce soir', tonight_rows),
        section_payload('demain', 'Demain', tomorrow_rows),
    ]


def normalize_genre_for_match(value: Optional[str]) -> str:
    normalized = unicodedata.normalize('NFD', str(value or '').lower())
    normalized = ''.join(ch for ch in normalized if unicodedata.category(ch) != 'Mn')
    return re.sub(r'\s+', ' ', normalized).strip()


def matches_category_route(program: Dict[str, Any], route_path: str) -> bool:
    genres = CATEGORY_ROUTE_GENRES.get(route_path)
    if not genres:
        return True
    program_genre = normalize_genre_for_match(program.get('category') or program.get('genre'))
    if not program_genre:
        return False
    for genre in genres:
        normalized_genre = normalize_genre_for_match(genre)
        if not normalized_genre:
            continue
        if normalized_genre == program_genre or normalized_genre in program_genre:
            return True
    return False


def build_home_bootstrap_program_row(program: Dict[str, Any], channel: Dict[str, Any]) -> Dict[str, Any]:
    channel_id = str(channel.get('channel_id') or '')
    channel_name = str(channel.get('name') or channel_id)
    return {
        'id': f"{channel_id}-{program['start']}-{slugify_for_url(program.get('title') or '')}",
        'channel_id': channel_id,
        'title': str(program.get('title') or ''),
        'description': str(program.get('description') or ''),
        'start_time': parse_program_datetime(program['start']).astimezone(TIMEZONE).isoformat(),
        'end_time': parse_program_datetime(program['end']).astimezone(TIMEZONE).isoformat(),
        'genre': str(program.get('category') or program.get('genre') or ''),
        'url': build_channel_program_url(channel_id, str(program.get('title') or '')),
        'poster_url': program.get('poster') or program.get('poster_url'),
        'replay_url': program.get('replay_url'),
        'channels': {
            'name': channel_name,
            'logo_url': channel.get('logo_url'),
            'channel_number': get_effective_channel_number(channel.get('channel_number'), channel_id, channel_name),
        },
    }


def build_head_listing_bootstrap_payload(route_path: str, channels_data: List[Dict], programs_data: List[Dict]) -> Dict[str, Any]:
    now = datetime.now(TIMEZONE)
    live_start = now - timedelta(hours=2)
    live_end = now + timedelta(hours=4)
    tonight_start = now.replace(hour=18, minute=0, second=0, microsecond=0)
    tonight_end = (tonight_start + timedelta(days=1)).replace(hour=2, minute=0, second=0, microsecond=0)
    tomorrow_start = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow_end = tomorrow_start.replace(hour=23, minute=59, second=59, microsecond=999999)

    channels_by_id: Dict[str, Dict[str, Any]] = {}
    for channel in channels_data:
        channel_id = str(channel.get('channel_id') or '').strip()
        if not channel_id:
            continue
        channels_by_id[channel_id] = channel

    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for program in programs_data:
        channel_id = str(program.get('channel_id') or '').strip()
        if not channel_id or channel_id not in channels_by_id:
            continue
        try:
            start = parse_program_datetime(program['start']).astimezone(TIMEZONE)
            end = parse_program_datetime(program['end']).astimezone(TIMEZONE)
        except Exception:
            continue

        if route_path == '/en-direct':
            in_route = start < live_end and end > live_start
        elif route_path == '/demain':
            in_route = tomorrow_start <= start <= tomorrow_end
        else:
            in_route = tonight_start <= start <= tonight_end

        if not in_route:
            continue
        if route_path in CATEGORY_ROUTE_GENRES and not matches_category_route(program, route_path):
            continue
        grouped.setdefault(channel_id, []).append(program)

    def sort_channels(channel: Dict[str, Any]) -> Tuple[int, str]:
        channel_id = str(channel.get('channel_id') or '').strip()
        channel_name = str(channel.get('name') or '').strip()
        number = get_effective_channel_number(channel.get('channel_number'), channel_id, channel_name) or 9999
        return (number, str(channel.get('name') or '').lower())

    selected_programs: List[Dict[str, Any]] = []
    sorted_channels = sorted(
        (channels_by_id[channel_id] for channel_id in grouped.keys() if channel_id in channels_by_id),
        key=sort_channels,
    )[:HOME_BOOTSTRAP_CHANNEL_LIMIT]

    for channel in sorted_channels:
        channel_id = str(channel.get('channel_id') or '')
        items = sorted(
            grouped.get(channel_id, []),
            key=lambda row: parse_program_datetime(row['start']).astimezone(TIMEZONE),
        )[:HOME_BOOTSTRAP_PROGRAMS_PER_CHANNEL]
        for item in items:
            selected_programs.append(build_home_bootstrap_program_row(item, channel))

    category = None
    if route_path in CATEGORY_PAGE_CONFIGS:
        category = CATEGORY_PAGE_CONFIGS[route_path]['label']
        if category == 'Séries':
            category = 'Series'
        elif category == 'Divertissements':
            category = 'Divertissement'

    return {
        'routePath': route_path,
        'pageState': {'type': 'home', **({'category': category} if category else {})},
        'viewMode': 'now' if route_path == '/en-direct' else 'tomorrow' if route_path == '/demain' else 'tonight',
        'filter': category or 'Tous',
        'programs': selected_programs,
        'generatedAt': now.isoformat(),
    }


def get_head_listing_graph_metadata(route_path: str) -> Tuple[str, str, str]:
    if route_path in CATEGORY_PAGE_CONFIGS:
        config = CATEGORY_PAGE_CONFIGS[route_path]
        return config['title'], config['description'], config['label']
    if route_path == '/en-direct':
        return (
            'Programme TNT en direct',
            'Liste des programmes TNT actuellement diffusés ou imminents.',
            'Programme TV en direct',
        )
    if route_path == '/demain':
        return (
            'Programme TNT de demain',
            'Liste des programmes TNT diffusés demain sur les chaînes françaises.',
            'Programme TV de demain',
        )
    return (
        'Programme TNT ce soir',
        'Liste des programmes TNT diffusés ce soir sur les chaînes françaises.',
        'Programme TV ce soir',
    )


def build_head_listing_jsonld(route_path: str, bootstrap_payload: Dict[str, Any]) -> List[str]:
    programs = list(bootstrap_payload.get('programs') or [])
    if not programs:
        return []

    canonical_url = f"{SITEMAP_DOMAIN}{'' if route_path == '/' else route_path}"
    organization_ref = {'@id': f'{SITEMAP_DOMAIN}/#organization'}
    name, description, about = get_head_listing_graph_metadata(route_path)
    graphs: List[Dict[str, Any]] = [
        {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            '@id': f'{canonical_url}#collectionpage',
            'name': name,
            'description': description,
            'url': canonical_url,
            'inLanguage': 'fr-FR',
            'mainEntity': {'@id': f'{canonical_url}#program-list'},
            'author': organization_ref,
            'publisher': organization_ref,
            'about': {'@type': 'Thing', 'name': about},
        }
    ]

    unique_programs: List[Dict[str, Any]] = []
    seen_urls: set[str] = set()
    for program in programs:
        url = str(program.get('url') or '').strip()
        if not url or url in seen_urls:
            continue
        seen_urls.add(url)
        unique_programs.append(program)

    item_list_element: List[Dict[str, Any]] = []
    for index, program in enumerate(unique_programs[:HEAD_LISTING_GRAPH_LIMIT], start=1):
        full_url = f"{SITEMAP_DOMAIN}{program['url']}"
        work_id = f'{full_url}#program'
        broadcast_id = f'{full_url}#broadcast'
        channel_name = str(((program.get('channels') or {}).get('name')) or program.get('channel_id') or '')
        channel_url = f"{SITEMAP_DOMAIN}/{str(program.get('channel_id') or '').strip()}"
        program_description = str(program.get('description') or f"{program.get('title')} sur {channel_name}").strip()
        item_list_element.append({
            '@type': 'ListItem',
            'position': index,
            'item': {'@id': broadcast_id},
        })
        graphs.append({
            '@context': 'https://schema.org',
            '@type': infer_program_kind(str(program.get('genre') or '')),
            '@id': work_id,
            'name': str(program.get('title') or ''),
            'description': program_description,
            'url': full_url,
            'inLanguage': 'fr-FR',
            'genre': str(program.get('genre') or ''),
            'author': organization_ref,
            'publisher': organization_ref,
            **({'image': to_absolute_url(program.get('poster_url') or (program.get('channels') or {}).get('logo_url') or DEFAULT_OG_IMAGE_URL)} if (program.get('poster_url') or (program.get('channels') or {}).get('logo_url')) else {}),
        })
        graphs.append({
            '@context': 'https://schema.org',
            '@type': 'BroadcastEvent',
            '@id': broadcast_id,
            'name': f"{str(program.get('title') or '')} sur {channel_name}",
            'description': program_description,
            'startDate': str(program.get('start_time') or ''),
            'endDate': str(program.get('end_time') or ''),
            'url': full_url,
            'inLanguage': 'fr-FR',
            'author': organization_ref,
            'publisher': organization_ref,
            'publishedOn': {
                '@type': 'BroadcastService',
                'name': channel_name,
                'url': channel_url,
                'broadcastDisplayName': channel_name,
                'broadcastTimezone': 'Europe/Paris',
            },
            'workPerformed': {'@id': work_id},
        })

    if item_list_element:
        graphs.append({
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            '@id': f'{canonical_url}#program-list',
            'name': name,
            'description': description,
            'numberOfItems': len(item_list_element),
            'itemListElement': item_list_element,
        })

    return [f'<script type="application/ld+json" data-seo="listing">{escape_json_for_html(graph)}</script>' for graph in graphs]


def build_head_listing_fallback_html(route_path: str, bootstrap_payload: Dict[str, Any]) -> str:
    config = HOME_PAGE_CONFIGS.get(route_path) or CATEGORY_PAGE_CONFIGS.get(route_path) or {}
    heading = config.get('heading') or config.get('title') or 'Programme TV'
    description = config.get('description') or ''
    programs = list(bootstrap_payload.get('programs') or [])

    if not programs:
        listing_html = '<p style="margin:16px 0 0;">Aucun programme trouvé pour cette vue.</p>'
    else:
        listing_html = (
            '<ul style="margin:0;padding-left:18px;">'
            + ''.join(
                f'<li><a href="{escape_html(str(program.get("url") or "/"))}">{escape_html(str(program.get("title") or "Programme TV"))}</a>'
                f' - {escape_html(format_fr_datetime(str(program.get("start_time") or "")))}'
                + (f' - {escape_html(str(program.get("genre") or ""))}' if program.get('genre') else '')
                + '</li>'
                for program in programs[:24]
            )
            + '</ul>'
        )

    head_channel_links = ''.join(
        f'<li><a href="/{escape_html(slug)}">{escape_html(label)}</a></li>'
        for slug, label in HEAD_CHANNEL_SEO_LINKS
    )

    return (
        f'<h1 style="font-size:2rem;line-height:1.2;margin:0 0 12px;">{escape_html(heading)}</h1>'
        f'<p style="margin:0 0 16px;">{escape_html(description)}</p>'
        '<ul style="margin:0;padding-left:18px;">'
        '<li><a href="/en-direct">Programme TNT en direct</a></li>'
        '<li><a href="/film-ce-soir">Films ce soir</a></li>'
        '<li><a href="/sport-ce-soir">Sport ce soir</a></li>'
        '<li><a href="/demain">Programme TNT demain</a></li>'
        '<li><a href="/">Programme TV TNT ce soir</a></li>'
        '<li><a href="/series-ce-soir">Séries ce soir</a></li>'
        '</ul>'
        '<h2 style="font-size:1.3rem;margin:24px 0 12px;">Grandes chaînes TNT</h2>'
        f'<ul style="margin:0;padding-left:18px;">{head_channel_links}</ul>'
        f'<h2 style="font-size:1.3rem;margin:24px 0 12px;">Sélection du moment</h2>{listing_html}'
    )


def inject_head_listing_html(template: str, route_path: str, bootstrap_payload: Dict[str, Any]) -> str:
    config = HOME_PAGE_CONFIGS.get(route_path) or CATEGORY_PAGE_CONFIGS.get(route_path) or {}
    title = str(config.get('title') or 'Programme TV - Programme Ce Soir')
    description = str(config.get('description') or '')
    canonical_url = f"{SITEMAP_DOMAIN}{'' if route_path == '/' else route_path}"
    fallback_html = build_head_listing_fallback_html(route_path, bootstrap_payload)
    jsonld_scripts = build_head_listing_jsonld(route_path, bootstrap_payload)

    html = strip_existing_head_tags(template)
    html = replace_single_tag(html, r'<title>[\s\S]*?</title>', f'<title>{escape_html(title)}</title>')
    html = replace_single_tag(html, r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{escape_html(description)}">')
    html = replace_single_tag(html, r'<meta name="robots" content="[^"]*">', '<meta name="robots" content="index,follow">')
    html = replace_single_block(
        html,
        r'<main id="crawler-fallback"[\s\S]*?</main>',
        f'<main id="crawler-fallback" style="max-width:1200px;margin:0 auto;padding:24px;font-family:Inter,Arial,sans-serif;">{fallback_html}</main>',
    )

    extra_head = '\n  '.join(jsonld_scripts + [
        f'<link rel="canonical" href="{escape_html(canonical_url)}">',
        '<meta name="author" content="Programme Ce Soir">',
        '<meta name="publisher" content="Programme Ce Soir">',
        '<meta property="og:type" content="website">',
        '<meta property="og:locale" content="fr_FR">',
        '<meta property="og:site_name" content="Programme Ce Soir">',
        f'<meta property="og:title" content="{escape_html(title)}">',
        f'<meta property="og:description" content="{escape_html(description)}">',
        f'<meta property="og:url" content="{escape_html(canonical_url)}">',
        f'<meta property="og:image" content="{escape_html(DEFAULT_OG_IMAGE_URL)}">',
        '<meta name="twitter:card" content="summary_large_image">',
        f'<meta name="twitter:title" content="{escape_html(title)}">',
        f'<meta name="twitter:description" content="{escape_html(description)}">',
        f'<meta name="twitter:image" content="{escape_html(DEFAULT_OG_IMAGE_URL)}">',
        f'<script id="app-bootstrap-data" type="application/json">{escape_json_for_html(bootstrap_payload)}</script>',
    ])
    html = html.replace('</head>', f'  {extra_head}\n</head>')
    return html


def build_channel_fallback_html(channel: Dict[str, Any], description: str, sections: List[Dict[str, Any]]) -> str:
    public_channel_slug = canonicalize_head_channel_slug(str(channel.get("channel_id") or ""))
    active = next((section for section in sections if section['key'] == 'ce-soir' and section['payload']['programs']), None)
    if active is None:
        active = next((section for section in sections if section['payload']['programs']), sections[0])

    live_program = next((section['payload']['programs'][0] for section in sections if section['key'] == 'maintenant' and section['payload']['programs']), None)
    tonight_program = next((section['payload']['programs'][0] for section in sections if section['key'] == 'ce-soir' and section['payload']['programs']), None)
    tomorrow_program = next((section['payload']['programs'][0] for section in sections if section['key'] == 'demain' and section['payload']['programs']), None)

    def highlight(label: str, program: Optional[Dict[str, Any]]) -> str:
        if not program:
            return ''
        return (
            f'<li><strong>{escape_html(label)} :</strong> '
            f'<a href="{escape_html(program["url"])}">{escape_html(program["title"])}</a> - '
            f'{escape_html(format_fr_datetime(program["start_time"]))}</li>'
        )

    top_programs = active['payload']['programs'][:CHANNEL_HEAD_PROGRAM_LIMIT]
    if top_programs:
        listing_html = (
            f'<h2 style="font-size:1.3rem;margin:24px 0 12px;">Grille {escape_html(active["label"])}</h2>'
            '<ul style="margin:0;padding-left:18px;">'
            + ''.join(
                f'<li><a href="{escape_html(program["url"])}">{escape_html(program["title"])}</a>'
                f' - {escape_html(format_fr_datetime(program["start_time"]))}'
                + (f' - {escape_html(program["genre"])}' if program.get('genre') else '')
                + '</li>'
                for program in top_programs
            )
            + '</ul>'
        )
    else:
        listing_html = '<p style="margin:16px 0 0;">Le détail du programme sera chargé après hydration si aucun snapshot n’est disponible.</p>'

    quick_refs = ''.join([
        highlight('En direct', live_program),
        highlight('Ce soir', tonight_program),
        highlight('Demain', tomorrow_program),
    ])

    head_channel_links = ''.join(
        f'<li><a href="/{escape_html(slug)}">{escape_html(label)}</a></li>'
        for slug, label in HEAD_CHANNEL_SEO_LINKS
        if slug != public_channel_slug
    )

    return (
        f'<h1 style="font-size:2rem;line-height:1.2;margin:0 0 12px;">Programme TV {escape_html(channel["name"])} ce soir</h1>'
        f'<p style="margin:0 0 16px;">{escape_html(description)}</p>'
        '<ul style="margin:0;padding-left:18px;">'
        '<li><a href="/en-direct">Programme TNT en direct</a></li>'
        '<li><a href="/film-ce-soir">Films ce soir</a></li>'
        '<li><a href="/sport-ce-soir">Sport ce soir</a></li>'
        '<li><a href="/demain">Programme TV demain</a></li>'
        f'<li><a href="/{escape_html(public_channel_slug)}">Programme TV {escape_html(channel["name"])} aujourd’hui</a></li>'
        f'<li><a href="/en-direct/{escape_html(public_channel_slug)}">Programme {escape_html(channel["name"])} en direct</a></li>'
        f'<li><a href="/ce-soir/{escape_html(public_channel_slug)}">Programme {escape_html(channel["name"])} ce soir</a></li>'
        f'<li><a href="/demain/{escape_html(public_channel_slug)}">Programme {escape_html(channel["name"])} demain</a></li>'
        '<li><a href="/">Programme TV TNT ce soir</a></li>'
        '<li><a href="/series-ce-soir">Séries ce soir</a></li>'
        '</ul>'
        '<h2 style="font-size:1.3rem;margin:24px 0 12px;">Autres chaînes prioritaires</h2>'
        f'<ul style="margin:0;padding-left:18px;">{head_channel_links}</ul>'
        + (
            f'<h2 style="font-size:1.3rem;margin:24px 0 12px;">Repères rapides</h2>'
            f'<ul style="margin:0;padding-left:18px;">{quick_refs}</ul>'
            if quick_refs else ''
        )
        + listing_html
    )


def choose_primary_program_airing(rows: List[Dict[str, Any]], now: datetime) -> Dict[str, Any]:
    def sort_key(row: Dict[str, Any]) -> Tuple[int, datetime]:
        start = parse_program_datetime(row['start_time']).astimezone(TIMEZONE)
        end = parse_program_datetime(row['end_time']).astimezone(TIMEZONE)
        if start <= now <= end:
            return (0, start)
        if start >= now:
            return (1, start)
        return (2, end)

    return sorted(rows, key=sort_key)[0]


def infer_program_kind(genre: str) -> str:
    normalized = (genre or '').lower()
    if any(token in normalized for token in ('film', 'cinema', 'cinéma', 'telefilm')):
        return 'Movie'
    if any(token in normalized for token in ('serie', 'série', 'fiction', 'sitcom', 'soap')):
        return 'TVEpisode'
    return 'TVSeries'


def extract_series_info(title: str) -> Dict[str, Optional[str]]:
    source = str(title or '').strip()
    season_match = re.search(r'(?:st\.?|saison|season)\s*(\d+)', source, re.IGNORECASE)
    episode_match = re.search(r'(?:ep\.?|episode|épisode)\s*(\d+)', source, re.IGNORECASE)
    series_name = re.sub(r'\([^)]*(st\.?|saison|season|ep\.?|episode|épisode)[^)]*\)', '', source, flags=re.IGNORECASE)
    series_name = re.sub(r'\b(st\.?|saison|season)\s*\d+.*$', '', series_name, flags=re.IGNORECASE)
    series_name = re.sub(r'\b(ep\.?|episode|épisode)\s*\d+.*$', '', series_name, flags=re.IGNORECASE)
    series_name = series_name.strip() or source
    return {
        'seriesName': series_name,
        'seasonNumber': season_match.group(1) if season_match else None,
        'episodeNumber': episode_match.group(1) if episode_match else None,
    }


def get_program_category_insights(raw_category: str) -> Tuple[str, List[str]]:
    category = unicodedata.normalize('NFD', str(raw_category or '').lower())
    category = ''.join(ch for ch in category if unicodedata.category(ch) != 'Mn')
    if any(token in category for token in ('film', 'cinema', 'telefilm')):
        return (
            'Les films en prime time fonctionnent bien quand vous cherchez une histoire complète sur un seul créneau.',
            ['/film-ce-soir', '/series-ce-soir', '/documentaires-ce-soir'],
        )
    if any(token in category for token in ('serie', 'fiction', 'sitcom', 'soap')):
        return (
            'Les séries conviennent si vous suivez des personnages récurrents et une intrigue continue.',
            ['/series-ce-soir', '/film-ce-soir', '/divertissement-ce-soir'],
        )
    if any(token in category for token in ('sport',)):
        return (
            'Les programmes sportifs sont particulièrement pertinents en direct, car le rythme et le score évoluent en permanence.',
            ['/sport-ce-soir', '/en-direct', '/documentaires-ce-soir'],
        )
    if any(token in category for token in ('info', 'journal', 'actualite', 'actualites', 'news')):
        return (
            'Les rendez-vous d’actualité permettent de garder rapidement le contexte sur les sujets du jour.',
            ['/en-direct', '/documentaires-ce-soir', '/culture-ce-soir'],
        )
    if any(token in category for token in ('documentaire', 'decouverte')):
        return (
            'Les documentaires apportent de la profondeur et du contexte sur des sujets de fond.',
            ['/documentaires-ce-soir', '/culture-ce-soir', '/film-ce-soir'],
        )
    return (
        'Ce format est adapté pour organiser votre soirée TV sur un horaire clair et une durée connue.',
        ['/film-ce-soir', '/series-ce-soir', '/'],
    )


def normalize_lookup_key(value: Optional[str]) -> str:
    return slugify_for_url(str(value or ''))


def resolve_tv_stream_key(candidate: Optional[str]) -> Optional[str]:
    normalized = normalize_lookup_key(candidate)
    if not normalized:
        return None
    if normalized in TV_STREAM_ALIASES:
        return TV_STREAM_ALIASES[normalized]
    if normalized.startswith('france-3-'):
        return 'france-3'
    return None


def get_tv_stream(channel_id: Optional[str], channel_name: Optional[str]) -> Optional[Dict[str, str]]:
    for candidate in (channel_id, channel_name):
        resolved = resolve_tv_stream_key(candidate)
        if resolved and resolved in TV_STREAMS:
            return TV_STREAMS[resolved]
    return None


def extract_program_keywords(*values: Optional[str]) -> List[str]:
    tokens: List[str] = []
    for value in values:
        normalized = normalize_lookup_key(value)
        if not normalized:
            continue
        for token in normalized.split('-'):
            if len(token) < 4 or token in PROGRAM_TITLE_STOPWORDS:
                continue
            if token not in tokens:
                tokens.append(token)
    return tokens[:6]


def infer_program_entity_candidates(primary: Dict[str, Any]) -> List[str]:
    genre = normalize_lookup_key(primary.get('genre'))
    if any(token in genre for token in ('film', 'cinema', 'telefilm')):
        return ['films']
    if any(token in genre for token in ('serie', 'fiction', 'sitcom', 'soap')):
        return ['series']
    return ['films', 'series']


@lru_cache(maxsize=1)
def load_entity_index_maps() -> Dict[str, Dict[str, Dict[str, Any]]]:
    public_dir = get_public_dir()
    mappings: Dict[str, Dict[str, Dict[str, Any]]] = {'films': {}, 'series': {}}
    for entity_type, rel_path in (
        ('films', os.path.join('entities-data', 'indexes', 'films.json')),
        ('series', os.path.join('entities-data', 'indexes', 'series.json')),
    ):
        path = os.path.join(public_dir, rel_path)
        if not os.path.exists(path):
            continue
        try:
            with open(path, 'r', encoding='utf-8') as f:
                payload = json.load(f)
        except Exception as e:
            logger.warning(f"Failed to read entity index {path}: {str(e)}")
            continue
        for item in payload.get('items', []):
            title = str(item.get('title') or '').strip()
            slug = str(item.get('slug') or '').strip()
            if title:
                mappings[entity_type][normalize_lookup_key(title)] = item
            if slug:
                mappings[entity_type][normalize_lookup_key(slug)] = item
    return mappings


@lru_cache(maxsize=4096)
def load_entity_payload(entity_type: str, slug: str) -> Optional[Dict[str, Any]]:
    public_dir = get_public_dir()
    path = os.path.join(public_dir, 'entities-data', entity_type, f'{slug}.json')
    if not os.path.exists(path):
        return None
    try:
        with open(path, 'r', encoding='utf-8') as f:
            payload = json.load(f)
        if isinstance(payload, dict):
            return payload
    except Exception as e:
        logger.warning(f"Failed to read entity payload {path}: {str(e)}")
    return None


def find_program_linked_entity(primary: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    title_key = normalize_lookup_key(primary.get('title'))
    if not title_key:
        return None
    index_maps = load_entity_index_maps()
    for entity_type in infer_program_entity_candidates(primary):
        item = index_maps.get(entity_type, {}).get(title_key)
        if not item:
            continue
        payload = load_entity_payload(entity_type, str(item.get('slug') or ''))
        return {
            'type': entity_type,
            'item': item,
            'payload': payload,
        }
    return None


@lru_cache(maxsize=1)
def load_current_birthday_payload() -> Optional[Dict[str, Any]]:
    public_dir = get_public_dir()
    current_file = os.path.join(public_dir, 'birthday-data', 'current.json')
    if not os.path.exists(current_file):
        return None
    try:
        with open(current_file, 'r', encoding='utf-8') as f:
            payload = json.load(f)
        if isinstance(payload, dict) and payload.get('ok') is True:
            return payload
    except Exception as e:
        logger.warning(f"Failed to read birthday current.json for program page context: {str(e)}")
    return None


def build_related_program_suggestions(
    primary: Dict[str, Any],
    channel: Dict[str, Any],
    sorted_rows: List[Dict[str, Any]],
    sorted_start_times: List[float],
) -> List[Dict[str, Any]]:
    primary_start = parse_program_datetime(primary['start_time']).astimezone(TIMEZONE)
    primary_end = parse_program_datetime(primary['end_time']).astimezone(TIMEZONE)
    lower_bound = (primary_start - timedelta(minutes=PROGRAM_RELATED_WINDOW_BEFORE_MINUTES)).timestamp()
    upper_bound = (primary_end + timedelta(minutes=PROGRAM_RELATED_WINDOW_AFTER_MINUTES)).timestamp()
    left = bisect_left(sorted_start_times, lower_bound)
    right = bisect_right(sorted_start_times, upper_bound)
    current_category = normalize_lookup_key(primary.get('genre'))
    title_keywords = extract_program_keywords(primary.get('title'), primary.get('description'))
    scored: List[Dict[str, Any]] = []

    for row in sorted_rows[left:right]:
        if row.get('channel_id') == channel.get('channel_id'):
            continue
        if normalize_lookup_key(row.get('title')) == normalize_lookup_key(primary.get('title')):
            continue
        candidate_start = parse_program_datetime(row['start_time']).astimezone(TIMEZONE)
        candidate_end = parse_program_datetime(row['end_time']).astimezone(TIMEZONE)
        overlap = candidate_start < primary_end and candidate_end > primary_start
        time_distance = min(
            abs((candidate_start - primary_start).total_seconds()),
            abs((candidate_end - primary_end).total_seconds()),
        )
        candidate_category = normalize_lookup_key(row.get('genre'))
        candidate_text = normalize_lookup_key(f"{row.get('title') or ''} {row.get('description') or ''}")

        score = 0
        if overlap:
            score += 4
        if time_distance <= 90 * 60:
            score += 2
        if current_category and candidate_category and (
            current_category in candidate_category or candidate_category in current_category
        ):
            score += 4
        for keyword in title_keywords:
            if keyword and keyword in candidate_text:
                score += 1

        if score < 5:
            continue

        scored.append({
            'score': score,
            'channel_id': row.get('channel_id'),
            'channel_name': row.get('channel_name'),
            'channel_logo': row.get('channel_logo'),
            'title': row.get('title'),
            'genre': row.get('genre'),
            'url': row.get('url'),
            'start_time': row.get('start_time'),
        })

    scored.sort(key=lambda item: (-int(item['score']), str(item.get('start_time') or '')))
    unique_results: List[Dict[str, Any]] = []
    seen_channels: set[str] = set()
    for item in scored:
        channel_id = str(item.get('channel_id') or '')
        if not channel_id or channel_id in seen_channels:
            continue
        seen_channels.add(channel_id)
        unique_results.append(item)
        if len(unique_results) >= PROGRAM_RELATED_SUGGESTION_LIMIT:
            break
    return unique_results


def build_program_editorial_paragraphs(channel: Dict[str, Any], primary: Dict[str, Any], airings: List[Dict[str, Any]]) -> List[str]:
    start = parse_program_datetime(primary['start_time']).astimezone(TIMEZONE)
    end = parse_program_datetime(primary['end_time']).astimezone(TIMEZONE)
    duration_minutes = max(1, int(round((end - start).total_seconds() / 60)))
    watch_reason, related_paths = get_program_category_insights(str(primary.get('genre') or ''))
    follow_up = airings[1] if len(airings) > 1 else None
    first = (
        f"{primary['title']} est programmé sur {channel['name']} le {format_fr_datetime(primary['start_time'])} "
        f"pour environ {duration_minutes} minutes. {watch_reason}"
    )
    if follow_up:
        second = (
            f"Après cette diffusion, {channel['name']} propose encore {follow_up['title']} à "
            f"{parse_program_datetime(follow_up['start_time']).astimezone(TIMEZONE).strftime('%H:%M')}. "
            f"Vous pouvez aussi poursuivre l’exploration via {', '.join(path.replace('-', ' ').strip('/') for path in related_paths[:2])}."
        )
    else:
        second = (
            f"Si vous hésitez encore, la grille de {channel['name']} et les sélections thématiques du site "
            f"permettent de comparer rapidement les options du moment."
        )
    return [first, second]


def build_program_faq_items(channel: Dict[str, Any], primary: Dict[str, Any], airings: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    start = parse_program_datetime(primary['start_time']).astimezone(TIMEZONE)
    end = parse_program_datetime(primary['end_time']).astimezone(TIMEZONE)
    channel_number = channel.get('channel_number')
    return [
        {
            'question': f"À quelle heure passe {primary['title']} ?",
            'answer': f"{primary['title']} est diffusé le {format_fr_datetime(primary['start_time'])} de {start.strftime('%H:%M')} à {end.strftime('%H:%M')} sur {channel['name']}.",
        },
        {
            'question': f"Sur quelle chaîne regarder {primary['title']} ?",
            'answer': (
                f"Le programme est diffusé sur {channel['name']}."
                + (f" Vous le retrouvez sur la chaîne {channel_number}." if channel_number else '')
            ),
        },
        {
            'question': "Y a-t-il d’autres diffusions prévues ?",
            'answer': (
                f"Oui, cette fiche récapitule {min(len(airings), PROGRAM_SHARE_SNAPSHOT_AIRING_LIMIT)} diffusion(s) connues pour ce programme."
                if airings else
                "Aucune autre diffusion n’est actuellement remontée dans la grille."
            ),
        },
    ]


def build_program_faq_jsonld(canonical_url: str, faq_items: List[Dict[str, str]]) -> str:
    payload = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        '@id': f'{canonical_url}#faq',
        'mainEntityOfPage': canonical_url,
        'author': {'@id': f'{SITEMAP_DOMAIN}/#organization'},
        'publisher': {'@id': f'{SITEMAP_DOMAIN}/#organization'},
        'mainEntity': [
            {
                '@type': 'Question',
                'name': item['question'],
                'acceptedAnswer': {
                    '@type': 'Answer',
                    'text': item['answer'],
                },
            }
            for item in faq_items
        ],
    }
    return f'<script type="application/ld+json" data-seo="program-faq">{escape_json_for_html(payload)}</script>'


def build_program_fallback_styles() -> str:
    return """
<style data-seo="program-fallback">
  #crawler-fallback { color: #0f172a; }
  .pcs-program-shell {
    max-width: 1120px;
    margin: 0 auto;
    color: #0f172a;
  }
  .pcs-program-topbar {
    display: grid;
    gap: 16px;
    margin: 0 0 24px;
    padding: 18px 22px;
    border: 1px solid #d9e4f5;
    border-radius: 24px;
    background: linear-gradient(135deg, #ffffff 0%, #f3f8ff 100%);
    box-shadow: 0 16px 32px rgba(15, 23, 42, 0.08);
  }
  .pcs-program-topbar-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }
  .pcs-program-brand {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    color: #0f172a;
    text-decoration: none;
    font-weight: 800;
    letter-spacing: -0.02em;
    min-width: 0;
    flex: 1 1 280px;
  }
  .pcs-program-brand-mark {
    width: 52px;
    height: 52px;
    border-radius: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%);
    color: #fff;
    font-size: 1.1rem;
    box-shadow: 0 10px 24px rgba(37, 99, 235, 0.28);
    overflow: hidden;
    flex: 0 0 52px;
  }
  .pcs-program-brand-mark img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .pcs-program-brand-copy {
    display: flex;
    flex-direction: column;
    line-height: 1;
    min-width: 0;
  }
  .pcs-program-brand-kicker {
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: #2563eb;
    margin-bottom: 6px;
  }
  .pcs-program-brand-title {
    font-size: 1.45rem;
    white-space: nowrap;
  }
  .pcs-program-toplinks {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: flex-end;
    flex: 0 1 auto;
  }
  .pcs-program-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 44px;
    padding: 0 18px;
    border-radius: 999px;
    border: 1px solid #c7d7ef;
    color: #244466;
    text-decoration: none;
    font-weight: 700;
    background: rgba(255, 255, 255, 0.9);
  }
  .pcs-program-link-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.05rem;
    font-size: 0.88rem;
    line-height: 1;
    font-weight: 900;
  }
  .pcs-program-link-label--mobile {
    display: none;
  }
  .pcs-program-menu {
    display: flex;
    flex-wrap: nowrap;
    gap: 10px;
    overflow-x: auto;
    padding-bottom: 2px;
    scrollbar-width: none;
  }
  .pcs-program-menu::-webkit-scrollbar {
    display: none;
  }
  .pcs-program-menu-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 38px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid #d8e3f5;
    background: #ffffff;
    color: #475569;
    text-decoration: none;
    font-size: 0.92rem;
    font-weight: 700;
    white-space: nowrap;
    box-shadow: 0 6px 14px rgba(15, 23, 42, 0.04);
  }
  .pcs-program-link--primary {
    background: #101c3a;
    color: #fff;
    border-color: #101c3a;
  }
  .pcs-program-hero {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(260px, 0.65fr);
    gap: 24px;
    align-items: stretch;
    padding: 34px;
    border-radius: 34px;
    background:
      radial-gradient(circle at top right, rgba(59, 130, 246, 0.2), transparent 32%),
      linear-gradient(135deg, #0f1e42 0%, #1f3171 58%, #2641a3 100%);
    box-shadow: 0 28px 50px rgba(15, 23, 42, 0.18);
    color: #fff;
  }
  .pcs-program-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin: 0 0 18px;
  }
  .pcs-program-badge {
    display: inline-flex;
    align-items: center;
    min-height: 34px;
    padding: 0 14px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.14);
    border: 1px solid rgba(255, 255, 255, 0.16);
    color: rgba(255, 255, 255, 0.96);
    font-size: 0.88rem;
    font-weight: 700;
    letter-spacing: 0.03em;
  }
  .pcs-program-title {
    margin: 0 0 16px;
    color: #fff;
    font-size: clamp(2.1rem, 3vw, 3.5rem);
    line-height: 0.96;
    letter-spacing: -0.05em;
  }
  .pcs-program-description {
    margin: 0 0 24px;
    max-width: 780px;
    color: rgba(255, 255, 255, 0.88);
    font-size: 1.12rem;
    line-height: 1.7;
  }
  .pcs-program-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    margin: 0 0 22px;
  }
  .pcs-program-stat {
    padding: 16px 18px;
    border-radius: 22px;
    background: rgba(255, 255, 255, 0.11);
    border: 1px solid rgba(255, 255, 255, 0.15);
  }
  .pcs-program-stat-label {
    margin: 0 0 8px;
    color: rgba(255, 255, 255, 0.72);
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .pcs-program-stat-value {
    margin: 0;
    color: #fff;
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.45;
  }
  .pcs-program-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
  .pcs-program-visual {
    display: flex;
    align-items: stretch;
  }
  .pcs-program-visual-card {
    position: relative;
    width: 100%;
    min-height: 100%;
    border-radius: 28px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.12);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.12);
  }
  .pcs-program-visual-card img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    background: #fff;
  }
  .pcs-program-visual-overlay {
    position: absolute;
    inset: auto 16px 16px 16px;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px;
    border-radius: 18px;
    background: rgba(9, 17, 38, 0.78);
    backdrop-filter: blur(8px);
  }
  .pcs-program-channel-logo {
    flex: 0 0 64px;
    width: 64px;
    height: 64px;
    border-radius: 20px;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .pcs-program-channel-logo img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    padding: 10px;
  }
  .pcs-program-visual-copy {
    min-width: 0;
  }
  .pcs-program-visual-kicker {
    margin: 0 0 6px;
    color: rgba(255, 255, 255, 0.72);
    font-size: 0.76rem;
    text-transform: uppercase;
    letter-spacing: 0.14em;
  }
  .pcs-program-visual-title {
    margin: 0;
    color: #fff;
    font-size: 1.05rem;
    font-weight: 800;
    line-height: 1.25;
  }
  .pcs-program-section {
    margin: 28px 0 0;
    padding: 26px;
    border-radius: 30px;
    border: 1px solid #d9e4f5;
    background: #fff;
    box-shadow: 0 18px 34px rgba(15, 23, 42, 0.08);
  }
  .pcs-program-section-title {
    margin: 0 0 8px;
    color: #0f172a;
    font-size: 1.55rem;
    line-height: 1.1;
    letter-spacing: -0.04em;
  }
  .pcs-program-section-copy {
    margin: 0 0 18px;
    color: #52637d;
    line-height: 1.65;
  }
  .pcs-program-richtext {
    display: grid;
    gap: 16px;
    margin: 0 0 18px;
  }
  .pcs-program-richtext p {
    margin: 0;
    color: #334155;
    line-height: 1.8;
    font-size: 1.03rem;
  }
  .pcs-program-explore {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin: 18px 0 0;
  }
  .pcs-program-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 38px;
    padding: 0 14px;
    border-radius: 999px;
    background: #eff6ff;
    border: 1px solid #c7dcff;
    color: #1d4ed8;
    text-decoration: none;
    font-weight: 700;
    font-size: 0.92rem;
  }
  .pcs-program-airings {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }
  .pcs-program-airing {
    padding: 18px;
    border-radius: 22px;
    border: 1px solid #d8e3f5;
    background: linear-gradient(180deg, #fbfdff 0%, #f3f8ff 100%);
  }
  .pcs-program-airing-eyebrow {
    margin: 0 0 10px;
    color: #2563eb;
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .pcs-program-airing-time {
    margin: 0 0 8px;
    color: #0f172a;
    font-size: 1.05rem;
    font-weight: 800;
    line-height: 1.35;
  }
  .pcs-program-airing-meta {
    margin: 0;
    color: #5d6d86;
    line-height: 1.6;
  }
  .pcs-program-airing-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 14px;
  }
  .pcs-program-bottomlinks {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin: 18px 0 0;
  }
  .pcs-program-faq {
    display: grid;
    gap: 14px;
  }
  .pcs-program-faq-item {
    padding: 18px;
    border-radius: 22px;
    border: 1px solid #d8e3f5;
    background: #f8fbff;
  }
  .pcs-program-faq-question {
    margin: 0 0 8px;
    color: #0f172a;
    font-size: 1rem;
    font-weight: 800;
    line-height: 1.4;
  }
  .pcs-program-faq-answer {
    margin: 0;
    color: #55657d;
    line-height: 1.7;
  }
  .pcs-program-context-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
  .pcs-program-context-card {
    padding: 18px;
    border-radius: 22px;
    border: 1px solid #d8e3f5;
    background: linear-gradient(180deg, #fbfdff 0%, #f3f8ff 100%);
  }
  .pcs-program-context-kicker {
    margin: 0 0 10px;
    color: #64748b;
    font-size: 0.76rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .pcs-program-context-title {
    margin: 0 0 8px;
    color: #0f172a;
    font-size: 1.05rem;
    font-weight: 800;
    line-height: 1.35;
  }
  .pcs-program-context-copy {
    margin: 0;
    color: #52637d;
    line-height: 1.65;
  }
  .pcs-program-context-links {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 14px;
  }
  .pcs-program-cast-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .pcs-program-cast-link {
    display: block;
    padding: 14px 16px;
    border-radius: 18px;
    border: 1px solid #d8e3f5;
    background: #f8fbff;
    text-decoration: none;
  }
  .pcs-program-cast-link strong {
    display: block;
    color: #0f172a;
    font-size: 0.95rem;
    margin-bottom: 4px;
  }
  .pcs-program-cast-link span {
    display: block;
    color: #64748b;
    font-size: 0.82rem;
  }
  @media (max-width: 900px) {
    .pcs-program-topbar,
    .pcs-program-hero {
      grid-template-columns: 1fr;
      display: grid;
    }
    .pcs-program-topbar {
      padding: 14px;
      border-radius: 24px;
    }
    .pcs-program-topbar-main {
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .pcs-program-brand {
      flex: 1 1 auto;
      min-width: 0;
    }
    .pcs-program-brand-mark {
      width: 42px;
      height: 42px;
      flex-basis: 42px;
      border-radius: 16px;
    }
    .pcs-program-brand-kicker {
      letter-spacing: 0.14em;
      font-size: 0.66rem;
    }
    .pcs-program-brand-title {
      font-size: 1.02rem;
      white-space: normal;
      line-height: 1.1;
    }
    .pcs-program-toplinks {
      width: auto;
      margin-left: auto;
      justify-content: flex-end;
      gap: 8px;
      flex-shrink: 0;
    }
    .pcs-program-link {
      min-height: 38px;
      padding: 0 14px;
      font-size: 0.86rem;
      gap: 8px;
    }
    .pcs-program-link-label--desktop {
      display: none;
    }
    .pcs-program-link-label--mobile {
      display: inline;
    }
    .pcs-program-link-icon {
      min-width: 0.9rem;
      font-size: 0.82rem;
    }
    .pcs-program-menu-link {
      min-height: 34px;
      padding: 0 12px;
      font-size: 0.82rem;
    }
    .pcs-program-stats,
    .pcs-program-airings,
    .pcs-program-context-grid,
    .pcs-program-cast-grid {
      grid-template-columns: 1fr;
    }
    .pcs-program-hero {
      padding: 18px;
      gap: 16px;
      border-radius: 26px;
    }
    .pcs-program-badges {
      gap: 8px;
      margin-bottom: 12px;
    }
    .pcs-program-badge {
      min-height: 30px;
      padding: 0 12px;
      font-size: 0.76rem;
    }
    .pcs-program-title {
      margin-bottom: 12px;
      font-size: clamp(1.95rem, 10vw, 2.45rem);
      line-height: 1.02;
    }
    .pcs-program-description {
      margin-bottom: 16px;
      font-size: 0.98rem;
      line-height: 1.55;
    }
    .pcs-program-stat {
      padding: 12px 14px;
      border-radius: 18px;
    }
    .pcs-program-stat-label {
      margin-bottom: 6px;
      font-size: 0.72rem;
    }
    .pcs-program-stat-value {
      font-size: 0.95rem;
    }
    .pcs-program-actions {
      gap: 8px;
    }
    .pcs-program-visual-card {
      min-height: 190px;
      border-radius: 22px;
    }
    .pcs-program-visual-overlay {
      inset: auto 12px 12px 12px;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 16px;
    }
    .pcs-program-channel-logo {
      width: 48px;
      height: 48px;
      flex-basis: 48px;
      border-radius: 14px;
    }
    .pcs-program-channel-logo img {
      padding: 8px;
    }
    .pcs-program-visual-kicker {
      margin-bottom: 4px;
      font-size: 0.68rem;
    }
    .pcs-program-visual-title {
      font-size: 0.92rem;
    }
    .pcs-program-section {
      margin-top: 20px;
      padding: 18px;
      border-radius: 24px;
    }
    .pcs-program-section-title {
      font-size: 1.32rem;
    }
    .pcs-program-section-copy {
      margin-bottom: 14px;
      font-size: 0.95rem;
    }
    .pcs-program-faq-item,
    .pcs-program-context-card,
    .pcs-program-airing,
    .pcs-program-cast-link {
      padding: 14px;
      border-radius: 18px;
    }
  }
</style>
""".strip()


def escape_ics_text(text: str) -> str:
    return (
        str(text or '')
        .replace('\\', '\\\\')
        .replace(';', '\\;')
        .replace(',', '\\,')
        .replace('\n', '\\n')
        .replace('\r', '')
    )


def format_ics_datetime(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime('%Y%m%dT%H%M%SZ')


def build_program_calendar_payload(
    title: str,
    description: str,
    start_time_iso: str,
    end_time_iso: str,
    location: str,
    url: str,
    reminder_minutes: int = 15,
) -> Dict[str, str]:
    start_time = parse_program_datetime(start_time_iso).astimezone(TIMEZONE)
    end_time = parse_program_datetime(end_time_iso).astimezone(TIMEZONE)
    compact_description = compact_text(description, 260)
    reminder_label = f'Rappel : {title} dans {reminder_minutes} minutes sur {location}'
    uid = f'programmecesoir-{slugify_for_url(title)}-{start_time.strftime("%Y%m%d%H%M")}@programmecesoir.fr'

    ics_lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//ProgrammeCeSoir//FR',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        f'UID:{uid}',
        f'DTSTAMP:{format_ics_datetime(datetime.now(timezone.utc))}',
        f'DTSTART:{format_ics_datetime(start_time)}',
        f'DTEND:{format_ics_datetime(end_time)}',
        f'SUMMARY:{escape_ics_text(title)}',
        f'DESCRIPTION:{escape_ics_text(compact_description)}\\n\\nLink: {url}',
        f'LOCATION:{escape_ics_text(location)}',
        f'URL:{url}',
        'STATUS:CONFIRMED',
        'SEQUENCE:0',
        'BEGIN:VALARM',
        f'TRIGGER:-PT{max(1, int(reminder_minutes))}M',
        'ACTION:DISPLAY',
        f'DESCRIPTION:{escape_ics_text(reminder_label)}',
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR',
    ]
    ics_content = '\r\n'.join(ics_lines)
    google_dates = (
        f'{start_time.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")}/'
        f'{end_time.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")}'
    )
    google_query = urlencode({
        'action': 'TEMPLATE',
        'text': title,
        'dates': google_dates,
        'details': f'{compact_description}\n\nLink: {url}',
        'location': location,
        'sf': 'true',
        'output': 'xml',
    })

    return {
        'icsDataUrl': f'data:text/calendar;charset=utf-8,{quote(ics_content)}',
        'googleCalendarUrl': f'https://calendar.google.com/calendar/render?{google_query}',
        'downloadFilename': f'{slugify_for_url(title) or "programme"}_{slugify_for_url(location) or "chaine"}.ics',
        'startLabel': format_fr_datetime(start_time_iso),
    }


def build_program_fallback_html(
    channel: Dict[str, Any],
    primary: Dict[str, Any],
    airings: List[Dict[str, Any]],
    description: str,
    related_suggestions: List[Dict[str, Any]],
    linked_entity_context: Optional[Dict[str, Any]],
    tv_stream: Optional[Dict[str, str]],
) -> str:
    primary_start = parse_program_datetime(primary['start_time']).astimezone(TIMEZONE)
    primary_end = parse_program_datetime(primary['end_time']).astimezone(TIMEZONE)
    formatted_primary = format_fr_datetime(primary['start_time'])
    genre = str(primary.get('genre') or '').strip()
    channel_logo = to_absolute_url(channel.get('logo_url') or SITE_MARK_URL)
    visual_image = to_absolute_url(primary.get('poster_url') or channel.get('logo_url') or DEFAULT_OG_IMAGE_URL)
    channel_number = channel.get('channel_number')
    canonical_url = f'{SITEMAP_DOMAIN}{primary["url"]}'
    replay_url = str(primary.get('replay_url') or '').strip()
    replay_label = get_replay_label(channel.get('channel_id'))
    editorial_paragraphs = build_program_editorial_paragraphs(channel, primary, airings)
    faq_items = build_program_faq_items(channel, primary, airings)
    _, related_paths = get_program_category_insights(genre)
    channel_slug = escape_html(str(channel['channel_id']))
    navigation_links = [
        ('/en-direct', 'En direct'),
        ('/', 'Ce soir'),
        ('/demain', 'Demain'),
        ('/film-ce-soir', 'Films'),
        ('/series-ce-soir', 'Séries'),
        ('/acteurs', 'Acteurs'),
    ]
    related_labels = {
        '/film-ce-soir': 'Films ce soir',
        '/series-ce-soir': 'Séries ce soir',
        '/documentaires-ce-soir': 'Documentaires',
        '/divertissement-ce-soir': 'Divertissement',
        '/sport-ce-soir': 'Sport',
        '/culture-ce-soir': 'Culture',
        '/en-direct': 'En direct',
        '/': 'Guide ce soir',
    }
    tv_stream_html = ''
    if tv_stream:
        provider = str(tv_stream.get('provider') or '').strip()
        provider_html = (
            f'<p class="pcs-program-context-copy" style="margin-top:8px;">Source officielle&nbsp;: {escape_html(provider)}</p>'
            if provider else ''
        )
        tv_stream_html = (
            '<article class="pcs-program-context-card">'
            '<p class="pcs-program-context-kicker">En direct officiel</p>'
            f'<h3 class="pcs-program-context-title">Voir {escape_html(channel["name"])} en direct</h3>'
            '<p class="pcs-program-context-copy">Ouvrez le flux officiel de la chaîne si vous voulez suivre le programme ou enchaîner avec la grille en cours.</p>'
            '<div class="pcs-program-context-links">'
            f'<a class="pcs-program-link pcs-program-link--primary" href="{escape_html(tv_stream["streamUrl"])}" target="_blank" rel="nofollow noopener noreferrer">Regarder en direct</a>'
            f'<a class="pcs-program-link" href="/{channel_slug}">Toute la grille</a>'
            '</div>'
            f'{provider_html}'
            '</article>'
        )
    replay_html = ''
    if replay_url:
        replay_html = (
            '<article class="pcs-program-context-card">'
            '<p class="pcs-program-context-kicker">Replay officiel</p>'
            f'<h3 class="pcs-program-context-title">{escape_html(replay_label)}</h3>'
            '<p class="pcs-program-context-copy">Accédez directement à la fiche replay du programme sur la plateforme officielle du diffuseur, sans passer par la page live.</p>'
            '<div class="pcs-program-context-links">'
            f'<a class="pcs-program-link pcs-program-link--primary" href="{escape_html(replay_url)}" target="_blank" rel="nofollow noopener noreferrer">{escape_html(replay_label)}</a>'
            f'<a class="pcs-program-link" href="/{channel_slug}">Toute la grille</a>'
            '</div>'
            '</article>'
        )
    reminder_payload = build_program_calendar_payload(
        title=primary['title'],
        description=description,
        start_time_iso=primary['start_time'],
        end_time_iso=primary['end_time'],
        location=channel['name'],
        url=canonical_url,
    )
    reminder_html = (
        '<article class="pcs-program-context-card">'
        '<p class="pcs-program-context-kicker">Promemoria</p>'
        '<h3 class="pcs-program-context-title">Promemoria ? Salvalo nel calendario</h3>'
        '<p class="pcs-program-context-copy">Ajoutez cette diffusion à votre calendrier personnel avec l’horaire, la chaîne et un lien vers la fiche Programme Ce Soir.</p>'
        '<div class="pcs-program-context-links">'
        f'<a class="pcs-program-link pcs-program-link--primary" href="{escape_html(reminder_payload["icsDataUrl"])}" download="{escape_html(reminder_payload["downloadFilename"])}">Télécharger .ics</a>'
        f'<a class="pcs-program-link" href="{escape_html(reminder_payload["googleCalendarUrl"])}" target="_blank" rel="nofollow noopener noreferrer">Google Calendar</a>'
        '</div>'
        f'<p class="pcs-program-context-copy" style="margin-top:8px;">Diffusion enregistrée pour le {escape_html(reminder_payload["startLabel"])}.</p>'
        '</article>'
    )
    suggestion_cards = ''.join(
        (
            '<a class="pcs-program-cast-link" href="{url}">'
            '<strong>{title}</strong>'
            '<span>{channel} · {time}</span>'
            '</a>'
        ).format(
            url=escape_html(str(item.get('url') or '/')),
            title=escape_html(str(item.get('title') or 'Programme TV')),
            channel=escape_html(str(item.get('channel_name') or 'Autre chaîne')),
            time=escape_html(format_fr_datetime(str(item.get('start_time') or ''))),
        )
        for item in related_suggestions
    )
    suggestions_html = (
        '<article class="pcs-program-context-card">'
        '<p class="pcs-program-context-kicker">Suggestions proches</p>'
        '<h3 class="pcs-program-context-title">À regarder aussi sur d’autres chaînes</h3>'
        '<p class="pcs-program-context-copy">Si vous hésitez, voici quelques diffusions proches par horaire ou par tonalité éditoriale.</p>'
        f'<div class="pcs-program-cast-grid" style="margin-top:14px;">{suggestion_cards}</div>'
        '</article>'
        if suggestion_cards else
        '<article class="pcs-program-context-card">'
        '<p class="pcs-program-context-kicker">Besoin d’une autre idée ?</p>'
        '<h3 class="pcs-program-context-title">Vous ne savez pas quoi regarder ?</h3>'
        '<p class="pcs-program-context-copy">Passez par notre moteur de recommandations pour trouver un programme adapté à votre soirée.</p>'
        '<div class="pcs-program-context-links">'
        '<a class="pcs-program-link pcs-program-link--primary" href="/recommandes">Découvrir des recommandations</a>'
        '<a class="pcs-program-link" href="/">Voir tout ce soir</a>'
        '</div>'
        '</article>'
    )
    linked_entity_html = ''
    linked_cast_html = ''
    if linked_entity_context:
        entity_type = str(linked_entity_context.get('type') or '')
        entity_item = linked_entity_context.get('item') or {}
        entity_payload = linked_entity_context.get('payload') or {}
        entity_href = str(entity_item.get('href') or '')
        entity_title = str(entity_item.get('title') or primary.get('title') or '').strip()
        entity_label = 'Voir la fiche film' if entity_type == 'films' else 'Voir la fiche série'
        linked_entity_html = (
            '<article class="pcs-program-context-card">'
            '<p class="pcs-program-context-kicker">Entité liée</p>'
            f'<h3 class="pcs-program-context-title">{escape_html(entity_title)}</h3>'
            '<p class="pcs-program-context-copy">Cette diffusion est rattachée à une fiche éditoriale enrichie avec contexte, diffusion(s) et liens vers le casting.</p>'
            '<div class="pcs-program-context-links">'
            f'<a class="pcs-program-link pcs-program-link--primary" href="{escape_html(entity_href)}">{escape_html(entity_label)}</a>'
            f'<a class="pcs-program-link" href="/{"films" if entity_type == "films" else "series"}">Catalogue {"films" if entity_type == "films" else "séries"}</a>'
            '</div>'
            '</article>'
        )
        cast_entries: List[Tuple[str, str, str]] = []
        for person in entity_payload.get('cast') or []:
            slug = str(person.get('slug') or '').strip()
            name = str(person.get('name') or '').strip()
            role = str(person.get('role') or 'actor').strip()
            if slug and name:
                cast_entries.append((slug, name, role))
            if len(cast_entries) >= 8:
                break
        if not cast_entries:
            for key in ('director', 'creator'):
                person = entity_payload.get(key) or {}
                slug = str(person.get('slug') or '').strip()
                name = str(person.get('name') or '').strip()
                role = str(person.get('role') or key).strip()
                if slug and name:
                    cast_entries.append((slug, name, role))
        if cast_entries:
            linked_cast_html = (
                '<article class="pcs-program-context-card">'
                '<p class="pcs-program-context-kicker">Casting & équipe</p>'
                '<h3 class="pcs-program-context-title">Accéder aux fiches acteurs liées</h3>'
                '<p class="pcs-program-context-copy">Retrouvez les principales personnes associées à ce programme via leurs fiches dédiées.</p>'
                '<div class="pcs-program-cast-grid" style="margin-top:14px;">'
                + ''.join(
                    f'<a class="pcs-program-cast-link" href="/acteur/{escape_html(slug)}"><strong>{escape_html(name)}</strong><span>{escape_html(role)}</span></a>'
                    for slug, name, role in cast_entries
                )
                + '</div>'
                '</article>'
            )
    airing_cards_list: List[str] = []
    for row in airings[:PROGRAM_SHARE_SNAPSHOT_AIRING_LIMIT]:
        airing_calendar = build_program_calendar_payload(
            title=primary['title'],
            description=description,
            start_time_iso=row['start_time'],
            end_time_iso=row['end_time'],
            location=channel['name'],
            url=canonical_url,
        )
        airing_cards_list.append(
            '<article class="pcs-program-airing">'
            '<p class="pcs-program-airing-eyebrow">Diffusion</p>'
            f'<p class="pcs-program-airing-time">{escape_html(format_fr_datetime(row["start_time"]))}</p>'
            f'<p class="pcs-program-airing-meta">{escape_html(channel["name"])}'
            + (f' · {escape_html(str(row.get("genre") or "").strip())}' if row.get('genre') else '')
            + '</p>'
            + '<div class="pcs-program-airing-actions">'
            + f'<a class="pcs-program-link pcs-program-link--primary" href="{escape_html(airing_calendar["icsDataUrl"])}" download="{escape_html(airing_calendar["downloadFilename"])}">Ajouter au calendrier</a>'
            + f'<a class="pcs-program-link" href="{escape_html(airing_calendar["googleCalendarUrl"])}" target="_blank" rel="nofollow noopener noreferrer">Google Calendar</a>'
            + '</div>'
            + '</article>'
        )
    airing_cards = ''.join(airing_cards_list)

    menu_links_html = ''.join(
        f'<a class="pcs-program-menu-link" href="{escape_html(href)}">{escape_html(label)}</a>'
        for href, label in navigation_links
    )
    explore_chips_html = ''.join(
        f'<a class="pcs-program-chip" href="{escape_html(path)}">{escape_html(related_labels.get(path, path.strip("/").replace("-", " ").title()))}</a>'
        for path in related_paths[:3]
    )
    faq_cards_html = ''.join(
        '<article class="pcs-program-faq-item">'
        f'<p class="pcs-program-faq-question">{escape_html(item["question"])}</p>'
        f'<p class="pcs-program-faq-answer">{escape_html(item["answer"])}</p>'
        '</article>'
        for item in faq_items
    )
    hero_badges_html = (
        '<span class="pcs-program-badge">Programme TV</span>'
        f'<span class="pcs-program-badge">{escape_html(channel["name"])}</span>'
        + (f'<span class="pcs-program-badge">{escape_html(genre)}</span>' if genre else '')
    )
    hero_actions_html = (
        f'<a class="pcs-program-link pcs-program-link--primary" href="/{channel_slug}">Programme de {escape_html(channel["name"])}</a>'
        f'<a class="pcs-program-link" href="/ce-soir/{channel_slug}">Ce soir sur {escape_html(channel["name"])}</a>'
        + (
            f'<a class="pcs-program-link" href="{escape_html(replay_url)}" target="_blank" rel="nofollow noopener noreferrer">{escape_html(replay_label)}</a>'
            if replay_url else ''
        )
        + (
            f'<a class="pcs-program-link" href="{escape_html(tv_stream["streamUrl"])}" target="_blank" rel="nofollow noopener noreferrer">Regarder en direct</a>'
            if tv_stream else ''
        )
    )
    richtext_html = f'<p>{escape_html(description)}</p>' + ''.join(
        f'<p>{escape_html(paragraph)}</p>' for paragraph in editorial_paragraphs
    )

    return ''.join([
        '<div class="pcs-program-shell">',
        '<div class="pcs-program-topbar">',
        '<div class="pcs-program-topbar-main">',
        '<a class="pcs-program-brand" href="/">',
        f'<span class="pcs-program-brand-mark"><img src="{escape_html(SITE_MARK_URL)}" alt="Programme Ce Soir"></span>',
        '<span class="pcs-program-brand-copy">',
        '<span class="pcs-program-brand-kicker">TNT France</span>',
        '<span class="pcs-program-brand-title">Programme Ce Soir</span>',
        '</span>',
        '</a>',
        '<div class="pcs-program-toplinks">',
        '<a class="pcs-program-link pcs-program-link--primary" href="/" aria-label="Retour à l’accueil">'
        '<span class="pcs-program-link-icon" aria-hidden="true">&larr;</span>'
        '<span class="pcs-program-link-label pcs-program-link-label--desktop">Retour à l’accueil</span>'
        '<span class="pcs-program-link-label pcs-program-link-label--mobile">Accueil</span>'
        '</a>',
        f'<a class="pcs-program-link" href="/{channel_slug}" aria-label="Voir la chaîne {escape_html(channel["name"])}">'
        '<span class="pcs-program-link-icon" aria-hidden="true">TV</span>'
        f'<span class="pcs-program-link-label pcs-program-link-label--desktop">Voir la chaîne {escape_html(channel["name"])}</span>'
        '<span class="pcs-program-link-label pcs-program-link-label--mobile">Chaîne</span>'
        '</a>',
        '</div>',
        '</div>',
        '<nav class="pcs-program-menu" aria-label="Navigation Programme Ce Soir">',
        menu_links_html,
        '</nav>',
        '</div>',
        '<section class="pcs-program-hero">',
        '<div class="pcs-program-copy">',
        '<div class="pcs-program-badges">',
        hero_badges_html,
        '</div>',
        f'<h1 class="pcs-program-title">{escape_html(primary["title"])} sur {escape_html(channel["name"])}</h1>',
        f'<p class="pcs-program-description">{escape_html(description)}</p>',
        '<div class="pcs-program-stats">',
        '<div class="pcs-program-stat">',
        '<p class="pcs-program-stat-label">Prochaine diffusion</p>',
        f'<p class="pcs-program-stat-value">{escape_html(formatted_primary)}</p>',
        '</div>',
        '<div class="pcs-program-stat">',
        '<p class="pcs-program-stat-label">Horaire</p>',
        f'<p class="pcs-program-stat-value">{escape_html(primary_start.strftime("%H:%M"))} - {escape_html(primary_end.strftime("%H:%M"))}</p>',
        '</div>',
        '<div class="pcs-program-stat">',
        '<p class="pcs-program-stat-label">Chaîne</p>',
        f'<p class="pcs-program-stat-value">{escape_html(channel["name"])}',
        f' · CH {escape_html(channel_number)}' if channel_number else '',
        '</p>',
        '</div>',
        '</div>',
        '<div class="pcs-program-actions">',
        hero_actions_html,
        '</div>',
        '</div>',
        '<aside class="pcs-program-visual">',
        '<div class="pcs-program-visual-card">',
        f'<img src="{escape_html(visual_image)}" alt="{escape_html(primary["title"])}">',
        '<div class="pcs-program-visual-overlay">',
        '<div class="pcs-program-channel-logo">',
        f'<img src="{escape_html(channel_logo)}" alt="{escape_html(channel["name"])}">',
        '</div>',
        '<div class="pcs-program-visual-copy">',
        '<p class="pcs-program-visual-kicker">Diffusion TV</p>',
        f'<p class="pcs-program-visual-title">{escape_html(primary["title"])}</p>',
        '</div>',
        '</div>',
        '</div>',
        '</aside>',
        '</section>',
        '<section class="pcs-program-section">',
        '<h2 class="pcs-program-section-title">Résumé et détails</h2>',
        '<div class="pcs-program-richtext">',
        richtext_html,
        '</div>',
        '<div class="pcs-program-explore">',
        explore_chips_html,
        '</div>',
        '</section>',
        '<section class="pcs-program-section">',
        '<h2 class="pcs-program-section-title">Accès direct et pistes voisines</h2>',
        '<p class="pcs-program-section-copy">Nous remettons ici les raccourcis utiles qui étaient présents sur la fiche applicative : flux officiel, suggestions voisines et liens entité quand ils existent.</p>',
        '<div class="pcs-program-context-grid">',
        tv_stream_html,
        replay_html,
        reminder_html,
        suggestions_html,
        linked_entity_html,
        linked_cast_html,
        '</div>',
        '</section>',
        '<section class="pcs-program-section">',
        f'<h2 class="pcs-program-section-title">Diffusions de {escape_html(primary["title"])}</h2>',
        '<p class="pcs-program-section-copy">Retrouvez les prochains horaires connus pour cette émission, ce film ou cette série sur la chaîne et préparez votre soirée sans repasser par la grille complète.</p>',
        f'<div class="pcs-program-airings">{airing_cards}</div>',
        '<div class="pcs-program-bottomlinks">',
        f'<a class="pcs-program-link pcs-program-link--primary" href="/{channel_slug}">Voir toute la chaîne</a>',
        '<a class="pcs-program-link" href="/">Retour à l’accueil</a>',
        '</div>',
        '</section>',
        '<section class="pcs-program-section">',
        '<h2 class="pcs-program-section-title">Questions fréquentes</h2>',
        '<div class="pcs-program-faq">',
        faq_cards_html,
        '</div>',
        '<div class="pcs-program-bottomlinks">',
        '<a class="pcs-program-link pcs-program-link--primary" href="/recommandes">Vous ne savez pas quoi regarder ?</a>',
        '<a class="pcs-program-link" href="/acteurs">Explorer les fiches acteurs</a>',
        '</div>',
        '</section>',
        '</div>',
    ])


def build_program_jsonld(channel: Dict[str, Any], primary: Dict[str, Any], airings: List[Dict[str, Any]], description: str, canonical_url: str, image_url: str) -> List[str]:
    same_as = CHANNEL_WIKIDATA_SAME_AS.get(channel['channel_id'])
    replay_url = str(primary.get('replay_url') or '').strip() or canonical_url
    entity_type = infer_program_kind(str(primary.get('genre') or ''))
    series_info = extract_series_info(str(primary.get('title') or ''))
    duration_iso = None
    try:
        start_time = parse_program_datetime(primary['start_time']).astimezone(TIMEZONE)
        end_time = parse_program_datetime(primary['end_time']).astimezone(TIMEZONE)
        duration_minutes = max(1, int(round((end_time - start_time).total_seconds() / 60)))
        duration_iso = f'PT{duration_minutes}M'
    except Exception:
        duration_iso = None

    work_id = f'{canonical_url}#program'
    work_entity: Dict[str, Any] = {
        '@context': 'https://schema.org',
        '@type': entity_type,
        '@id': work_id,
        'name': primary['title'],
        'description': description,
        'url': canonical_url,
        'image': image_url,
        'inLanguage': 'fr-FR',
        'mainEntityOfPage': canonical_url,
    }
    genre = str(primary.get('genre') or '').strip()
    if genre:
        work_entity['genre'] = [genre] if entity_type in ('Movie', 'TVSeries') else genre
    if duration_iso and entity_type == 'Movie':
        work_entity['duration'] = duration_iso
        work_entity['potentialAction'] = {
            '@type': 'WatchAction',
            'target': canonical_url,
        }
    elif duration_iso and entity_type == 'TVSeries':
        work_entity['duration'] = duration_iso
    if entity_type == 'TVEpisode':
        if series_info.get('seasonNumber'):
            work_entity['seasonNumber'] = series_info['seasonNumber']
        if series_info.get('episodeNumber'):
            work_entity['episodeNumber'] = series_info['episodeNumber']
        work_entity['partOfSeries'] = {
            '@type': 'TVSeries',
            'name': series_info.get('seriesName') or primary['title'],
        }

    graphs: List[Dict[str, Any]] = [
        {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            'itemListElement': [
                {'@type': 'ListItem', 'position': 1, 'name': 'Accueil', 'item': SITEMAP_DOMAIN},
                {'@type': 'ListItem', 'position': 2, 'name': channel['name'], 'item': f"{SITEMAP_DOMAIN}/{channel['channel_id']}"},
                {'@type': 'ListItem', 'position': 3, 'name': primary['title'], 'item': canonical_url},
            ],
        },
        work_entity,
    ]
    work_entity['author'] = {'@id': f'{SITEMAP_DOMAIN}/#organization'}
    work_entity['publisher'] = {'@id': f'{SITEMAP_DOMAIN}/#organization'}

    for row in airings[:PROGRAM_SHARE_SNAPSHOT_AIRING_LIMIT]:
        broadcast_url = str(row.get('replay_url') or '').strip() or replay_url
        graphs.append({
            '@context': 'https://schema.org',
            '@type': 'BroadcastEvent',
            'name': f'{row["title"]} sur {channel["name"]}',
            'startDate': row['start_time'],
            'endDate': row['end_time'],
            'description': description,
            'isLiveBroadcast': False,
            'inLanguage': 'fr-FR',
            'url': broadcast_url,
            'author': {'@id': f'{SITEMAP_DOMAIN}/#organization'},
            'publisher': {'@id': f'{SITEMAP_DOMAIN}/#organization'},
            'publishedOn': {
                '@type': 'BroadcastService',
                'name': channel['name'],
                'url': f"{SITEMAP_DOMAIN}/{channel['channel_id']}",
                'broadcastDisplayName': channel['name'],
                'broadcastTimezone': 'Europe/Paris',
                **({'sameAs': same_as} if same_as else {}),
            },
            'workPerformed': {
                '@id': work_id,
            },
        })

    return [f'<script type="application/ld+json" data-seo="program">{escape_json_for_html(graph)}</script>' for graph in graphs]


def inject_program_html(
    template: str,
    channel: Dict[str, Any],
    primary: Dict[str, Any],
    airings: List[Dict[str, Any]],
    description: str,
    related_suggestions: List[Dict[str, Any]],
    linked_entity_context: Optional[Dict[str, Any]],
    tv_stream: Optional[Dict[str, str]],
) -> str:
    canonical_path = primary['url']
    canonical_url = f"{SITEMAP_DOMAIN}{canonical_path}"
    title = f"{primary['title']} sur {channel['name']} : horaire et diffusion TV - Programme Ce Soir"
    image_url = to_absolute_url(primary.get('poster_url') or channel.get('logo_url') or DEFAULT_OG_IMAGE_URL)
    meta_description = compact_text(description, 165)
    fallback_html = build_program_fallback_html(
        channel,
        primary,
        airings,
        description,
        related_suggestions,
        linked_entity_context,
        tv_stream,
    )
    jsonld_scripts = build_program_jsonld(channel, primary, airings, description, canonical_url, image_url)
    jsonld_scripts.append(build_program_faq_jsonld(canonical_url, build_program_faq_items(channel, primary, airings)))
    bootstrap_payload = {
        'routePath': canonical_path,
        'pageState': {
            'type': 'program-loading',
            'channelId': channel['channel_id'],
            'channelSlug': channel['channel_id'],
            'programSlug': slugify_for_url(primary['title']),
            'programAiringToken': (
                datetime.fromisoformat(str(primary.get('start_time') or '').replace('Z', '+00:00')).astimezone(TIMEZONE).strftime('%Y-%m-%d-%H%M')
                if primary.get('start_time')
                else ''
            ),
        },
        'generatedAt': datetime.now(TIMEZONE).isoformat(),
    }

    html = strip_existing_head_tags(template)
    html = replace_single_tag(html, r'<title>[\s\S]*?</title>', f'<title>{escape_html(title)}</title>')
    html = replace_single_tag(html, r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{escape_html(meta_description)}">')
    html = replace_single_tag(html, r'<meta name="robots" content="[^"]*">', '<meta name="robots" content="index,follow">')
    html = replace_single_block(
        html,
        r'<main id="crawler-fallback"[\s\S]*?</main>',
        f'<main id="crawler-fallback" style="max-width:1200px;margin:0 auto;padding:24px;font-family:Inter,Arial,sans-serif;">{fallback_html}</main>',
    )

    extra_head = '\n  '.join(jsonld_scripts + [
        build_program_fallback_styles(),
        f'<link rel="canonical" href="{escape_html(canonical_url)}">',
        '<meta name="author" content="Programme Ce Soir">',
        '<meta name="publisher" content="Programme Ce Soir">',
        '<meta property="og:type" content="article">',
        '<meta property="og:locale" content="fr_FR">',
        '<meta property="og:site_name" content="Programme Ce Soir">',
        f'<meta property="og:title" content="{escape_html(title)}">',
        f'<meta property="og:description" content="{escape_html(meta_description)}">',
        f'<meta property="og:url" content="{escape_html(canonical_url)}">',
        f'<meta property="og:image" content="{escape_html(image_url)}">',
        '<meta name="twitter:card" content="summary_large_image">',
        f'<meta name="twitter:title" content="{escape_html(title)}">',
        f'<meta name="twitter:description" content="{escape_html(meta_description)}">',
        f'<meta name="twitter:image" content="{escape_html(image_url)}">',
        f'<script id="app-bootstrap-data" type="application/json">{escape_json_for_html(bootstrap_payload)}</script>',
    ])
    html = html.replace('</head>', f'  {extra_head}\n</head>')
    return html


def regenerate_program_share_snapshots(channels_data: List[Dict], programs_data: List[Dict]) -> int:
    public_dir = get_public_dir()
    template_path = os.path.join(public_dir, 'index.html')
    if not os.path.exists(template_path):
        logger.warning(f"Program share snapshot skipped: template missing at {template_path}")
        return 0

    with open(template_path, 'r', encoding='utf-8') as f:
        template = f.read()

    now = datetime.now(TIMEZONE)
    start_cutoff = now - timedelta(hours=PROGRAM_SHARE_SNAPSHOT_PAST_HOURS)
    end_cutoff = now + timedelta(days=PROGRAM_SHARE_SNAPSHOT_FUTURE_DAYS)
    db_backfill_rows = fetch_program_snapshot_backfill_rows(start_cutoff, end_cutoff)
    if db_backfill_rows:
        programs_data = list(programs_data) + db_backfill_rows
    enrich_programs_with_replay_urls(programs_data)
    channels_by_id: Dict[str, Dict[str, Any]] = {}
    for channel in channels_data:
        channel_id = str(channel.get('channel_id') or '').strip()
        if not channel_id:
            continue
        logo_url = mirror_channel_logo(channel_id, channel.get('logo_url')) or channel.get('logo_url')
        channels_by_id[channel_id] = {
            **channel,
            'logo_url': logo_url,
        }

    grouped: Dict[str, Dict[str, Any]] = {}
    suggestion_rows: List[Dict[str, Any]] = []
    for program in programs_data:
        channel_id = str(program.get('channel_id') or '').strip()
        title = str(program.get('title') or '').strip()
        if not channel_id or not title:
            continue
        channel = channels_by_id.get(channel_id)
        if channel is None:
            continue

        try:
            start = parse_program_datetime(program['start']).astimezone(TIMEZONE)
            end = parse_program_datetime(program['end']).astimezone(TIMEZONE)
        except Exception:
            continue

        if end < start_cutoff or start > end_cutoff:
            continue

        slug_aliases = build_program_snapshot_slug_aliases(program, title)
        if not slug_aliases:
            continue
        canonical_channel_slug = canonicalize_head_channel_slug(channel_id)
        raw_channel_slug = slugify_for_url(channel_id)
        canonical_path = f"/programme/{canonical_channel_slug}/{slug_aliases[0]}"
        row = {
            'title': title,
            'description': str(program.get('description') or ''),
            'genre': str(program.get('category') or program.get('genre') or ''),
            'start_time': start.isoformat(),
            'end_time': end.isoformat(),
            'url': canonical_path,
            'poster_url': program.get('poster') or program.get('poster_url'),
            'replay_url': program.get('replay_url'),
            'channel_id': channel_id,
            'channel_name': channel.get('name'),
            'channel_logo': channel.get('logo_url'),
            'channel_number': channel.get('channel_number'),
            'slug_aliases': slug_aliases,
            'canonical_channel_slug': canonical_channel_slug,
            'raw_channel_slug': raw_channel_slug,
        }
        bucket = grouped.setdefault(canonical_path, {
            'channel': channel,
            'rows': [],
        })
        bucket['rows'].append(row)
        suggestion_rows.append(row)

    suggestion_rows.sort(key=lambda item: item['start_time'])
    suggestion_start_times = [
        parse_program_datetime(item['start_time']).astimezone(TIMEZONE).timestamp()
        for item in suggestion_rows
    ]

    rendered_paths: set[str] = set()
    rendered = 0
    for canonical_path, payload in grouped.items():
        rows = payload['rows']
        rows.sort(key=lambda item: item['start_time'])
        primary = choose_primary_program_airing(rows, now)
        description = re.sub(r'\s+', ' ', str(primary.get('description') or '')).strip()
        if not description:
            description = (
                f"{primary['title']} sur {payload['channel']['name']} à {format_fr_datetime(primary['start_time'])}. "
                "Retrouvez l’horaire complet, le contexte du programme et les autres diffusions sur Programme Ce Soir."
            )
        related_suggestions = build_related_program_suggestions(
            primary,
            payload['channel'],
            suggestion_rows,
            suggestion_start_times,
        )
        linked_entity_context = find_program_linked_entity(primary)
        tv_stream = get_tv_stream(payload['channel'].get('channel_id'), payload['channel'].get('name'))
        html = inject_program_html(
            template,
            payload['channel'],
            primary,
            rows,
            description,
            related_suggestions,
            linked_entity_context,
            tv_stream,
        )
        alias_paths = []
        channel_slug_candidates: List[str] = []
        for candidate in (
            primary.get('canonical_channel_slug'),
            primary.get('raw_channel_slug'),
            payload['channel'].get('channel_id'),
        ):
            normalized_candidate = canonicalize_head_channel_slug(str(candidate or '')) if candidate == payload['channel'].get('channel_id') else slugify_for_url(str(candidate or ''))
            if normalized_candidate and normalized_candidate not in channel_slug_candidates:
                channel_slug_candidates.append(normalized_candidate)

        for slug_alias in (primary.get('slug_aliases') or [slugify_for_url(primary.get('title') or '')]):
            if not slug_alias:
                continue
            for channel_slug in channel_slug_candidates:
                relative_html_path = f"programme/{channel_slug}/{slug_alias}.html"
                target_path = os.path.join(public_dir, relative_html_path)
                os.makedirs(os.path.dirname(target_path), exist_ok=True)
                with open(target_path, 'w', encoding='utf-8') as f:
                    f.write(html)
                alias_paths.append(target_path)
                rendered_paths.add(os.path.normpath(target_path))
        rendered += 1

    programme_root = os.path.join(public_dir, 'programme')
    if os.path.isdir(programme_root):
        for root, _, files in os.walk(programme_root):
            for file_name in files:
                if not file_name.endswith('.html'):
                    continue
                absolute_path = os.path.normpath(os.path.join(root, file_name))
                if absolute_path in rendered_paths:
                    continue
                try:
                    os.remove(absolute_path)
                except Exception as e:
                    logger.warning(f"Failed to delete stale program snapshot {absolute_path}: {str(e)}")

    logger.info(f"Program share snapshots regenerated: {rendered}")
    return rendered


def run_detached_program_share_snapshots(expected_run_id: str) -> int:
    logger.info(f"Detached program share snapshots started for run {expected_run_id}")
    try:
        update_detached_program_share_state(
            expected_run_id,
            'running',
            detail='Chargement XMLTV pour snapshots programme',
        )
        content = fetch_xmltv()
        channels, programs = parse_xmltv(content)
        attach_program_media_from_db(programs)
        rendered = regenerate_program_share_snapshots(channels, programs)
        detail = f'{rendered} snapshots programme régénérés'
        update_detached_program_share_state(
            expected_run_id,
            'completed',
            detail=detail,
            extra={'count': rendered},
        )
        logger.info(f"Detached program share snapshots completed for run {expected_run_id}: {rendered}")
        return 0
    except Exception as e:
        update_detached_program_share_state(
            expected_run_id,
            'failed',
            detail='Job détaché échoué',
            error=str(e),
        )
        logger.error(f"Detached program share snapshots failed for run {expected_run_id}: {str(e)}", exc_info=True)
        return 1


def build_channel_jsonld(channel: Dict[str, Any], description: str, sections: List[Dict[str, Any]], route_path: str, section_key: str) -> List[str]:
    canonical_url = f"{SITEMAP_DOMAIN}{route_path}"
    same_as = CHANNEL_WIKIDATA_SAME_AS.get(channel['channel_id'])
    item_list_id = f'{canonical_url}#program-list'
    organization_ref = {'@id': f'{SITEMAP_DOMAIN}/#organization'}
    public_channel_slug = canonicalize_head_channel_slug(str(channel.get('channel_id') or ''))
    public_channel_url = f"{SITEMAP_DOMAIN}/{public_channel_slug}"
    section_label = 'aujourd’hui'
    if section_key == 'maintenant':
        section_label = 'en direct'
    elif section_key == 'ce-soir':
        section_label = 'ce soir'
    elif section_key == 'demain':
        section_label = 'demain'

    graphs: List[Dict[str, Any]] = [
        {
            '@context': 'https://schema.org',
            '@type': 'BroadcastService',
            '@id': f'{public_channel_url}#broadcastservice',
            'name': channel['name'],
            'url': public_channel_url,
            'broadcastDisplayName': channel['name'],
            'broadcastTimezone': 'Europe/Paris',
            'inLanguage': 'fr-FR',
            'author': organization_ref,
            'publisher': organization_ref,
            **({'sameAs': same_as} if same_as else {}),
            **({'logo': {'@type': 'ImageObject', 'url': to_absolute_url(channel.get("logo_url"))}} if channel.get('logo_url') else {}),
        },
        {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            'itemListElement': [
                {'@type': 'ListItem', 'position': 1, 'name': 'Accueil', 'item': SITEMAP_DOMAIN},
                {'@type': 'ListItem', 'position': 2, 'name': channel['name'], 'item': canonical_url},
            ],
        },
        {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            '@id': f'{canonical_url}#collectionpage',
            'name': f'Programme TV {channel["name"]} {section_label}',
            'description': description,
            'url': canonical_url,
            'inLanguage': 'fr-FR',
            'mainEntity': {'@id': item_list_id},
            'author': organization_ref,
            'publisher': organization_ref,
            'about': {
                '@type': 'Thing',
                'name': f'Programme TV {channel["name"]}',
            },
        },
    ]

    preferred_section = next((section for section in sections if section['key'] == section_key and section['payload']['programs']), None)
    if preferred_section is None:
        preferred_section = next((section for section in sections if section['key'] == 'ce-soir' and section['payload']['programs']), None)
    if preferred_section is None:
        preferred_section = next((section for section in sections if section['payload']['programs']), sections[0])
    item_limit = 5 if section_key in ('maintenant', 'ce-soir', 'demain') else 8
    top_programs_raw: List[Dict[str, Any]] = preferred_section['payload']['programs'] if preferred_section else []
    top_programs: List[Dict[str, Any]] = []
    seen_program_urls: set[str] = set()
    for program in top_programs_raw:
        program_url = str(program.get('url') or '').strip()
        if not program_url or program_url in seen_program_urls:
            continue
        seen_program_urls.add(program_url)
        top_programs.append(program)
        if len(top_programs) >= item_limit:
            break

    if top_programs:
        item_list = {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            '@id': item_list_id,
            'name': f'Programme TV {channel["name"]} {preferred_section["label"].lower() if preferred_section else "ce soir"}',
            'description': f'Principaux programmes diffusés sur {channel["name"]} {preferred_section["label"].lower() if preferred_section else "ce soir"}.',
            'itemListElement': [],
        }
        for idx, program in enumerate(top_programs, start=1):
            full_program_url = f"{SITEMAP_DOMAIN}{program['url']}"
            entity_type = infer_program_kind(str(program.get('genre') or ''))
            series_info = extract_series_info(str(program.get('title') or ''))
            program_description = str(program.get('description') or f"{program['title']} sur {channel['name']}").strip()
            work_id = f'{full_program_url}#program'
            visual_url = to_absolute_url(program.get('poster_url') or program.get('channel_logo') or channel.get('logo_url'))
            duration_iso = None
            try:
                start_dt = parse_program_datetime(program['start_time']).astimezone(TIMEZONE)
                end_dt = parse_program_datetime(program['end_time']).astimezone(TIMEZONE)
                duration_minutes = max(0, int(round((end_dt - start_dt).total_seconds() / 60)))
                if duration_minutes > 0:
                    duration_iso = f'PT{duration_minutes}M'
            except Exception:
                duration_iso = None

            work_entity: Dict[str, Any] = {
                '@context': 'https://schema.org',
                '@type': entity_type,
                '@id': work_id,
                'name': program['title'],
                'description': program_description,
                'url': full_program_url,
                'inLanguage': 'fr-FR',
                'author': organization_ref,
                'publisher': organization_ref,
            }
            if visual_url:
                work_entity['image'] = {'@type': 'ImageObject', 'url': visual_url}
            if program.get('genre'):
                work_entity['genre'] = [program['genre']] if entity_type != 'TVEpisode' else program['genre']
            if duration_iso and entity_type in ('Movie', 'TVSeries'):
                work_entity['duration'] = duration_iso
            if entity_type == 'Movie':
                work_entity['potentialAction'] = {'@type': 'WatchAction', 'target': full_program_url}
            elif entity_type == 'TVEpisode':
                if series_info.get('episodeNumber'):
                    work_entity['episodeNumber'] = series_info['episodeNumber']
                if series_info.get('seasonNumber'):
                    work_entity['seasonNumber'] = series_info['seasonNumber']
                work_entity['partOfSeries'] = {
                    '@type': 'TVSeries',
                    'name': series_info.get('seriesName') or program['title'],
                }

            item_list['itemListElement'].append({
                '@type': 'ListItem',
                'position': idx,
                'item': {'@id': f'{full_program_url}#broadcast'},
            })
            graphs.append(work_entity)
            graphs.append({
                '@context': 'https://schema.org',
                '@type': 'BroadcastEvent',
                '@id': f'{full_program_url}#broadcast',
                'name': f'{program["title"]} sur {channel["name"]}',
                'description': program_description,
                'startDate': program['start_time'],
                'endDate': program['end_time'],
                'isLiveBroadcast': False,
                'inLanguage': 'fr-FR',
                'author': organization_ref,
                'publisher': organization_ref,
                'publishedOn': {
                    '@type': 'BroadcastService',
                    'name': channel['name'],
                    'url': public_channel_url,
                    'broadcastDisplayName': channel['name'],
                    'broadcastTimezone': 'Europe/Paris',
                    **({'sameAs': same_as} if same_as else {}),
                },
                'workPerformed': {'@id': work_id},
                'url': full_program_url,
            })
        graphs.append(item_list)

    return [f'<script type="application/ld+json" data-seo="channel">{escape_json_for_html(graph)}</script>' for graph in graphs]


def inject_channel_html(template: str, channel: Dict[str, Any], description: str, fallback_html: str, jsonld_scripts: List[str], bootstrap_payload: Dict[str, Any]) -> str:
    route_path = str(bootstrap_payload.get('routePath') or f"/{channel['channel_id']}")
    canonical_url = f"{SITEMAP_DOMAIN}{route_path}"
    sub_view = str((bootstrap_payload.get('pageState') or {}).get('channelViewMode') or 'aujourdhui')
    if sub_view == 'maintenant':
        title = f"Programme {channel['name']} en direct - Programme Ce Soir"
    elif sub_view == 'demain':
        title = f"Programme {channel['name']} demain - Programme Ce Soir"
    elif sub_view == 'ce-soir':
        title = f"{channel['name']} ce soir : programme TV et prime time - Programme Ce Soir"
    else:
        title = f"Programme TV {channel['name']} aujourd’hui - Programme Ce Soir"
    image_url = to_absolute_url(channel.get('logo_url'))

    html = strip_existing_head_tags(template)
    html = replace_single_tag(html, r'<title>[\s\S]*?</title>', f'<title>{escape_html(title)}</title>')
    html = replace_single_tag(html, r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{escape_html(description)}">')
    html = replace_single_tag(html, r'<meta name="robots" content="[^"]*">', '<meta name="robots" content="index,follow">')
    html = replace_single_block(
        html,
        r'<main id="crawler-fallback"[\s\S]*?</main>',
        f'<main id="crawler-fallback" style="max-width:1200px;margin:0 auto;padding:24px;font-family:Inter,Arial,sans-serif;">{fallback_html}</main>',
    )

    extra_head = '\n  '.join(jsonld_scripts + [
        f'<link rel="canonical" href="{escape_html(canonical_url)}">',
        '<meta name="author" content="Programme Ce Soir">',
        '<meta name="publisher" content="Programme Ce Soir">',
        '<meta property="og:type" content="website">',
        '<meta property="og:locale" content="fr_FR">',
        '<meta property="og:site_name" content="Programme Ce Soir">',
        f'<meta property="og:title" content="{escape_html(title)}">',
        f'<meta property="og:description" content="{escape_html(description)}">',
        f'<meta property="og:url" content="{escape_html(canonical_url)}">',
        f'<meta property="og:image" content="{escape_html(image_url)}">',
        '<meta name="twitter:card" content="summary_large_image">',
        f'<meta name="twitter:title" content="{escape_html(title)}">',
        f'<meta name="twitter:description" content="{escape_html(description)}">',
        f'<meta name="twitter:image" content="{escape_html(image_url)}">',
        f'<script id="app-bootstrap-data" type="application/json">{escape_json_for_html(bootstrap_payload)}</script>',
    ])
    html = html.replace('</head>', f'  {extra_head}\n</head>')
    return html


def regenerate_head_root_routes(channels_data: List[Dict], programs_data: List[Dict]) -> int:
    public_dir = get_public_dir()
    template_path = os.path.join(public_dir, 'index.html')
    if not os.path.exists(template_path):
        logger.warning(f"Head root snapshot skipped: template missing at {template_path}")
        return 0

    with open(template_path, 'r', encoding='utf-8') as f:
        template = f.read()

    rendered = 0
    route_paths = list(HOME_PAGE_CONFIGS.keys()) + list(CATEGORY_PAGE_CONFIGS.keys())
    for route_path in route_paths:
        bootstrap_payload = build_head_listing_bootstrap_payload(route_path, channels_data, programs_data)
        html = inject_head_listing_html(template, route_path, bootstrap_payload)

        if route_path == '/':
            target_path = os.path.join(public_dir, 'index.html')
            with open(target_path, 'w', encoding='utf-8') as f:
                f.write(html)
            rendered += 1
            continue

        relative_html = f"{route_path.lstrip('/')}.html"
        target_path = os.path.join(public_dir, relative_html)
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        with open(target_path, 'w', encoding='utf-8') as f:
            f.write(html)
        rendered += 1

        if route_path in ('/en-direct', '/demain'):
            directory_index = os.path.join(public_dir, route_path.lstrip('/'), 'index.html')
            os.makedirs(os.path.dirname(directory_index), exist_ok=True)
            with open(directory_index, 'w', encoding='utf-8') as f:
                f.write(html)

    logger.info(f"Head root snapshots regenerated: {rendered}")
    return rendered


def regenerate_head_channel_routes(channels_data: List[Dict], programs_data: List[Dict]) -> int:
    public_dir = get_public_dir()
    template_path = os.path.join(public_dir, 'index.html')
    if not os.path.exists(template_path):
        logger.warning(f"Head channel snapshot skipped: template missing at {template_path}")
        return 0

    with open(template_path, 'r', encoding='utf-8') as f:
        template = f.read()

    programs_by_channel: Dict[str, List[Dict[str, Any]]] = {}
    for program in programs_data:
        channel_id = str(program.get('channel_id') or '').strip()
        if not channel_id:
            continue
        programs_by_channel.setdefault(channel_id, []).append(program)

    rendered = 0
    for channel in channels_data:
        channel_id = str(channel.get('channel_id') or '').strip()
        channel_name = str(channel.get('name') or channel_id).strip()
        if not channel_id or not channel_name:
            continue

        sections = build_head_channel_sections(channel, programs_by_channel.get(channel_id, []))
        # Keep snapshot regeneration independent from third-party logo fetches.
        logo_url = resolve_snapshot_logo_url(channel_id, channel.get('logo_url')) or channel.get('logo_url')
        channel_for_render = {
            **channel,
            'logo_url': logo_url,
        }
        for section in sections:
            bootstrap_payload = section['payload']
            if section['key'] == 'maintenant':
                description = f"Programme {channel_name} en direct : ce qui passe maintenant et dans les prochaines heures."
            elif section['key'] == 'demain':
                description = f"Programme TV {channel_name} demain : horaires, films, séries et émissions à venir."
            elif section['key'] == 'ce-soir':
                description = f"Consultez la grille de ce soir sur {channel_name}, avec les horaires, le prime time et les émissions à suivre en première partie de soirée."
            else:
                description = f"Programme TV {channel_name} aujourd’hui : films, séries et émissions en direct."
            fallback_html = build_channel_fallback_html({
                'channel_id': channel_id,
                'name': channel_name,
            }, description, sections)
            jsonld_scripts = build_channel_jsonld(
                channel_for_render,
                description,
                sections,
                str(bootstrap_payload.get('routePath') or f'/{channel_id}'),
                section['key'],
            )
            html = inject_channel_html(template, channel_for_render, description, fallback_html, jsonld_scripts, bootstrap_payload)

            relative_html = f"{str(bootstrap_payload.get('routePath') or f'/{channel_id}').lstrip('/')}.html"
            target_path = os.path.join(public_dir, relative_html)
            os.makedirs(os.path.dirname(target_path), exist_ok=True)
            with open(target_path, 'w', encoding='utf-8') as f:
                f.write(html)
            rendered += 1

    logger.info(f"Head channel snapshots regenerated: {rendered}")
    return rendered


def chunked(items: List[str], size: int) -> List[List[str]]:
    return [items[i:i + size] for i in range(0, len(items), size)]


def get_site_host() -> str:
    parsed = urlparse(SITEMAP_DOMAIN)
    return parsed.netloc.strip().lower()


def get_daily_birthday_urls() -> List[str]:
    public_dir = get_public_dir()
    current_file = os.path.join(public_dir, 'birthday-data', 'current.json')
    urls: List[str] = []
    seen = set()

    if not os.path.exists(current_file):
        return urls

    try:
        with open(current_file, 'r', encoding='utf-8') as f:
            payload = json.load(f)
    except Exception as e:
        logger.warning(f"Failed to read birthday current.json for notifications: {str(e)}")
        return urls

    if not isinstance(payload, dict) or payload.get('ok') is not True:
        return urls

    birthday_hub_url = f"{SITEMAP_DOMAIN}/anniversaire-du-jour"
    urls.append(birthday_hub_url)
    seen.add(birthday_hub_url)

    article_slug = str(payload.get('articleSlug') or '').strip()
    article_url = str(payload.get('articleUrl') or '').strip()

    if article_url.startswith('http'):
        if article_url not in seen:
            seen.add(article_url)
            urls.append(article_url)
    elif article_slug:
        loc = f"{SITEMAP_DOMAIN}/anniversaire/{slugify_for_url(article_slug)}"
        if loc not in seen:
            seen.add(loc)
            urls.append(loc)

    return urls


NOTIFICATION_ROOT_PATHS = [
    '/',
    '/en-direct',
    '/demain',
    '/recommandes',
    '/film-ce-soir',
    '/series-ce-soir',
    '/sport-ce-soir',
    '/documentaires-ce-soir',
    '/divertissement-ce-soir',
    '/infos-ce-soir',
    '/jeunesse-ce-soir',
    '/culture-ce-soir',
]

GOOGLE_INDEXING_ROOT_PATHS = [
    path.strip()
    for path in GOOGLE_INDEXING_ROOT_PATHS_RAW.split(',')
    if path.strip()
]

GOOGLE_URL_INSPECTION_ROOT_PATHS = [
    path.strip()
    for path in GOOGLE_URL_INSPECTION_ROOT_PATHS_RAW.split(',')
    if path.strip()
]

GOOGLE_INDEXING_TARGET_CHANNELS = _parse_google_head_channel_list(GOOGLE_INDEXING_TARGET_CHANNELS_RAW)
GOOGLE_HEAD_PINNED_TARGET_CHANNELS = _parse_google_head_channel_list(GOOGLE_HEAD_PINNED_TARGET_CHANNELS_RAW)
GOOGLE_HEAD_ROTATION_TARGET_CHANNELS = _parse_google_head_channel_list(GOOGLE_HEAD_ROTATION_TARGET_CHANNELS_RAW)


def _append_unique_url(urls: List[str], seen: set, loc: str) -> None:
    if not loc or loc in seen:
        return
    seen.add(loc)
    urls.append(loc)


def _day_ordinal_paris() -> int:
    return datetime.now(TIMEZONE).date().toordinal()


def _load_google_indexing_state() -> Dict[str, Any]:
    try:
        if os.path.exists(GOOGLE_INDEXING_STATE_PATH):
            with open(GOOGLE_INDEXING_STATE_PATH, 'r', encoding='utf-8') as fh:
                payload = json.load(fh)
                if isinstance(payload, dict):
                    return payload
    except Exception as e:
        logger.warning(f"Unable to read Google indexing state: {str(e)}")
    return {}


def _save_google_indexing_state(payload: Dict[str, Any]) -> None:
    try:
        os.makedirs(os.path.dirname(GOOGLE_INDEXING_STATE_PATH), exist_ok=True)
        with open(GOOGLE_INDEXING_STATE_PATH, 'w', encoding='utf-8') as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.warning(f"Unable to persist Google indexing state: {str(e)}")


def build_priority_listing_urls(channels_data: List[Dict], limit: Optional[int] = None) -> List[str]:
    urls: List[str] = []
    seen: set = set()

    for path in NOTIFICATION_ROOT_PATHS:
        _append_unique_url(urls, seen, f"{SITEMAP_DOMAIN}{path}")

    priority_ids = list(CHANNEL_WIKIDATA_SAME_AS.keys())
    priority_seen = set()

    for raw_channel_id in priority_ids:
        normalized_raw = slugify_for_url(raw_channel_id)
        if not normalized_raw or normalized_raw in priority_seen:
            continue
        priority_seen.add(normalized_raw)
        view_paths = [
            f"/{normalized_raw}",
            f"/en-direct/{normalized_raw}",
            f"/ce-soir/{normalized_raw}",
            f"/demain/{normalized_raw}",
        ]
        for path in view_paths:
            _append_unique_url(urls, seen, f"{SITEMAP_DOMAIN}{path}")
            if limit and len(urls) >= limit:
                return urls

    for channel in channels_data:
        channel_id = str(channel.get('channel_id') or '').strip()
        if not channel_id:
            continue
        channel_slug = canonicalize_head_channel_slug(channel_id)
        if not channel_slug:
            continue
        view_paths = [
            f"/{channel_slug}",
            f"/en-direct/{channel_slug}",
            f"/ce-soir/{channel_slug}",
            f"/demain/{channel_slug}",
        ]
        for path in view_paths:
            _append_unique_url(urls, seen, f"{SITEMAP_DOMAIN}{path}")
            if limit and len(urls) >= limit:
                return urls

    for extra_url in get_daily_birthday_urls():
        _append_unique_url(urls, seen, extra_url)
        if limit and len(urls) >= limit:
            return urls

    return urls


def build_notification_urls(channels_data: List[Dict]) -> List[str]:
    urls: List[str] = [f"{SITEMAP_DOMAIN}/"]
    seen = set(urls)

    for channel in channels_data:
        channel_id = str(channel.get('channel_id') or '').strip()
        if not channel_id:
            continue
        channel_slug = canonicalize_head_channel_slug(channel_id)
        if not channel_slug:
            continue
        loc = f"{SITEMAP_DOMAIN}/{channel_slug}"
        if loc in seen:
            continue
        seen.add(loc)
        urls.append(loc)

    for extra_url in get_daily_birthday_urls():
        if extra_url in seen:
            continue
        seen.add(extra_url)
        urls.append(extra_url)

    if NOTIFY_INCLUDE_SITEMAPS:
        for extra in ('/sitemap.xml', '/sitemap-static.xml', '/plan-du-site/'):
            loc = f"{SITEMAP_DOMAIN}{extra}"
            if loc in seen:
                continue
            seen.add(loc)
            urls.append(loc)

    return urls


def build_indexnow_urls(channels_data: List[Dict]) -> List[str]:
    return build_priority_listing_urls(channels_data, limit=INDEXNOW_MAX_URLS)


def build_google_indexing_urls(channels_data: List[Dict]) -> List[str]:
    urls: List[str] = []
    seen: set = set()

    for path in GOOGLE_INDEXING_ROOT_PATHS:
        _append_unique_url(urls, seen, f"{SITEMAP_DOMAIN}{path}")

    active_target_info = get_active_google_head_channel_targets(channels_data)
    for channel_slug in active_target_info.get('activeTargets') or []:
        if len(urls) >= GOOGLE_INDEXING_MAX_URLS:
            break
        _append_unique_url(urls, seen, f"{SITEMAP_DOMAIN}/{channel_slug}")

    return urls[:GOOGLE_INDEXING_MAX_URLS]


def get_google_indexing_session():
    if not GOOGLE_INDEXING_ENABLED:
        return None

    try:
        from google.oauth2 import service_account
        from google.auth.transport.requests import AuthorizedSession
    except Exception as e:
        raise RuntimeError(
            "google-auth not installed; add it to the importer venv before enabling Google Indexing API"
        ) from e

    info = None
    if GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON:
        try:
            info = json.loads(GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON)
        except Exception as e:
            raise RuntimeError(f"Invalid GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON: {str(e)}")

    if info is None and GOOGLE_INDEXING_SERVICE_ACCOUNT_FILE:
        if not os.path.exists(GOOGLE_INDEXING_SERVICE_ACCOUNT_FILE):
            raise RuntimeError(
                f"GOOGLE_INDEXING_SERVICE_ACCOUNT_FILE not found: {GOOGLE_INDEXING_SERVICE_ACCOUNT_FILE}"
            )
        credentials = service_account.Credentials.from_service_account_file(
            GOOGLE_INDEXING_SERVICE_ACCOUNT_FILE,
            scopes=GOOGLE_INDEXING_SCOPES,
        )
        return AuthorizedSession(credentials)

    if info is not None:
        credentials = service_account.Credentials.from_service_account_info(
            info,
            scopes=GOOGLE_INDEXING_SCOPES,
        )
        return AuthorizedSession(credentials)

    raise RuntimeError(
        "Google Indexing API enabled but no service account configured "
        "(set GOOGLE_INDEXING_SERVICE_ACCOUNT_FILE or GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON)"
    )


def submit_google_indexing(urls: List[str]) -> None:
    if not GOOGLE_INDEXING_ENABLED:
        logger.info("Google Indexing API disabled; skipping notification")
        return
    if not urls:
        logger.info("No channel URLs to notify via Google Indexing API")
        return

    session = get_google_indexing_session()
    if session is None:
        logger.info("Google Indexing API session unavailable; skipping notification")
        return

    state = _load_google_indexing_state()
    today_key = datetime.now(TIMEZONE).date().isoformat()
    if state.get('date') != today_key:
        state = {'date': today_key, 'sent_urls': [], 'count': 0}

    sent_today = list(state.get('sent_urls') or [])
    sent_today_set = set(str(url) for url in sent_today)
    remaining_budget = max(0, GOOGLE_INDEXING_DAILY_BUDGET - int(state.get('count') or 0))
    if remaining_budget <= 0:
        logger.info("Google Indexing API daily budget reached; skipping notification")
        return

    queued_urls = [url for url in urls if url not in sent_today_set][:remaining_budget]
    if not queued_urls:
        logger.info("Google Indexing API has no new URLs to notify today")
        return

    notified = 0
    total_urls = len(queued_urls)
    for index, url in enumerate(queued_urls):
        payload = {
            'url': url,
            'type': GOOGLE_INDEXING_URL_TYPE,
        }
        last_error: Optional[str] = None
        response = None
        for attempt in range(GOOGLE_INDEXING_MAX_RETRIES):
            if attempt > 0:
                time.sleep(min(20.0, 0.8 * (2 ** (attempt - 1))))
            response = session.post(
                GOOGLE_INDEXING_ENDPOINT,
                json=payload,
                timeout=GOOGLE_INDEXING_TIMEOUT,
            )
            if response.status_code in (200, 202):
                break
            last_error = f"{response.status_code}: {response.text[:400]}"
            if response.status_code not in (429, 500, 502, 503, 504):
                break
        if response is None or response.status_code not in (200, 202):
            raise RuntimeError(
                f"Google Indexing API rejected {url} "
                f"({last_error or 'no response'})"
            )
        notified += 1
        sent_today.append(url)
        state['sent_urls'] = sent_today
        state['count'] = int(state.get('count') or 0) + 1
        _save_google_indexing_state(state)
        if GOOGLE_INDEXING_REQUEST_DELAY_MS > 0 and index < total_urls - 1:
            time.sleep(GOOGLE_INDEXING_REQUEST_DELAY_MS / 1000)

    logger.info(f"Google Indexing API notified successfully for {notified} listing URLs")


def get_google_search_console_session():
    if not GOOGLE_URL_INSPECTION_ENABLED:
        return None

    try:
        from google.oauth2 import service_account
        from google.auth.transport.requests import AuthorizedSession
    except Exception as e:
        raise RuntimeError(
            "google-auth not installed; add it to the importer venv before enabling URL Inspection API"
        ) from e

    info = None
    if GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON:
        try:
            info = json.loads(GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON)
        except Exception as e:
            raise RuntimeError(f"Invalid GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON: {str(e)}")

    if info is None and GOOGLE_INDEXING_SERVICE_ACCOUNT_FILE:
        if not os.path.exists(GOOGLE_INDEXING_SERVICE_ACCOUNT_FILE):
            raise RuntimeError(
                f"GOOGLE_INDEXING_SERVICE_ACCOUNT_FILE not found: {GOOGLE_INDEXING_SERVICE_ACCOUNT_FILE}"
            )
        credentials = service_account.Credentials.from_service_account_file(
            GOOGLE_INDEXING_SERVICE_ACCOUNT_FILE,
            scopes=GOOGLE_URL_INSPECTION_SCOPES,
        )
        return AuthorizedSession(credentials)

    if info is not None:
        credentials = service_account.Credentials.from_service_account_info(
            info,
            scopes=GOOGLE_URL_INSPECTION_SCOPES,
        )
        return AuthorizedSession(credentials)

    raise RuntimeError(
        "URL Inspection API enabled but no service account configured "
        "(set GOOGLE_INDEXING_SERVICE_ACCOUNT_FILE or GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON)"
    )


def build_google_url_inspection_urls(channels_data: List[Dict]) -> List[Tuple[str, str, str]]:
    return build_google_head_target_rows(channels_data)


def extract_rich_result_types(inspection_result: Dict[str, Any]) -> List[str]:
    rich = inspection_result.get('richResultsResult') or {}
    detected = rich.get('detectedItems') or []
    result: List[str] = []
    for item in detected:
        rich_type = str(item.get('richResultType') or '').strip()
        if rich_type and rich_type not in result:
            result.append(rich_type)
    return result


def write_url_inspection_report(payload: Dict[str, Any]) -> str:
    public_dir = get_public_dir()
    report_dir = os.path.join(public_dir, 'search-console')
    history_dir = os.path.join(report_dir, 'history')
    os.makedirs(history_dir, exist_ok=True)

    latest_path = os.path.join(report_dir, 'url-inspection-latest.json')
    stamp = datetime.now(TIMEZONE).strftime('%Y-%m-%dT%H-%M-%S')
    history_path = os.path.join(history_dir, f'url-inspection-{stamp}.json')

    content = json.dumps(payload, ensure_ascii=False, indent=2)
    with open(latest_path, 'w', encoding='utf-8') as f:
        f.write(content + '\n')
    with open(history_path, 'w', encoding='utf-8') as f:
        f.write(content + '\n')
    return latest_path


def write_search_console_performance_report(payload: Dict[str, Any]) -> str:
    public_dir = get_public_dir()
    report_path = os.path.join(public_dir, GOOGLE_SEARCH_ANALYTICS_REPORT_RELATIVE_PATH.lstrip('/'))
    history_dir = os.path.join(os.path.dirname(report_path), 'history')
    os.makedirs(history_dir, exist_ok=True)

    stamp = datetime.now(TIMEZONE).strftime('%Y-%m-%dT%H-%M-%S')
    history_path = os.path.join(history_dir, f'search-performance-{stamp}.json')
    content = json.dumps(payload, ensure_ascii=False, indent=2)

    with open(report_path, 'w', encoding='utf-8') as f:
        f.write(content + '\n')
    with open(history_path, 'w', encoding='utf-8') as f:
        f.write(content + '\n')
    return report_path


def _google_search_analytics_endpoint() -> str:
    return GOOGLE_SEARCH_ANALYTICS_ENDPOINT_TEMPLATE.format(
        site_url=quote(GOOGLE_URL_INSPECTION_SITE_URL, safe=''),
    )


def _search_console_query(
    session,
    *,
    start_date: date,
    end_date: date,
    dimensions: Optional[List[str]] = None,
    row_limit: int = 100,
    filters: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        'startDate': start_date.isoformat(),
        'endDate': end_date.isoformat(),
        'rowLimit': int(row_limit),
    }
    if dimensions:
        payload['dimensions'] = dimensions
    if filters:
        payload['dimensionFilterGroups'] = [{'groupType': 'and', 'filters': filters}]

    response = session.post(
        _google_search_analytics_endpoint(),
        json=payload,
        timeout=GOOGLE_SEARCH_ANALYTICS_TIMEOUT,
    )
    if response.status_code != 200:
        raise RuntimeError(f"{response.status_code}: {response.text[:400]}")
    return response.json() or {}


def _extract_metrics(row: Optional[Dict[str, Any]]) -> Dict[str, float]:
    row = row or {}
    return {
        'clicks': float(row.get('clicks') or 0.0),
        'impressions': float(row.get('impressions') or 0.0),
        'ctr': float(row.get('ctr') or 0.0),
        'position': float(row.get('position') or 0.0),
    }


def _extract_search_console_response_metrics(payload: Optional[Dict[str, Any]]) -> Dict[str, float]:
    payload = payload or {}
    rows = payload.get('rows') or []
    if rows:
        return _extract_metrics(rows[0] if isinstance(rows[0], dict) else None)
    return _extract_metrics(payload)


def _build_delta(current: float, previous: float) -> Optional[float]:
    if previous == 0:
        return None if current == 0 else 100.0
    return round(((current - previous) / previous) * 100.0, 2)


def _normalize_text(value: Any) -> str:
    text = str(value or '').strip().lower()
    text = unicodedata.normalize('NFKD', text)
    return ''.join(char for char in text if not unicodedata.combining(char))


def _extract_google_service_account_info() -> Optional[Dict[str, Any]]:
    if GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON:
        try:
            return json.loads(GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON)
        except Exception as exc:
            raise RuntimeError(f"Invalid GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON: {str(exc)}")
    return None


def _build_google_authorized_session(scopes: List[str], *, feature_label: str):
    try:
        from google.oauth2 import service_account
        from google.auth.transport.requests import AuthorizedSession
    except Exception as exc:
        raise RuntimeError(
            f"google-auth not installed; add it to the importer venv before enabling {feature_label}"
        ) from exc

    info = _extract_google_service_account_info()
    if info is None and GOOGLE_INDEXING_SERVICE_ACCOUNT_FILE:
        if not os.path.exists(GOOGLE_INDEXING_SERVICE_ACCOUNT_FILE):
            raise RuntimeError(
                f"GOOGLE_INDEXING_SERVICE_ACCOUNT_FILE not found: {GOOGLE_INDEXING_SERVICE_ACCOUNT_FILE}"
            )
        credentials = service_account.Credentials.from_service_account_file(
            GOOGLE_INDEXING_SERVICE_ACCOUNT_FILE,
            scopes=scopes,
        )
        return AuthorizedSession(credentials)

    if info is not None:
        credentials = service_account.Credentials.from_service_account_info(
            info,
            scopes=scopes,
        )
        return AuthorizedSession(credentials)

    raise RuntimeError(
        f"{feature_label} enabled but no service account configured "
        "(set GOOGLE_INDEXING_SERVICE_ACCOUNT_FILE or GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON)"
    )


def get_google_analytics_session():
    if not GA4_ANALYTICS_ENABLED:
        return None
    return _build_google_authorized_session(GA4_SCOPES, feature_label='Google Analytics Data API')


def _discover_ga4_property(channel_session) -> Dict[str, Any]:
    hostname = (urlparse(SITEMAP_DOMAIN).hostname or '').strip().lower()
    display_name_hint = _normalize_text(GA4_PROPERTY_DISPLAY_NAME)
    measurement_hint = GA4_MEASUREMENT_ID.strip().upper()

    if GA4_PROPERTY_ID:
        result = {
            'status': 'configured',
            'propertyId': GA4_PROPERTY_ID,
            'displayName': GA4_PROPERTY_DISPLAY_NAME or None,
            'measurementId': measurement_hint or None,
            'defaultUri': None,
            'matchedBy': 'env',
        }
        try:
            streams_response = channel_session.get(
                GA4_DATA_STREAMS_ENDPOINT_TEMPLATE.format(property_id=GA4_PROPERTY_ID),
                timeout=GA4_TIMEOUT,
            )
            if streams_response.status_code == 200:
                for stream in (streams_response.json() or {}).get('dataStreams') or []:
                    web_stream = stream.get('webStreamData') or {}
                    result['measurementId'] = web_stream.get('measurementId') or result['measurementId']
                    result['defaultUri'] = web_stream.get('defaultUri') or result['defaultUri']
                    result['displayName'] = stream.get('displayName') or result['displayName']
                    if result['measurementId'] or result['defaultUri']:
                        break
        except Exception:
            pass
        return result

    if not GA4_DISCOVERY_ENABLED:
        return {
            'status': 'disabled',
            'propertyId': None,
            'displayName': None,
            'measurementId': measurement_hint or None,
            'defaultUri': None,
            'matchedBy': None,
            'error': 'GA4 property discovery disabled and no GA4_PROPERTY_ID configured.',
        }

    response = channel_session.get(GA4_ACCOUNT_SUMMARIES_ENDPOINT, timeout=GA4_TIMEOUT)
    if response.status_code != 200:
        raise RuntimeError(f"{response.status_code}: {response.text[:400]}")

    candidates: List[Dict[str, Any]] = []
    for account in (response.json() or {}).get('accountSummaries') or []:
        for property_summary in account.get('propertySummaries') or []:
            property_name = str(property_summary.get('property') or '')
            property_id = property_name.split('/')[-1] if property_name else ''
            if not property_id:
                continue

            score = 0
            display_name = str(property_summary.get('displayName') or '').strip()
            normalized_display = _normalize_text(display_name)
            matched_by: List[str] = []

            if display_name_hint and normalized_display == display_name_hint:
                score += 40
                matched_by.append('display_name')
            elif display_name_hint and display_name_hint in normalized_display:
                score += 25
                matched_by.append('display_name_partial')

            try:
                streams_response = channel_session.get(
                    GA4_DATA_STREAMS_ENDPOINT_TEMPLATE.format(property_id=property_id),
                    timeout=GA4_TIMEOUT,
                )
            except Exception:
                streams_response = None

            measurement_id = None
            default_uri = None
            if streams_response is not None and streams_response.status_code == 200:
                for stream in (streams_response.json() or {}).get('dataStreams') or []:
                    web_stream = stream.get('webStreamData') or {}
                    current_measurement = str(web_stream.get('measurementId') or '').strip().upper()
                    current_default_uri = str(web_stream.get('defaultUri') or '').strip()
                    current_host = (urlparse(current_default_uri).hostname or '').strip().lower()
                    if measurement_hint and current_measurement == measurement_hint:
                        score += 120
                        measurement_id = current_measurement
                        default_uri = current_default_uri
                        matched_by.append('measurement_id')
                        break
                    if hostname and current_host == hostname:
                        score += 100
                        measurement_id = current_measurement or measurement_id
                        default_uri = current_default_uri or default_uri
                        matched_by.append('default_uri')
                        break
                    if not measurement_id and current_measurement:
                        measurement_id = current_measurement
                    if not default_uri and current_default_uri:
                        default_uri = current_default_uri

            candidates.append({
                'propertyId': property_id,
                'displayName': display_name or None,
                'measurementId': measurement_id or None,
                'defaultUri': default_uri or None,
                'score': score,
                'matchedBy': ','.join(matched_by) if matched_by else None,
            })

    candidates.sort(key=lambda item: (item.get('score') or 0, bool(item.get('defaultUri')), bool(item.get('measurementId'))), reverse=True)
    best = candidates[0] if candidates and (candidates[0].get('score') or 0) > 0 else None
    if best:
        return {
            'status': 'discovered',
            **best,
        }
    return {
        'status': 'not_found',
        'propertyId': None,
        'displayName': None,
        'measurementId': measurement_hint or None,
        'defaultUri': None,
        'matchedBy': None,
        'error': f'No GA4 property matched hostname "{hostname}" or configured hints.',
    }


def _ga4_report_endpoint(property_id: str) -> str:
    return GA4_DATA_ENDPOINT_TEMPLATE.format(property_id=property_id)


def _extract_ga4_metrics(row: Optional[Dict[str, Any]]) -> Dict[str, float]:
    if not row:
        return {
            'screenPageViews': 0.0,
            'sessions': 0.0,
            'activeUsers': 0.0,
            'engagedSessions': 0.0,
            'engagementRate': 0.0,
            'averageSessionDuration': 0.0,
        }
    values = [value.get('value') for value in (row.get('metricValues') or [])]
    parsed: List[float] = []
    for value in values:
        try:
            parsed.append(float(value or 0.0))
        except Exception:
            parsed.append(0.0)
    while len(parsed) < 6:
        parsed.append(0.0)
    return {
        'screenPageViews': parsed[0],
        'sessions': parsed[1],
        'activeUsers': parsed[2],
        'engagedSessions': parsed[3],
        'engagementRate': parsed[4],
        'averageSessionDuration': parsed[5],
    }


def _ga4_query(
    session,
    *,
    property_id: str,
    start_date: date,
    end_date: date,
    paths: List[str],
    limit: int = 100,
) -> Dict[str, Any]:
    payload = {
        'dateRanges': [{'startDate': start_date.isoformat(), 'endDate': end_date.isoformat()}],
        'dimensions': [{'name': 'pagePath'}],
        'metrics': [
            {'name': 'screenPageViews'},
            {'name': 'sessions'},
            {'name': 'activeUsers'},
            {'name': 'engagedSessions'},
            {'name': 'engagementRate'},
            {'name': 'averageSessionDuration'},
        ],
        'keepEmptyRows': True,
        'limit': str(limit),
    }
    normalized_paths = [path for path in paths if path]
    if normalized_paths:
        payload['dimensionFilter'] = {
            'filter': {
                'fieldName': 'pagePath',
                'inListFilter': {
                    'values': normalized_paths,
                    'caseSensitive': False,
                },
            },
        }

    response = session.post(
        _ga4_report_endpoint(property_id),
        json=payload,
        timeout=GA4_TIMEOUT,
    )
    if response.status_code != 200:
        raise RuntimeError(f"{response.status_code}: {response.text[:500]}")
    return response.json() or {}


def _build_seo_actions(
    active_rows: List[Dict[str, Any]],
    reserve_rows: List[Dict[str, Any]],
    inspection_summary: Dict[str, Dict[str, Any]],
    rotation_info: Dict[str, Any],
    ga4_available: bool,
) -> Dict[str, List[Dict[str, Any]]]:
    force_index: List[Dict[str, Any]] = []
    link_building: List[Dict[str, Any]] = []
    watchlist: List[Dict[str, Any]] = []
    next_candidates: List[Dict[str, Any]] = []

    def _inspection_for(url: str) -> Dict[str, Any]:
        return inspection_summary.get(url, {})

    stable_active_rows: List[Dict[str, Any]] = []

    for row in active_rows:
        inspection = _inspection_for(row['url'])
        ga4_current = (row.get('ga4') or {}).get('current') or {}
        gsc_current = row.get('current') or {}
        indexed = bool(inspection.get('currentIndexed'))
        stable = bool(inspection.get('stableIndexed'))
        if stable:
            stable_active_rows.append(row)
        sessions = float(ga4_current.get('sessions') or 0.0)
        engagement_rate = float(ga4_current.get('engagementRate') or 0.0)
        avg_duration = float(ga4_current.get('averageSessionDuration') or 0.0)
        impressions = float(gsc_current.get('impressions') or 0.0)
        clicks = float(gsc_current.get('clicks') or 0.0)
        ctr = float(gsc_current.get('ctr') or 0.0)

        if not stable and (sessions >= 8 or impressions >= 20 or clicks >= 2):
            force_index.append({
                'slug': row['slug'],
                'label': row['label'],
                'url': row['url'],
                'priority': round((sessions * 3) + impressions + (clicks * 15), 2),
                'reason': (
                    f'URL encore non stabilisée chez Google, mais déjà {int(round(sessions))} sessions GA4 '
                    f'et {int(round(impressions))} impressions Search Console sur 7 jours.'
                    if ga4_available else
                    f'URL encore non stabilisée chez Google avec {int(round(impressions))} impressions '
                    f'et {int(round(clicks))} clics Search Console sur 7 jours.'
                ),
                'action': 'force_index',
            })
        elif stable and (
            ((engagement_rate >= 0.45 or avg_duration >= 60.0) and (impressions < 120 or ctr < 0.04))
            or (not ga4_available and impressions >= 50 and ctr < 0.03)
        ):
            link_building.append({
                'slug': row['slug'],
                'label': row['label'],
                'url': row['url'],
                'priority': round(((sessions if ga4_available else impressions / 5.0) * 2) + (max(0.0, 0.06 - ctr) * 1000), 2),
                'reason': (
                    f'Page déjà indexée et bien consommée ({int(round(sessions))} sessions, '
                    f'{round(engagement_rate * 100, 1)}% d’engagement), mais encore sous-exposée '
                    f'côté search ({int(round(impressions))} impressions, CTR {round(ctr * 100, 2)}%).'
                    if ga4_available else
                    f'Page déjà indexée mais encore sous-exposée côté search '
                    f'({int(round(impressions))} impressions, CTR {round(ctr * 100, 2)}%). '
                    f'Augmenter le maillage interne depuis home, hubs et pages chaînes proches.'
                ),
                'action': 'internal_linking',
            })
        elif indexed and impressions >= 120 and clicks >= 8:
            watchlist.append({
                'slug': row['slug'],
                'label': row['label'],
                'url': row['url'],
                'priority': round(clicks + impressions / 10.0, 2),
                'reason': 'Page déjà performante. Maintenir la pression éditoriale et le maillage existant.',
                'action': 'hold',
            })

    for row in reserve_rows:
        ga4_current = (row.get('ga4') or {}).get('current') or {}
        gsc_current = row.get('current') or {}
        sessions = float(ga4_current.get('sessions') or 0.0)
        impressions = float(gsc_current.get('impressions') or 0.0)
        if sessions < 4 and impressions < 10:
            continue
        next_candidates.append({
            'slug': row['slug'],
            'label': row['label'],
            'url': row['url'],
            'priority': round((sessions * 3) + impressions, 2),
            'reason': (
                f'Candidate de rotation avec {int(round(sessions))} sessions GA4 et {int(round(impressions))} impressions Search Console.'
                if ga4_available else
                f'Candidate de rotation avec {int(round(impressions))} impressions Search Console.'
            ),
            'action': 'promote_to_indexing',
        })

    existing_next_slugs = {item['slug'] for item in next_candidates}
    rotation_next = list(rotation_info.get('nextCandidates') or [])
    if stable_active_rows and rotation_next:
        stable_threshold = int(rotation_info.get('stableThresholdDays') or GOOGLE_URL_INSPECTION_STABLE_DAYS)
        reserve_by_slug = {row['slug']: row for row in reserve_rows}
        stable_labels = ', '.join(row['label'] for row in stable_active_rows[:4])
        if len(stable_active_rows) > 4:
            stable_labels = f"{stable_labels}, +{len(stable_active_rows) - 4}"

        for rank, slug in enumerate(rotation_next):
            if slug in existing_next_slugs:
                continue
            row = reserve_by_slug.get(slug)
            if not row:
                continue
            next_candidates.append({
                'slug': row['slug'],
                'label': row['label'],
                'url': row['url'],
                'priority': round(max(1, len(rotation_next) - rank) * 10 + len(stable_active_rows), 2),
                'reason': (
                    f'Candidate de rotation automatique: {len(stable_active_rows)} URL(s) du set actif '
                    f'sont stables depuis au moins {stable_threshold} observations récentes '
                    f'({stable_labels}). À pousser ensuite pour élargir la couverture head.'
                ),
                'action': 'promote_to_indexing',
            })
            existing_next_slugs.add(slug)

    force_index.sort(key=lambda item: item['priority'], reverse=True)
    link_building.sort(key=lambda item: item['priority'], reverse=True)
    watchlist.sort(key=lambda item: item['priority'], reverse=True)
    next_candidates.sort(key=lambda item: item['priority'], reverse=True)

    if not force_index and stable_active_rows and rotation_next:
        stable_threshold = int(rotation_info.get('stableThresholdDays') or GOOGLE_URL_INSPECTION_STABLE_DAYS)
        reserve_by_slug = {row['slug']: row for row in reserve_rows}
        exploratory_count = 0
        for rank, slug in enumerate(rotation_next):
            if exploratory_count >= GOOGLE_HEAD_EXPLORATORY_FORCE_INDEX_LIMIT:
                break
            row = reserve_by_slug.get(slug)
            if not row:
                continue
            gsc_current = row.get('current') or {}
            ga4_current = (row.get('ga4') or {}).get('current') or {}
            impressions = float(gsc_current.get('impressions') or 0.0)
            sessions = float(ga4_current.get('sessions') or 0.0)
            force_index.append({
                'slug': row['slug'],
                'label': row['label'],
                'url': row['url'],
                'priority': round(40 + max(0, GOOGLE_HEAD_EXPLORATORY_FORCE_INDEX_LIMIT - rank) * 10 + impressions + (sessions * 2), 2),
                'reason': (
                    f'Le set actif est déjà stable ({len(stable_active_rows)} URL stables sur {stable_threshold} observations). '
                    f'Passe cette head en poussée exploratoire dans GSC pour ouvrir la prochaine vague.'
                ),
                'action': 'force_index_exploratory',
            })
            exploratory_count += 1

    force_index.sort(key=lambda item: item['priority'], reverse=True)

    return {
        'forceIndex': force_index[:5],
        'internalLinking': link_building[:5],
        'watchlist': watchlist[:5],
        'nextIndexingCandidates': next_candidates[:5],
        'rotationContext': {
            'activeTargets': rotation_info.get('activeTargets') or [],
            'reserveTargets': rotation_info.get('reserveTargets') or [],
            'nextCandidates': rotation_info.get('nextCandidates') or [],
        },
    }


def run_google_search_analytics(channels_data: List[Dict]) -> Optional[str]:
    if not GOOGLE_SEARCH_ANALYTICS_ENABLED or not GOOGLE_URL_INSPECTION_ENABLED:
        logger.info("Google Search Analytics disabled; skipping report")
        return None

    session = get_google_search_console_session()
    if session is None:
        logger.info("Google Search Analytics session unavailable; skipping report")
        return None

    active_target_info = get_active_google_head_channel_targets(channels_data)
    targets = build_google_head_target_rows(channels_data)
    if not targets:
        logger.info("No head URLs selected for Google Search Analytics")
        return None

    reserve_rows: List[Tuple[str, str, str]] = []
    reserve_targets = set(active_target_info.get('reserveTargets') or [])
    seen_reserve: set[str] = set()
    for channel in channels_data:
        channel_id = canonicalize_head_channel_slug(str(channel.get('channel_id') or ''))
        if not channel_id or channel_id not in reserve_targets:
            continue
        channel_url = f"{SITEMAP_DOMAIN}/{channel_id}"
        if channel_url in seen_reserve:
            continue
        seen_reserve.add(channel_url)
        reserve_rows.append((channel_id, str(channel.get('name') or channel_id), channel_url))

    analysis_rows = targets + [row for row in reserve_rows if row[2] not in {item[2] for item in targets}]

    end_date = (datetime.now(TIMEZONE) - timedelta(days=GOOGLE_SEARCH_ANALYTICS_DELAY_DAYS)).date()
    start_date = end_date - timedelta(days=GOOGLE_SEARCH_ANALYTICS_DAYS - 1)
    previous_end_date = start_date - timedelta(days=1)
    previous_start_date = previous_end_date - timedelta(days=GOOGLE_SEARCH_ANALYTICS_DAYS - 1)
    ga4_end_date = (datetime.now(TIMEZONE) - timedelta(days=GA4_DELAY_DAYS)).date()
    ga4_start_date = ga4_end_date - timedelta(days=GA4_DAYS - 1)
    ga4_previous_end_date = ga4_start_date - timedelta(days=1)
    ga4_previous_start_date = ga4_previous_end_date - timedelta(days=GA4_DAYS - 1)

    target_map = {url: {'slug': slug, 'label': label, 'url': url} for slug, label, url in analysis_rows}
    regex_urls = [re.escape(url) for _, _, url in analysis_rows]
    page_regex = f"^({'|'.join(regex_urls)})$" if regex_urls else '^$'

    current_pages = _search_console_query(
        session,
        start_date=start_date,
        end_date=end_date,
        dimensions=['page'],
        row_limit=max(50, len(analysis_rows) + 10),
        filters=[{'dimension': 'page', 'operator': 'includingRegex', 'expression': page_regex}],
    ).get('rows') or []
    previous_pages = _search_console_query(
        session,
        start_date=previous_start_date,
        end_date=previous_end_date,
        dimensions=['page'],
        row_limit=max(50, len(analysis_rows) + 10),
        filters=[{'dimension': 'page', 'operator': 'includingRegex', 'expression': page_regex}],
    ).get('rows') or []
    current_queries = _search_console_query(
        session,
        start_date=start_date,
        end_date=end_date,
        dimensions=['query'],
        row_limit=GOOGLE_SEARCH_ANALYTICS_TOP_QUERIES,
        filters=[{'dimension': 'page', 'operator': 'includingRegex', 'expression': page_regex}],
    ).get('rows') or []
    site_current = _extract_search_console_response_metrics(_search_console_query(
        session,
        start_date=start_date,
        end_date=end_date,
        row_limit=1,
    ))
    site_previous = _extract_search_console_response_metrics(_search_console_query(
        session,
        start_date=previous_start_date,
        end_date=previous_end_date,
        row_limit=1,
    ))

    current_by_page = {str((row.get('keys') or [''])[0]): row for row in current_pages}
    previous_by_page = {str((row.get('keys') or [''])[0]): row for row in previous_pages}

    ga4_state: Dict[str, Any] = {
        'enabled': GA4_ANALYTICS_ENABLED,
        'available': False,
        'property': None,
        'notes': {
            'windowDays': GA4_DAYS,
            'delayDays': GA4_DELAY_DAYS,
            'source': 'Google Analytics Data API',
        },
        'error': None,
    }
    ga4_current_by_path: Dict[str, Dict[str, Any]] = {}
    ga4_previous_by_path: Dict[str, Dict[str, Any]] = {}

    if GA4_ANALYTICS_ENABLED:
        try:
            ga4_session = get_google_analytics_session()
            property_info = _discover_ga4_property(ga4_session)
            ga4_state['property'] = property_info
            property_id = str(property_info.get('propertyId') or '').strip()
            if property_id:
                paths = sorted({
                    urlparse(url).path or '/'
                    for _, _, url in analysis_rows
                })
                ga4_current_rows = _ga4_query(
                    ga4_session,
                    property_id=property_id,
                    start_date=ga4_start_date,
                    end_date=ga4_end_date,
                    paths=paths,
                    limit=max(50, len(paths) + 10),
                ).get('rows') or []
                ga4_previous_rows = _ga4_query(
                    ga4_session,
                    property_id=property_id,
                    start_date=ga4_previous_start_date,
                    end_date=ga4_previous_end_date,
                    paths=paths,
                    limit=max(50, len(paths) + 10),
                ).get('rows') or []
                ga4_current_by_path = {
                    str((row.get('dimensionValues') or [{}])[0].get('value') or ''): row
                    for row in ga4_current_rows
                }
                ga4_previous_by_path = {
                    str((row.get('dimensionValues') or [{}])[0].get('value') or ''): row
                    for row in ga4_previous_rows
                }
                ga4_state['available'] = True
            else:
                ga4_state['error'] = property_info.get('error') or 'GA4 property not found.'
        except Exception as exc:
            ga4_state['error'] = str(exc)

    analysis_target_rows: List[Dict[str, Any]] = []
    for _, _, url in analysis_rows:
        path = urlparse(url).path or '/'
        current_metrics = _extract_metrics(current_by_page.get(url))
        previous_metrics = _extract_metrics(previous_by_page.get(url))
        ga4_current_metrics = _extract_ga4_metrics(ga4_current_by_path.get(path))
        ga4_previous_metrics = _extract_ga4_metrics(ga4_previous_by_path.get(path))
        analysis_target_rows.append({
            **target_map[url],
            'current': current_metrics,
            'previous': previous_metrics,
            'delta': {
                'clicks': _build_delta(current_metrics['clicks'], previous_metrics['clicks']),
                'impressions': _build_delta(current_metrics['impressions'], previous_metrics['impressions']),
                'ctr': _build_delta(current_metrics['ctr'], previous_metrics['ctr']),
                'position': round(current_metrics['position'] - previous_metrics['position'], 2) if previous_metrics['position'] else None,
            },
            'ga4': {
                'path': path,
                'current': ga4_current_metrics,
                'previous': ga4_previous_metrics,
                'delta': {
                    'screenPageViews': _build_delta(ga4_current_metrics['screenPageViews'], ga4_previous_metrics['screenPageViews']),
                    'sessions': _build_delta(ga4_current_metrics['sessions'], ga4_previous_metrics['sessions']),
                    'activeUsers': _build_delta(ga4_current_metrics['activeUsers'], ga4_previous_metrics['activeUsers']),
                    'engagedSessions': _build_delta(ga4_current_metrics['engagedSessions'], ga4_previous_metrics['engagedSessions']),
                    'engagementRate': _build_delta(ga4_current_metrics['engagementRate'], ga4_previous_metrics['engagementRate']),
                    'averageSessionDuration': _build_delta(ga4_current_metrics['averageSessionDuration'], ga4_previous_metrics['averageSessionDuration']),
                },
            },
        })

    active_urls = {row[2] for row in targets}
    target_rows = [row for row in analysis_target_rows if row['url'] in active_urls]
    reserve_target_rows = [row for row in analysis_target_rows if row['url'] not in active_urls]

    total_current = {
        'clicks': round(sum(row['current']['clicks'] for row in target_rows), 2),
        'impressions': round(sum(row['current']['impressions'] for row in target_rows), 2),
        'ctr': round((sum(row['current']['clicks'] for row in target_rows) / sum(row['current']['impressions'] for row in target_rows)), 4)
        if sum(row['current']['impressions'] for row in target_rows) > 0 else 0.0,
        'position': round(sum(row['current']['position'] * row['current']['impressions'] for row in target_rows) / sum(row['current']['impressions'] for row in target_rows), 2)
        if sum(row['current']['impressions'] for row in target_rows) > 0 else 0.0,
    }
    total_previous = {
        'clicks': round(sum(row['previous']['clicks'] for row in target_rows), 2),
        'impressions': round(sum(row['previous']['impressions'] for row in target_rows), 2),
        'ctr': round((sum(row['previous']['clicks'] for row in target_rows) / sum(row['previous']['impressions'] for row in target_rows)), 4)
        if sum(row['previous']['impressions'] for row in target_rows) > 0 else 0.0,
        'position': round(sum(row['previous']['position'] * row['previous']['impressions'] for row in target_rows) / sum(row['previous']['impressions'] for row in target_rows), 2)
        if sum(row['previous']['impressions'] for row in target_rows) > 0 else 0.0,
    }
    total_ga4_current = {
        'screenPageViews': round(sum(row['ga4']['current']['screenPageViews'] for row in target_rows), 2),
        'sessions': round(sum(row['ga4']['current']['sessions'] for row in target_rows), 2),
        'activeUsers': round(sum(row['ga4']['current']['activeUsers'] for row in target_rows), 2),
        'engagedSessions': round(sum(row['ga4']['current']['engagedSessions'] for row in target_rows), 2),
        'engagementRate': round(
            (
                sum(row['ga4']['current']['engagementRate'] * row['ga4']['current']['sessions'] for row in target_rows)
                / sum(row['ga4']['current']['sessions'] for row in target_rows)
            ),
            4,
        ) if sum(row['ga4']['current']['sessions'] for row in target_rows) > 0 else 0.0,
        'averageSessionDuration': round(
            (
                sum(row['ga4']['current']['averageSessionDuration'] * row['ga4']['current']['sessions'] for row in target_rows)
                / sum(row['ga4']['current']['sessions'] for row in target_rows)
            ),
            2,
        ) if sum(row['ga4']['current']['sessions'] for row in target_rows) > 0 else 0.0,
    }
    total_ga4_previous = {
        'screenPageViews': round(sum(row['ga4']['previous']['screenPageViews'] for row in target_rows), 2),
        'sessions': round(sum(row['ga4']['previous']['sessions'] for row in target_rows), 2),
        'activeUsers': round(sum(row['ga4']['previous']['activeUsers'] for row in target_rows), 2),
        'engagedSessions': round(sum(row['ga4']['previous']['engagedSessions'] for row in target_rows), 2),
        'engagementRate': round(
            (
                sum(row['ga4']['previous']['engagementRate'] * row['ga4']['previous']['sessions'] for row in target_rows)
                / sum(row['ga4']['previous']['sessions'] for row in target_rows)
            ),
            4,
        ) if sum(row['ga4']['previous']['sessions'] for row in target_rows) > 0 else 0.0,
        'averageSessionDuration': round(
            (
                sum(row['ga4']['previous']['averageSessionDuration'] * row['ga4']['previous']['sessions'] for row in target_rows)
                / sum(row['ga4']['previous']['sessions'] for row in target_rows)
            ),
            2,
        ) if sum(row['ga4']['previous']['sessions'] for row in target_rows) > 0 else 0.0,
    }
    inspection_summary = active_target_info.get('historySummary') or {}
    recommendations = _build_seo_actions(
        target_rows,
        reserve_target_rows,
        inspection_summary,
        active_target_info,
        ga4_available=bool(ga4_state.get('available')),
    )

    payload = {
        'ok': True,
        'generatedAt': datetime.now(TIMEZONE).isoformat(),
        'siteUrl': GOOGLE_URL_INSPECTION_SITE_URL,
        'source': 'Google Search Console Search Analytics API',
        'notes': {
            'description': 'Trafic search réel des pages head suivies dans Search Console. Fenêtre décalée pour éviter les données encore fraîches et incomplètes.',
            'windowDays': GOOGLE_SEARCH_ANALYTICS_DAYS,
            'delayDays': GOOGLE_SEARCH_ANALYTICS_DELAY_DAYS,
        },
        'period': {
            'current': {'startDate': start_date.isoformat(), 'endDate': end_date.isoformat()},
            'previous': {'startDate': previous_start_date.isoformat(), 'endDate': previous_end_date.isoformat()},
        },
        'summary': {
            'siteCurrent': site_current,
            'sitePrevious': site_previous,
            'headCurrent': total_current,
            'headPrevious': total_previous,
            'ga4Current': total_ga4_current,
            'ga4Previous': total_ga4_previous,
            'headDelta': {
                'clicks': _build_delta(total_current['clicks'], total_previous['clicks']),
                'impressions': _build_delta(total_current['impressions'], total_previous['impressions']),
                'ctr': _build_delta(total_current['ctr'], total_previous['ctr']),
                'position': round(total_current['position'] - total_previous['position'], 2) if total_previous['position'] else None,
            },
            'ga4Delta': {
                'screenPageViews': _build_delta(total_ga4_current['screenPageViews'], total_ga4_previous['screenPageViews']),
                'sessions': _build_delta(total_ga4_current['sessions'], total_ga4_previous['sessions']),
                'activeUsers': _build_delta(total_ga4_current['activeUsers'], total_ga4_previous['activeUsers']),
                'engagedSessions': _build_delta(total_ga4_current['engagedSessions'], total_ga4_previous['engagedSessions']),
                'engagementRate': _build_delta(total_ga4_current['engagementRate'], total_ga4_previous['engagementRate']),
                'averageSessionDuration': _build_delta(total_ga4_current['averageSessionDuration'], total_ga4_previous['averageSessionDuration']),
            },
        },
        'ga4': {
            **ga4_state,
            'period': {
                'current': {'startDate': ga4_start_date.isoformat(), 'endDate': ga4_end_date.isoformat()},
                'previous': {'startDate': ga4_previous_start_date.isoformat(), 'endDate': ga4_previous_end_date.isoformat()},
            },
            'topPages': sorted(
                [
                    row for row in target_rows
                    if (row.get('ga4') or {}).get('current', {}).get('sessions', 0) > 0
                ],
                key=lambda item: (
                    item['ga4']['current']['sessions'],
                    item['ga4']['current']['engagedSessions'],
                    item['ga4']['current']['screenPageViews'],
                ),
                reverse=True,
            )[:GA4_TOP_PAGES],
        },
        'topQueries': [
            {
                'query': str((row.get('keys') or [''])[0]),
                'clicks': float(row.get('clicks') or 0.0),
                'impressions': float(row.get('impressions') or 0.0),
                'ctr': float(row.get('ctr') or 0.0),
                'position': float(row.get('position') or 0.0),
            }
            for row in current_queries
            if (row.get('keys') or [''])[0]
        ],
        'targets': sorted(target_rows, key=lambda item: (item['current']['clicks'], item['current']['impressions']), reverse=True),
        'reserveCandidates': sorted(
            reserve_target_rows,
            key=lambda item: (
                item['ga4']['current']['sessions'],
                item['current']['impressions'],
                item['current']['clicks'],
            ),
            reverse=True,
        )[:8],
        'insights': recommendations,
    }
    report_path = write_search_console_performance_report(payload)
    logger.info(f"Google Search Analytics report written: {report_path} ({len(target_rows)} URLs)")
    return report_path


def get_supabase_project_ref() -> Optional[str]:
    if SUPABASE_PROJECT_REF:
        return SUPABASE_PROJECT_REF
    supabase_url = os.getenv('SUPABASE_URL', '').strip()
    if not supabase_url:
        return None
    try:
        host = urlparse(supabase_url).hostname or ''
    except Exception:
        host = ''
    if not host:
        return None
    match = re.match(r'^([a-z0-9-]+)\.supabase\.co$', host)
    if match:
        return match.group(1)
    return None


def write_supabase_usage_report(payload: Dict[str, Any]) -> str:
    public_dir = get_public_dir()
    report_path = os.path.join(public_dir, SUPABASE_USAGE_REPORT_RELATIVE_PATH.lstrip('/'))
    history_dir = os.path.join(os.path.dirname(report_path), 'history')
    os.makedirs(history_dir, exist_ok=True)

    stamp = datetime.now(TIMEZONE).strftime('%Y-%m-%dT%H-%M-%S')
    history_path = os.path.join(history_dir, f'supabase-usage-{stamp}.json')
    content = json.dumps(payload, ensure_ascii=False, indent=2)

    with open(report_path, 'w', encoding='utf-8') as f:
        f.write(content + '\n')
    with open(history_path, 'w', encoding='utf-8') as f:
        f.write(content + '\n')
    return report_path


def query_pg_one(pg, sql_query: str, params: Optional[Tuple[Any, ...]] = None) -> Tuple[Any, ...]:
    with pg.cursor() as cur:
        cur.execute(sql_query, params or ())
        row = cur.fetchone()
    return row or tuple()


def query_pg_all(pg, sql_query: str, params: Optional[Tuple[Any, ...]] = None) -> List[Tuple[Any, ...]]:
    with pg.cursor() as cur:
        cur.execute(sql_query, params or ())
        rows = cur.fetchall()
    return rows or []


def table_exists(pg, table_name: str, schema_name: str = 'public') -> bool:
    row = query_pg_one(
        pg,
        "SELECT to_regclass(%s)",
        (f'{schema_name}.{table_name}',),
    )
    return bool(row and row[0])


def build_table_size_rows(pg, limit: int = 15) -> List[Dict[str, Any]]:
    rows = query_pg_all(
        pg,
        """
        SELECT
          n.nspname AS schema_name,
          c.relname AS table_name,
          c.reltuples::bigint AS row_estimate,
          pg_total_relation_size(c.oid) AS total_bytes,
          pg_relation_size(c.oid) AS table_bytes,
          pg_indexes_size(c.oid) AS index_bytes,
          GREATEST(pg_total_relation_size(c.oid) - pg_relation_size(c.oid) - pg_indexes_size(c.oid), 0) AS toast_bytes
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r'
          AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY pg_total_relation_size(c.oid) DESC
        LIMIT %s
        """,
        (int(limit),),
    )
    result: List[Dict[str, Any]] = []
    for schema_name, table_name, row_estimate, total_bytes, table_bytes, index_bytes, toast_bytes in rows:
        result.append({
            'schema': schema_name,
            'table': table_name,
            'rowEstimate': int(row_estimate or 0),
            'totalBytes': int(total_bytes or 0),
            'tableBytes': int(table_bytes or 0),
            'indexBytes': int(index_bytes or 0),
            'toastBytes': int(toast_bytes or 0),
        })
    return result


def build_key_table_metrics(pg) -> List[Dict[str, Any]]:
    retention_cutoff = datetime.now(TIMEZONE) - timedelta(days=RETENTION_DAYS)
    targets: List[Tuple[str, str, bool]] = [
        ('public', PROGRAMS_TABLE, True),
        ('public', 'programs_de', True),
        ('public', CHANNELS_TABLE, False),
        ('public', IMPORT_STATUS_TABLE, False),
        ('public', 'birthday_articles', False),
        ('public', 'social_posts_log', False),
        ('storage', 'objects', False),
    ]
    metrics: List[Dict[str, Any]] = []

    for schema_name, table_name, include_time_span in targets:
        if not table_exists(pg, table_name, schema_name):
            continue

        size_row = query_pg_one(
            pg,
            f"""
            SELECT
              COUNT(*)::bigint,
              pg_total_relation_size(%s::regclass),
              pg_relation_size(%s::regclass),
              pg_indexes_size(%s::regclass)
            FROM {schema_name}.{table_name}
            """,
            (f'{schema_name}.{table_name}', f'{schema_name}.{table_name}', f'{schema_name}.{table_name}'),
        )
        count_value = int(size_row[0] or 0) if size_row else 0
        total_bytes = int(size_row[1] or 0) if len(size_row) > 1 else 0
        table_bytes = int(size_row[2] or 0) if len(size_row) > 2 else 0
        index_bytes = int(size_row[3] or 0) if len(size_row) > 3 else 0

        oldest_start = None
        newest_start = None
        older_than_retention = None
        if include_time_span and table_exists(pg, table_name, schema_name):
            time_row = query_pg_one(
                pg,
                f"""
                SELECT
                  MIN(start_time),
                  MAX(start_time),
                  COUNT(*) FILTER (WHERE start_time < %s)::bigint
                FROM {schema_name}.{table_name}
                """,
                (retention_cutoff.isoformat(),),
            )
            if time_row:
                oldest_start = time_row[0].isoformat() if time_row[0] else None
                newest_start = time_row[1].isoformat() if time_row[1] else None
                older_than_retention = int(time_row[2] or 0)

        metrics.append({
            'schema': schema_name,
            'table': table_name,
            'rowsExact': count_value,
            'totalBytes': total_bytes,
            'tableBytes': table_bytes,
            'indexBytes': index_bytes,
            'oldestStart': oldest_start,
            'newestStart': newest_start,
            'olderThanRetention': older_than_retention,
        })

    return metrics


def build_storage_metrics(pg) -> Dict[str, Any]:
    if not table_exists(pg, 'objects', 'storage'):
        return {
            'available': False,
            'objects': 0,
            'bytes': 0,
            'buckets': [],
        }

    rows = query_pg_all(
        pg,
        """
        SELECT
          bucket_id,
          COUNT(*)::bigint AS object_count,
          COALESCE(SUM(COALESCE(NULLIF(metadata->>'size', '')::bigint, 0)), 0)::bigint AS total_bytes
        FROM storage.objects
        GROUP BY bucket_id
        ORDER BY total_bytes DESC, object_count DESC
        """,
    )
    buckets: List[Dict[str, Any]] = []
    total_objects = 0
    total_bytes = 0
    for bucket_id, object_count, bucket_bytes in rows:
        object_count_int = int(object_count or 0)
        bucket_bytes_int = int(bucket_bytes or 0)
        total_objects += object_count_int
        total_bytes += bucket_bytes_int
        buckets.append({
            'bucketId': bucket_id,
            'objects': object_count_int,
            'bytes': bucket_bytes_int,
        })
    return {
        'available': True,
        'objects': total_objects,
        'bytes': total_bytes,
        'buckets': buckets,
    }


def run_supabase_usage_report() -> str:
    database_url = os.getenv('DATABASE_URL', '').strip()
    if not database_url:
        raise RuntimeError('DATABASE_URL requis pour générer le rapport usage Supabase')

    pg = create_postgres_client(database_url)
    try:
        database_name, database_bytes = query_pg_one(
            pg,
            "SELECT current_database(), pg_database_size(current_database())"
        )
        project_ref = get_supabase_project_ref()
        table_sizes = build_table_size_rows(pg, limit=20)
        key_tables = build_key_table_metrics(pg)
        storage_metrics = build_storage_metrics(pg)

        database_bytes_int = int(database_bytes or 0)
        database_usage_percent = round((database_bytes_int / SUPABASE_DB_LIMIT_BYTES) * 100, 2) if SUPABASE_DB_LIMIT_BYTES else None

        payload = {
            'ok': True,
            'generatedAt': datetime.now(TIMEZONE).isoformat(),
            'source': 'Direct PostgreSQL metrics via DATABASE_URL',
            'projectRef': project_ref,
            'database': {
                'name': database_name,
                'currentBytes': database_bytes_int,
                'limitBytes': SUPABASE_DB_LIMIT_BYTES,
                'usagePercent': database_usage_percent,
                'overLimit': bool(database_bytes_int > SUPABASE_DB_LIMIT_BYTES),
            },
            'egress': {
                'available': False,
                'currentBytes': None,
                'limitBytes': SUPABASE_EGRESS_LIMIT_BYTES,
                'usagePercent': None,
                'detail': (
                    'Quota egress Supabase non disponible via DATABASE_URL. '
                    'Ajoute un flux Management/API dédié si tu veux l’exposer ici.'
                ),
            },
            'storage': storage_metrics,
            'summary': {
                'topTableBytes': int(table_sizes[0]['totalBytes']) if table_sizes else 0,
                'topTableName': f"{table_sizes[0]['schema']}.{table_sizes[0]['table']}" if table_sizes else None,
                'tableCount': len(table_sizes),
            },
            'notes': {
                'description': 'Vue de contrôle DB/storage pour garder un œil sur la taille réelle du projet Supabase et les tables qui grossissent.',
                'managementApiConfigured': bool(SUPABASE_MANAGEMENT_TOKEN and project_ref),
                'egressRequiresManagementApi': True,
                'retentionDays': RETENTION_DAYS,
            },
            'topTables': table_sizes,
            'keyTables': key_tables,
        }
        report_path = write_supabase_usage_report(payload)
        logger.info(f"Supabase usage report written: {report_path}")
        return report_path
    finally:
        try:
            pg.close()
        except Exception:
            pass


def run_entity_airings_refresh() -> str:
    if not ENTITY_AIRINGS_REFRESH_ENABLED:
        logger.info("Entity airings refresh disabled; skipping")
        return 'disabled'

    script_candidates = [
        ENTITY_AIRINGS_SCRIPT_PATH,
        os.path.abspath(os.path.join(os.path.dirname(__file__), 'update_entity_airings.py')),
        os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend', 'scripts', 'update_entity_airings.py')),
    ]
    script_path = next((candidate for candidate in script_candidates if candidate and os.path.exists(candidate)), '')
    if not script_path:
        raise RuntimeError(f"update_entity_airings.py introuvable: {script_path}")

    entities_dir_candidates = [
        ENTITY_AIRINGS_DIR,
        os.path.join(get_public_dir(), 'entities-data'),
        os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend', 'public', 'entities-data')),
    ]
    entities_dir = next((candidate for candidate in entities_dir_candidates if candidate and os.path.isdir(candidate)), '')
    if not entities_dir:
        entities_dir = entities_dir_candidates[-1]
    env_file = ENTITY_AIRINGS_ENV_FILE
    cmd = [
        sys.executable,
        script_path,
        f'--entities-dir={entities_dir}',
        f'--horizon-days={ENTITY_AIRINGS_HORIZON_DAYS}',
        f'--past-hours={ENTITY_AIRINGS_PAST_HOURS}',
        f'--max-airings={ENTITY_AIRINGS_MAX}',
    ]
    if env_file:
        cmd.append(f'--env-file={env_file}')

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        cwd=os.path.dirname(script_path) or None,
        check=False,
    )
    output = '\n'.join(part.strip() for part in (result.stdout, result.stderr) if part and part.strip())
    if result.returncode != 0:
        raise RuntimeError(output or f'Exit code {result.returncode}')

    meta_path = os.path.join(entities_dir, 'airings-sync-meta.json')
    logger.info(f"Entity airings refresh completed: {output or meta_path}")
    return meta_path


def run_google_url_inspection(channels_data: List[Dict]) -> Optional[str]:
    if not GOOGLE_URL_INSPECTION_ENABLED:
        logger.info("Google URL Inspection API disabled; skipping inspection")
        return None

    targets = build_google_url_inspection_urls(channels_data)
    if not targets:
        logger.info("No head channel URLs selected for Google URL Inspection")
        return None

    session = get_google_search_console_session()
    if session is None:
        logger.info("Google URL Inspection session unavailable; skipping inspection")
        return None

    inspected_at = datetime.now(TIMEZONE).isoformat()
    results: List[Dict[str, Any]] = []
    active_target_info = get_active_google_head_channel_targets(channels_data)
    recent_history = active_target_info.get('historySummary') or {}

    for channel_slug, channel_name, url in targets:
        payload = {
            'inspectionUrl': url,
            'siteUrl': GOOGLE_URL_INSPECTION_SITE_URL,
            'languageCode': GOOGLE_URL_INSPECTION_LANGUAGE_CODE,
        }
        try:
            response = session.post(
                GOOGLE_URL_INSPECTION_ENDPOINT,
                json=payload,
                timeout=GOOGLE_URL_INSPECTION_TIMEOUT,
            )
            if response.status_code != 200:
                raise RuntimeError(f"{response.status_code}: {response.text[:400]}")
            data = response.json()
            inspection = data.get('inspectionResult') or {}
            index_status = inspection.get('indexStatusResult') or {}
            mobile = inspection.get('mobileUsabilityResult') or {}
            rich = inspection.get('richResultsResult') or {}
            results.append({
                'channelSlug': channel_slug,
                'channelName': channel_name,
                'url': url,
                'status': 'ok',
                'inspectionResultLink': inspection.get('inspectionResultLink'),
                'verdict': index_status.get('verdict'),
                'coverageState': index_status.get('coverageState'),
                'indexingState': index_status.get('indexingState'),
                'lastCrawlTime': index_status.get('lastCrawlTime'),
                'pageFetchState': index_status.get('pageFetchState'),
                'robotsTxtState': index_status.get('robotsTxtState'),
                'googleCanonical': index_status.get('googleCanonical'),
                'userCanonical': index_status.get('userCanonical'),
                'referringUrls': index_status.get('referringUrls') or [],
                'crawledAs': index_status.get('crawledAs'),
                'mobileUsabilityVerdict': mobile.get('verdict'),
                'richResultsVerdict': rich.get('verdict'),
                'richResultTypes': extract_rich_result_types(inspection),
                'history7d': recent_history.get(url) or {
                    'observedDays': 0,
                    'indexedDays': 0,
                    'latestSeenAt': None,
                    'latestIndexedAt': None,
                    'currentIndexed': False,
                    'stableIndexed': False,
                    'recentStatuses': [],
                },
            })
        except Exception as e:
            results.append({
                'channelSlug': channel_slug,
                'channelName': channel_name,
                'url': url,
                'status': 'error',
                'error': str(e),
                'history7d': recent_history.get(url) or {
                    'observedDays': 0,
                    'indexedDays': 0,
                    'latestSeenAt': None,
                    'latestIndexedAt': None,
                    'currentIndexed': False,
                    'stableIndexed': False,
                    'recentStatuses': [],
                },
            })

    pass_count = sum(1 for item in results if item.get('status') == 'ok' and item.get('verdict') == 'PASS')
    fresh_count = sum(1 for item in results if item.get('status') == 'ok' and item.get('lastCrawlTime'))
    stable_count = sum(1 for item in results if (item.get('history7d') or {}).get('stableIndexed'))
    payload = {
        'ok': True,
        'generatedAt': inspected_at,
        'siteUrl': GOOGLE_URL_INSPECTION_SITE_URL,
        'source': 'Google Search Console URL Inspection API',
        'notes': {
            'indexedVersionOnly': True,
            'dailyQuotaPerProperty': 2000,
            'perMinuteQuotaPerProperty': 600,
            'description': "The API reports Google’s indexed view of a URL, not a live fetch of the current page.",
            'historyWindowDays': GOOGLE_URL_INSPECTION_HISTORY_DAYS,
            'stableThresholdDays': GOOGLE_URL_INSPECTION_STABLE_DAYS,
        },
        'summary': {
            'total': len(results),
            'pass': pass_count,
            'withLastCrawlTime': fresh_count,
            'errors': sum(1 for item in results if item.get('status') == 'error'),
            'stableIndexed': stable_count,
        },
        'rotation': {
            'enabled': bool(active_target_info.get('rotationEnabled')),
            'activeTargets': active_target_info.get('activeTargets') or [],
            'pinnedTargets': active_target_info.get('pinnedTargets') or [],
            'reserveTargets': active_target_info.get('reserveTargets') or [],
            'deferredTargets': active_target_info.get('deferredTargets') or [],
            'nextCandidates': active_target_info.get('nextCandidates') or [],
        },
        'results': results,
    }
    report_path = write_url_inspection_report(payload)
    logger.info(f"Google URL Inspection report written: {report_path} ({len(results)} URLs)")
    return report_path


def ensure_indexnow_key_file(public_dir: str) -> Optional[str]:
    if not INDEXNOW_KEY:
        return None

    if INDEXNOW_KEY_LOCATION:
        return INDEXNOW_KEY_LOCATION

    os.makedirs(public_dir, exist_ok=True)
    filename = f"{INDEXNOW_KEY}.txt"
    path = os.path.join(public_dir, filename)
    if not os.path.exists(path):
        with open(path, 'w', encoding='utf-8') as f:
            f.write(INDEXNOW_KEY)
    return f"{SITEMAP_DOMAIN}/{filename}"


def post_with_backoff(
    url: str,
    *,
    max_retries: int,
    timeout: int,
    retry_statuses: Tuple[int, ...] = (429, 500, 502, 503, 504),
    delay_ms: int = 0,
    **kwargs,
) -> requests.Response:
    last_response: Optional[requests.Response] = None
    last_exception: Optional[Exception] = None
    for attempt in range(max_retries):
        if delay_ms > 0 and attempt > 0:
            time.sleep(delay_ms / 1000)
        try:
            response = requests.post(url, timeout=timeout, **kwargs)
            last_response = response
            last_exception = None
            if response.status_code not in retry_statuses:
                return response
            retry_after = response.headers.get('Retry-After')
            if retry_after:
                try:
                    time.sleep(max(0, float(retry_after)))
                    continue
                except Exception:
                    pass
        except requests.RequestException as exc:
            last_exception = exc
            response = None

        # Exponential backoff with a conservative floor to avoid request bursts.
        sleep_seconds = min(20.0, 0.8 * (2 ** attempt))
        time.sleep(sleep_seconds)

    if last_response is not None:
        return last_response
    if last_exception is not None:
        raise last_exception
    return requests.post(url, timeout=timeout, **kwargs)


def submit_indexnow(urls: List[str], public_dir: str) -> None:
    if not INDEXNOW_ENABLED:
        logger.info("IndexNow disabled; skipping notification")
        return
    if not INDEXNOW_KEY:
        logger.info("IndexNow key missing; skipping notification")
        return
    if not urls:
        logger.info("No URLs to notify via IndexNow")
        return

    key_location = ensure_indexnow_key_file(public_dir)
    host = get_site_host()
    total = 0

    batches = list(chunked(urls, INDEXNOW_BATCH_SIZE))
    for batch_index, batch in enumerate(batches):
        payload: Dict[str, Any] = {
            'host': host,
            'key': INDEXNOW_KEY,
            'urlList': batch,
        }
        if key_location:
            payload['keyLocation'] = key_location

        response = post_with_backoff(
            INDEXNOW_ENDPOINT,
            json=payload,
            headers={'Content-Type': 'application/json; charset=utf-8'},
            timeout=INDEXNOW_TIMEOUT,
            max_retries=INDEXNOW_MAX_RETRIES,
            delay_ms=INDEXNOW_REQUEST_DELAY_MS,
        )
        if response.status_code not in (200, 202):
            raise RuntimeError(
                f"IndexNow rejected batch ({response.status_code}): {response.text[:400]}"
            )
        total += len(batch)
        if INDEXNOW_REQUEST_DELAY_MS > 0 and batch_index < len(batches) - 1:
            time.sleep(INDEXNOW_REQUEST_DELAY_MS / 1000)

    logger.info(f"IndexNow notified successfully for {total} URLs")


def publish_websub(urls: List[str]) -> None:
    if not WEBSUB_ENABLED:
        logger.info("WebSub disabled; skipping publish ping")
        return
    if not WEBSUB_HUB_URLS:
        logger.info("WebSub hub list missing; skipping publish ping")
        return
    if not urls:
        logger.info("No URLs to notify via WebSub")
        return

    total = 0
    successful_hubs = 0
    warnings: List[str] = []

    def is_optional_websub_hub(hub_url: str) -> bool:
        normalized = hub_url.strip().lower()
        return any(pattern in normalized for pattern in WEBSUB_OPTIONAL_HUB_PATTERNS)

    for hub_index, hub_url in enumerate(WEBSUB_HUB_URLS):
        hub_total = 0
        try:
            batches = list(chunked(urls, WEBSUB_TOPIC_BATCH_SIZE))
            for batch_index, batch in enumerate(batches):
                form_payload: List[Tuple[str, str]] = [('hub.mode', 'publish')]
                form_payload.extend(('hub.url', url) for url in batch)
                response = post_with_backoff(
                    hub_url,
                    data=form_payload,
                    headers={'Content-Type': 'application/x-www-form-urlencoded'},
                    timeout=WEBSUB_TIMEOUT,
                    max_retries=WEBSUB_MAX_RETRIES,
                    delay_ms=WEBSUB_REQUEST_DELAY_MS,
                )
                if response.status_code not in (200, 202, 204):
                    raise RuntimeError(
                        f"WebSub hub {hub_url} rejected batch ({response.status_code}): "
                        f"{response.text[:400]}"
                    )
                hub_total += len(batch)
                if WEBSUB_REQUEST_DELAY_MS > 0 and batch_index < len(batches) - 1:
                    time.sleep(WEBSUB_REQUEST_DELAY_MS / 1000)
            total = max(total, hub_total)
            successful_hubs += 1
            logger.info(f"WebSub publish ping sent to {hub_url} for {hub_total} URLs")
        except Exception as exc:
            message = str(exc)
            if is_optional_websub_hub(hub_url):
                logger.warning(f"Optional WebSub hub {hub_url} failed: {message}")
                warnings.append(f"optional hub {hub_url}: {message}")
            else:
                warnings.append(f"hub {hub_url}: {message}")
        if WEBSUB_HUB_DELAY_MS > 0 and hub_index < len(WEBSUB_HUB_URLS) - 1:
            time.sleep(WEBSUB_HUB_DELAY_MS / 1000)

    if successful_hubs == 0:
        warning_summary = '; '.join(warnings) if warnings else 'no hub accepted the publish ping'
        raise RuntimeError(f"WebSub failed on all hubs: {warning_summary}")

    if warnings:
        logger.info(f"WebSub completed with {successful_hubs}/{len(WEBSUB_HUB_URLS)} hubs accepting publish ping")
    logger.info(f"WebSub notified successfully for {total} URLs")


def notify_search_engines(channels_data: List[Dict]) -> None:
    urls = build_notification_urls(channels_data)
    indexnow_urls = build_indexnow_urls(channels_data)
    google_urls = build_google_indexing_urls(channels_data)
    if not urls:
        logger.info("No homepage/channel URLs to notify")
        return

    public_dir = get_public_dir()
    failures: List[str] = []

    try:
        submit_indexnow(indexnow_urls, public_dir)
    except Exception as e:
        failures.append(f"IndexNow: {str(e)}")
        logger.warning(f"IndexNow notification failed: {str(e)}")

    try:
        publish_websub(urls)
    except Exception as e:
        failures.append(f"WebSub: {str(e)}")
        logger.warning(f"WebSub publish failed: {str(e)}")

    try:
        submit_google_indexing(google_urls)
    except Exception as e:
        failures.append(f"Google Indexing API: {str(e)}")
        logger.warning(f"Google Indexing API notification failed: {str(e)}")

    try:
        run_google_url_inspection(channels_data)
    except Exception as e:
        failures.append(f"Google URL Inspection API: {str(e)}")
        logger.warning(f"Google URL Inspection API failed: {str(e)}")

    try:
        run_google_search_analytics(channels_data)
    except Exception as e:
        failures.append(f"Google Search Analytics API: {str(e)}")
        logger.warning(f"Google Search Analytics API failed: {str(e)}")

    if failures:
        logger.warning("Search engine notifications completed with warnings: " + " | ".join(failures))
    else:
        logger.info(f"Search engine notifications completed for {len(urls)} URLs")

# ============================================
# MAIN EXECUTION
# ============================================

def main():
    logger.info("=" * 60)
    logger.info("EPG Importer Started (FR)")
    logger.info("=" * 60)

    run_state = init_import_run_state()

    try:
        ensure_import_status_schema()
        ensure_programs_schema()
        supabase = get_supabase_client()
        persist_import_run_state(supabase, run_state)

        mark_import_step_started(run_state, 'supabase_ready')
        persist_import_run_state(supabase, run_state)
        wait_for_supabase(supabase)
        mark_import_step_completed(run_state, 'supabase_ready', detail='Connexion Supabase OK')
        persist_import_run_state(supabase, run_state)

        mark_import_step_started(run_state, 'fetch_parse')
        persist_import_run_state(supabase, run_state)
        content = fetch_xmltv()
        channels, programs = parse_xmltv(content)
        mark_import_step_completed(
            run_state,
            'fetch_parse',
            detail=f'{len(channels)} chaînes et {len(programs)} programmes détectés',
        )
        persist_import_run_state(supabase, run_state)

        logger.info(f"Found {len(channels)} channels and {len(programs)} programs")

        mark_import_step_started(run_state, 'upsert_channels')
        persist_import_run_state(supabase, run_state)
        channels_processed = upsert_channels(supabase, channels)
        run_state['channelsProcessed'] = channels_processed
        mark_import_step_completed(run_state, 'upsert_channels', detail=f'{channels_processed} chaînes mises à jour')
        persist_import_run_state(supabase, run_state)

        if programs:
            min_start = None
            max_start = None
            for p in programs:
                try:
                    dt = datetime.fromisoformat(p['start'])
                except Exception:
                    continue
                if min_start is None or dt < min_start:
                    min_start = dt
                if max_start is None or dt > max_start:
                    max_start = dt

                if min_start and max_start:
                    min_date_str = min_start.astimezone(TIMEZONE).date().isoformat()
                    max_date_str = max_start.astimezone(TIMEZONE).date().isoformat()
        # Cleanup old data first to free up space
        mark_import_step_started(run_state, 'cleanup_old_programs')
        persist_import_run_state(supabase, run_state)
        programs_deleted = cleanup_old_programs(supabase)
        run_state['programsDeleted'] = programs_deleted
        mark_import_step_completed(run_state, 'cleanup_old_programs', detail=f'{programs_deleted} anciens programmes supprimés')
        persist_import_run_state(supabase, run_state)

        mark_import_step_started(run_state, 'insert_programs')
        persist_import_run_state(supabase, run_state)
        programs_inserted = insert_programs(supabase, programs)
        run_state['programsInserted'] = programs_inserted
        mark_import_step_completed(run_state, 'insert_programs', detail=f'{programs_inserted} programmes insérés')
        persist_import_run_state(supabase, run_state)

        mark_import_step_started(run_state, 'programs_sitemap')
        persist_import_run_state(supabase, run_state)
        try:
            generate_programs_sitemap(supabase)
            mark_import_step_completed(run_state, 'programs_sitemap', detail='Sitemap programmes générée')
        except Exception as e:
            logger.warning(f"Programs sitemap generation failed: {str(e)}")
            mark_import_step_warning(run_state, 'programs_sitemap', str(e))
        persist_import_run_state(supabase, run_state)

        mark_import_step_started(run_state, 'static_sitemap')
        persist_import_run_state(supabase, run_state)
        try:
            generate_static_sitemap(supabase)
            mark_import_step_completed(run_state, 'static_sitemap', detail='Sitemap statique générée')
        except Exception as e:
            logger.warning(f"Static sitemap generation failed: {str(e)}")
            mark_import_step_warning(run_state, 'static_sitemap', str(e))
        persist_import_run_state(supabase, run_state)

        mark_import_step_started(run_state, 'html_sitemap')
        persist_import_run_state(supabase, run_state)
        try:
            generate_html_sitemap(supabase)
            mark_import_step_completed(run_state, 'html_sitemap', detail='Plan du site HTML généré')
        except Exception as e:
            logger.warning(f"HTML sitemap generation failed: {str(e)}")
            mark_import_step_warning(run_state, 'html_sitemap', str(e))
        persist_import_run_state(supabase, run_state)

        mark_import_step_started(run_state, 'head_channel_snapshots')
        persist_import_run_state(supabase, run_state)
        try:
            attach_program_media_from_db(programs)
            head_root_count = regenerate_head_root_routes(channels, programs)
            head_count = regenerate_head_channel_routes(channels, programs)
            mark_import_step_completed(
                run_state,
                'head_channel_snapshots',
                detail=f'{head_root_count} snapshots head + {head_count} snapshots canaux régénérés',
            )
        except Exception as e:
            logger.warning(f"Head channel snapshot refresh failed: {str(e)}")
            mark_import_step_warning(run_state, 'head_channel_snapshots', str(e))
        persist_import_run_state(supabase, run_state)

        mark_import_step_started(run_state, 'entity_airings_refresh')
        persist_import_run_state(supabase, run_state)
        try:
            entity_airings_report = run_entity_airings_refresh()
            mark_import_step_completed(run_state, 'entity_airings_refresh', detail=entity_airings_report)
        except Exception as e:
            logger.warning(f"Entity airings refresh failed: {str(e)}")
            mark_import_step_warning(run_state, 'entity_airings_refresh', str(e))
        persist_import_run_state(supabase, run_state)

        mark_import_step_started(run_state, 'supabase_usage_report')
        persist_import_run_state(supabase, run_state)
        try:
            usage_report_path = run_supabase_usage_report()
            mark_import_step_completed(run_state, 'supabase_usage_report', detail=usage_report_path)
        except Exception as e:
            logger.warning(f"Supabase usage report generation failed: {str(e)}")
            mark_import_step_warning(run_state, 'supabase_usage_report', str(e))
        persist_import_run_state(supabase, run_state)

        notification_urls = build_notification_urls(channels)
        indexnow_urls = build_indexnow_urls(channels)
        google_urls = build_google_indexing_urls(channels)
        public_dir = get_public_dir()

        mark_import_step_started(run_state, 'indexnow')
        persist_import_run_state(supabase, run_state)
        try:
            submit_indexnow(indexnow_urls, public_dir)
            mark_import_step_completed(run_state, 'indexnow', detail=f'{len(indexnow_urls)} URLs notifiées')
        except Exception as e:
            logger.warning(f"IndexNow notification failed: {str(e)}")
            mark_import_step_warning(run_state, 'indexnow', str(e), detail=f'{len(indexnow_urls)} URLs ciblées')
        persist_import_run_state(supabase, run_state)

        mark_import_step_started(run_state, 'websub')
        persist_import_run_state(supabase, run_state)
        try:
            publish_websub(notification_urls)
            mark_import_step_completed(run_state, 'websub', detail=f'{len(notification_urls)} URLs publiées')
        except Exception as e:
            logger.warning(f"WebSub publish failed: {str(e)}")
            mark_import_step_warning(run_state, 'websub', str(e), detail=f'{len(notification_urls)} URLs ciblées')
        persist_import_run_state(supabase, run_state)

        mark_import_step_started(run_state, 'google_indexing')
        persist_import_run_state(supabase, run_state)
        try:
            submit_google_indexing(google_urls)
            mark_import_step_completed(run_state, 'google_indexing', detail=f'{len(google_urls)} URLs listing envoyées')
        except Exception as e:
            logger.warning(f"Google Indexing API notification failed: {str(e)}")
            mark_import_step_warning(run_state, 'google_indexing', str(e), detail=f'{len(google_urls)} URLs ciblées')
        persist_import_run_state(supabase, run_state)

        mark_import_step_started(run_state, 'google_url_inspection')
        persist_import_run_state(supabase, run_state)
        try:
            inspection_report_path = run_google_url_inspection(channels)
            detail = inspection_report_path or 'Aucune URL inspectée'
            mark_import_step_completed(run_state, 'google_url_inspection', detail=detail)
        except Exception as e:
            logger.warning(f"Google URL Inspection API failed: {str(e)}")
            mark_import_step_warning(run_state, 'google_url_inspection', str(e))
        persist_import_run_state(supabase, run_state)

        mark_import_step_started(run_state, 'google_search_analytics')
        persist_import_run_state(supabase, run_state)
        try:
            search_report_path = run_google_search_analytics(channels)
            detail = search_report_path or 'Aucune donnée Search Analytics'
            mark_import_step_completed(run_state, 'google_search_analytics', detail=detail)
        except Exception as e:
            logger.warning(f"Google Search Analytics API failed: {str(e)}")
            mark_import_step_warning(run_state, 'google_search_analytics', str(e))
        persist_import_run_state(supabase, run_state)

        if PROGRAM_SHARE_DETACHED_ENABLED:
            try:
                launch_info = launch_detached_program_share_snapshots(run_state)
                set_background_job_state(
                    run_state,
                    'program_share_snapshots',
                    'running',
                    detail='Job détaché lancé',
                    extra=launch_info,
                )
                mark_import_step_completed(
                    run_state,
                    'program_share_snapshots',
                    detail='Job détaché lancé en arrière-plan',
                )
            except Exception as e:
                logger.warning(f"Detached program share snapshot launch failed: {str(e)}")
                mark_import_step_warning(
                    run_state,
                    'program_share_snapshots',
                    str(e),
                    detail='Lancement du job détaché impossible',
                )
                set_background_job_state(
                    run_state,
                    'program_share_snapshots',
                    'failed',
                    detail='Lancement du job détaché impossible',
                    error=str(e),
                )
            persist_import_run_state(supabase, run_state)
        else:
            mark_import_step_started(run_state, 'program_share_snapshots')
            persist_import_run_state(supabase, run_state)
            try:
                program_snapshot_count = regenerate_program_share_snapshots(channels, programs)
                mark_import_step_completed(run_state, 'program_share_snapshots', detail=f'{program_snapshot_count} snapshots programme régénérés')
            except Exception as e:
                logger.warning(f"Program share snapshot refresh failed: {str(e)}")
                mark_import_step_warning(run_state, 'program_share_snapshots', str(e))
            persist_import_run_state(supabase, run_state)

        run_finished_at = utc_now_iso()
        run_state['status'] = 'success_with_warnings' if run_state['warnings'] else 'success'
        run_state['finishedAt'] = run_finished_at
        run_state['currentStep'] = None
        run_state['errorMessage'] = None
        persist_import_run_state(supabase, run_state, include_last_run_at=True)

        logger.info("=" * 60)
        logger.info("EPG Import Summary:")
        logger.info(f"  Channels processed: {channels_processed}")
        logger.info(f"  Programs inserted: {programs_inserted}")
        logger.info(f"  Old programs deleted: {programs_deleted}")
        logger.info("EPG Import Completed Successfully")
        logger.info("=" * 60)

        return 0

    except Exception as e:
        try:
            if 'supabase' in locals():
                current_step = run_state.get('currentStep')
                if current_step:
                    mark_import_step_failed(run_state, current_step, str(e))
                run_state['status'] = 'error'
                run_state['finishedAt'] = utc_now_iso()
                run_state['errorMessage'] = str(e)
                persist_import_run_state(supabase, run_state, include_last_run_at=True)
        except Exception:
            pass
        logger.error("=" * 60)
        logger.error(f"EPG Import Failed: {str(e)}", exc_info=True)
        logger.error("=" * 60)
        return 1

if __name__ == "__main__":
    if '--run-supabase-usage-report' in sys.argv:
        report_path = run_supabase_usage_report()
        print(report_path)
        raise SystemExit(0)

    if '--run-program-share-snapshots' in sys.argv:
        expected_run_id = ''
        if '--parent-run-id' in sys.argv:
            try:
                run_index = sys.argv.index('--parent-run-id')
                expected_run_id = sys.argv[run_index + 1]
            except Exception:
                raise SystemExit('--parent-run-id requires a run id value')

        if not expected_run_id:
            raise SystemExit('--parent-run-id is required for detached program share snapshots')

        sys.exit(run_detached_program_share_snapshots(expected_run_id))

    sys.exit(main())
