#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import Together from 'together-ai';
import { getRecommendedGenres } from '../src/utils/recommendationRules.js';

type JsonRecord = Record<string, any>;

type ImageAsset = {
  buffer: Buffer;
  mimeType: string;
  sourceUrl?: string | null;
};

type SocialPayload = {
  postType: 'post1' | 'post2' | 'post3' | 'post4' | 'post5' | 'post6';
  text: string;
  image: ImageAsset | null;
  imageUrl: string | null;
};

type BlueskySession = {
  did: string;
  handle: string;
  accessJwt: string;
  serviceUrl: string;
};

type BlueskyBlob = {
  $type: 'blob';
  ref: { $link: string };
  mimeType: string;
  size: number;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(FRONTEND_DIR, '..');
const ENTITIES_DIR = path.join(FRONTEND_DIR, 'public', 'entities-data');
const SITE_URL = 'https://programmecesoir.fr';
const TIMEZONE = 'Europe/Paris';
const DEEPSEEK_TIMEOUT_MS = Number(process.env.DEEPSEEK_TIMEOUT_MS || 120000);
const DEEPSEEK_MAX_TOKENS = Number(process.env.DEEPSEEK_MAX_TOKENS || 800);
const TOGETHER_MODEL = 'black-forest-labs/FLUX.1-schnell';
const DEFAULT_OG_IMAGE = `${SITE_URL}/static/img/programmecesoir-social.jpg`;
const EDITORIAL_RECO_PROFILE = {
  ages: [30, 42],
  genders: ['Femme', 'Homme'],
  preference: 'Cinéma',
};
const EDITORIAL_SPORT_PROFILE = {
  ages: [28, 40],
  genders: ['Homme', 'Femme'],
  preference: 'Sport',
};
const HEAD_CHANNEL_IDS = new Set([
  'tf1', 'france-2', 'france-3', 'canal-plus', 'canal', 'france-5', 'm6', 'arte', 'c8',
  'w9', 'tmc', 'tfx', 'nrj12', 'lci', 'france-4', 'bfm-tv', 'bfmtv', 'cnews', 'cstar',
  'gulli', '6ter', 'rmc-decouverte', 'rmc-story', 'franceinfo', 'france-info',
]);
const CHANNEL_ROUTE_OVERRIDES: Record<string, string> = {
  canal: 'canal-plus',
  canalplus: 'canal-plus',
  bfmtv: 'bfm-tv',
  'france-info': 'franceinfo',
};
const DEFAULT_BLUESKY_IDENTIFIER = 'programmecesoir.bsky.social';
const DEFAULT_BLUESKY_SERVICE = 'https://bsky.social';

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const normalized = arg.replace(/^--/, '');
    const [key, value] = normalized.split('=');
    return [key, value ?? 'true'];
  }),
);

const postArg = args.get('post');
const DRY_RUN = process.env.DRY_RUN === 'true' || args.get('dry-run') === 'true';

function loadEnvFile(envPath: string) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  });
}

function loadEnv() {
  [
    path.join(FRONTEND_DIR, '.env'),
    path.join(ROOT_DIR, 'scripts', '.env'),
    path.join(ROOT_DIR, '.env-x'),
  ].forEach(loadEnvFile);

  if (!process.env.DEEPSEEK_API_KEY) {
    const deepseekPath = path.join(ROOT_DIR, 'DEEPSEEK.md');
    if (fs.existsSync(deepseekPath)) {
      const match = fs.readFileSync(deepseekPath, 'utf8').match(/DEEPSEEK_API_KEY\s*=\s*(.+)/);
      if (match) process.env.DEEPSEEK_API_KEY = match[1].trim();
    }
  }

  if (!process.env.TOGETHER_API_KEY) {
    const togetherPath = path.join(ROOT_DIR, 'together-api.md');
    if (fs.existsSync(togetherPath)) {
      const match = fs.readFileSync(togetherPath, 'utf8').match(/api-user-programmecesoir:\s*(.+)/);
      if (match) process.env.TOGETHER_API_KEY = match[1].trim();
    }
  }
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function getOptionalEnv(...names: string[]) {
  for (const name of names) {
    if (process.env[name]) return process.env[name] as string;
  }
  return null;
}

function getTodayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function getNowLabel(dateTime: string | null | undefined) {
  if (!dateTime) return '';
  const date = new Date(dateTime);
  return date.toLocaleTimeString('fr-FR', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  });
}

function slugify(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeChannelRoute(channelId: string | null | undefined): string {
  const raw = slugify(String(channelId || ''));
  return CHANNEL_ROUTE_OVERRIDES[raw] || raw;
}

function buildHeadUrl(channelId: string | null | undefined, fallbackPath: string): string {
  const normalized = normalizeChannelRoute(channelId);
  if (normalized && HEAD_CHANNEL_IDS.has(normalized)) {
    return `${SITE_URL}/${normalized}`;
  }
  return `${SITE_URL}${fallbackPath}`;
}

function normalizeHashtag(value: string): string {
  const base = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '');
  return base ? `#${base}` : '';
}

function stripHtml(value: string): string {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(value: string, maxChars: number): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

function escapeSqlLiteral(value: string) {
  return String(value || '').replace(/'/g, "''");
}

function toSqlText(value: string | null | undefined) {
  if (value == null) return 'NULL';
  return `'${escapeSqlLiteral(value)}'`;
}

function ensurePsqlAvailable() {
  try {
    execFileSync('psql', ['--version'], { encoding: 'utf8', stdio: 'ignore' });
  } catch {
    throw new Error('psql non disponibile nel PATH');
  }
}

function runPsql(sql: string): string {
  ensurePsqlAvailable();
  const databaseUrl = requireEnv('DATABASE_URL');
  return execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-qAt', databaseUrl, '-c', sql], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  }).trim();
}

function runPsqlJson<T>(sql: string, fallback: T): T {
  const output = runPsql(sql);
  if (!output) return fallback;
  return JSON.parse(output) as T;
}

function ensureSocialLogTable() {
  try {
    runPsql(`
      CREATE TABLE IF NOT EXISTS social_posts_log (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        created_at timestamptz DEFAULT now(),
        post_date date NOT NULL,
        post_type text NOT NULL,
        platform text NOT NULL,
        post_text text,
        post_id text,
        status text NOT NULL,
        error_msg text,
        UNIQUE (post_date, post_type, platform)
      );
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('pg_type_typname_nsp_index') && message.includes('social_posts_log')) {
      return;
    }
    throw error;
  }
}

function wasAlreadyPosted(postType: SocialPayload['postType'], todayIso: string): boolean {
  const sql = `
    SELECT COALESCE(json_build_object('status', status), 'null'::json)
    FROM (
      SELECT status
      FROM social_posts_log
      WHERE post_date = DATE ${toSqlText(todayIso)}
        AND post_type = ${toSqlText(postType)}
        AND platform = 'bluesky'
      ORDER BY created_at DESC
      LIMIT 1
    ) t;
  `;
  const result = runPsqlJson<{ status?: string } | null>(sql, null);
  return Boolean(result?.status === 'success');
}

function saveLog(
  postType: SocialPayload['postType'],
  todayIso: string,
  status: 'success' | 'error' | 'skipped',
  postText: string,
  postId: string | null,
  errorMsg: string | null,
) {
  const sql = `
    INSERT INTO social_posts_log (
      post_date,
      post_type,
      platform,
      post_text,
      post_id,
      status,
      error_msg
    ) VALUES (
      DATE ${toSqlText(todayIso)},
      ${toSqlText(postType)},
      'bluesky',
      ${toSqlText(postText)},
      ${toSqlText(postId)},
      ${toSqlText(status)},
      ${toSqlText(errorMsg)}
    )
    ON CONFLICT (post_date, post_type, platform)
    DO UPDATE SET
      post_text = EXCLUDED.post_text,
      post_id = EXCLUDED.post_id,
      status = EXCLUDED.status,
      error_msg = EXCLUDED.error_msg;
  `;
  runPsql(sql);
}

async function callDeepSeek(prompt: string, fallbackText: string, maxChars: number): Promise<string> {
  const apiKey = getOptionalEnv('DEEPSEEK_API_KEY');
  if (!apiKey) return truncateText(fallbackText, maxChars);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEEPSEEK_TIMEOUT_MS);
  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0.8,
        max_tokens: DEEPSEEK_MAX_TOKENS,
        messages: [
          {
            role: 'system',
            content: `Tu écris des posts Bluesky pour un guide TV français. Réponds uniquement avec le texte final du post, sans guillemets, sans markdown, en moins de ${maxChars} caractères.`,
          },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!response.ok) {
      return truncateText(fallbackText, maxChars);
    }
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || fallbackText;
    return truncateText(text, maxChars);
  } catch {
    return truncateText(fallbackText, maxChars);
  } finally {
    clearTimeout(timeout);
  }
}

function inferMimeType(url: string | null | undefined, contentTypeHeader: string | null | undefined): string {
  const contentType = String(contentTypeHeader || '').toLowerCase();
  if (contentType.includes('png')) return 'image/png';
  if (contentType.includes('webp')) return 'image/webp';
  if (contentType.includes('gif')) return 'image/gif';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'image/jpeg';

  const ext = path.extname(String(url || '')).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

async function fetchImageBuffer(url: string): Promise<ImageAsset | null> {
  try {
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType: inferMimeType(url, response.headers.get('content-type')),
      sourceUrl: url,
    };
  } catch {
    return null;
  }
}

async function generateTogetherImage(prompt: string): Promise<ImageAsset | null> {
  const apiKey = getOptionalEnv('TOGETHER_API_KEY');
  if (!apiKey) return null;
  try {
    const together = new Together({ apiKey });
    const response = await together.images.generate({
      model: TOGETHER_MODEL,
      prompt,
      width: 1216,
      height: 640,
      steps: 4,
      n: 1,
      response_format: 'url',
      output_format: 'jpeg',
    });
    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl) return null;
    return await fetchImageBuffer(imageUrl);
  } catch {
    return null;
  }
}

async function generateTogetherPortraitImage(prompt: string): Promise<ImageAsset | null> {
  const apiKey = getOptionalEnv('TOGETHER_API_KEY');
  if (!apiKey) return null;
  try {
    const together = new Together({ apiKey });
    const response = await together.images.generate({
      model: TOGETHER_MODEL,
      prompt,
      width: 1024,
      height: 1792,
      steps: 4,
      n: 1,
      response_format: 'url',
      output_format: 'jpeg',
    });
    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl) return null;
    return await fetchImageBuffer(imageUrl);
  } catch {
    return null;
  }
}

function readJsonFile(filePath: string): JsonRecord | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function getEntityImageUrl(type: 'actors' | 'films' | 'series', slug: string): string | null {
  const filePath = path.join(ENTITIES_DIR, type, `${slug}.json`);
  const data = readJsonFile(filePath);
  if (!data) return null;
  return data.photoUrl || data.posterUrl || data.image?.url || null;
}

async function resolveBirthdayImage(actorSlug: string, actorName: string, age: number | null) {
  const localUrl = getEntityImageUrl('actors', actorSlug);
  if (localUrl) {
    const downloaded = await fetchImageBuffer(localUrl);
    if (downloaded) return { image: downloaded, imageUrl: localUrl };
  }

  const generated = await generateTogetherImage(
    `Elegant cinema anniversary celebration poster, golden film reel decoration, art deco style, text area for '${actorName} - ${age ?? ''} ans', warm golden palette, no faces, horizontal 1216x640, editorial quality`,
  );
  return { image: generated, imageUrl: null };
}

async function resolveTitleImage(entityType: 'films' | 'series', title: string, prompt: string) {
  const localUrl = getEntityImageUrl(entityType, slugify(title));
  if (localUrl) {
    const downloaded = await fetchImageBuffer(localUrl);
    if (downloaded) return { image: downloaded, imageUrl: localUrl };
  }
  const generated = await generateTogetherImage(prompt);
  return { image: generated, imageUrl: null };
}

async function createBlueskySession(): Promise<BlueskySession> {
  const identifier =
    getOptionalEnv('BLUESKY_IDENTIFIER', 'BLUESKY_HANDLE', 'BSKY_IDENTIFIER', 'BSKY_HANDLE') ||
    DEFAULT_BLUESKY_IDENTIFIER;
  const passwordCandidates = [
    getOptionalEnv('BLUESKY_P'),
    getOptionalEnv('BLUESKY_APP_PASSWORD'),
    getOptionalEnv('BLUESKY_PASSWORD'),
    getOptionalEnv('BLUESKYPASSWDAPP'),
    getOptionalEnv('BSKY_APP_PASSWORD'),
    getOptionalEnv('BSKY_PASSWORD'),
  ].filter(Boolean) as string[];
  const serviceUrl =
    getOptionalEnv('BLUESKY_SERVICE_URL', 'BSKY_SERVICE_URL') || DEFAULT_BLUESKY_SERVICE;

  if (!passwordCandidates.length) {
    requireEnv('BLUESKY_P');
  }

  let lastError = 'No Bluesky password candidate available';
  for (const password of passwordCandidates) {
    const response = await fetch(`${serviceUrl}/xrpc/com.atproto.server.createSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    });
    if (!response.ok) {
      lastError = `Bluesky auth failed: ${response.status} ${await response.text()}`;
      if (response.status === 401) continue;
      throw new Error(lastError);
    }
    const data = await response.json();
    if (!data?.accessJwt || !data?.did) {
      lastError = 'Bluesky auth failed: missing did/accessJwt';
      continue;
    }
    return {
      did: data.did,
      handle: data.handle,
      accessJwt: data.accessJwt,
      serviceUrl,
    };
  }

  throw new Error(lastError);
}

async function uploadBlueskyBlob(session: BlueskySession, image: ImageAsset): Promise<BlueskyBlob> {
  const response = await fetch(`${session.serviceUrl}/xrpc/com.atproto.repo.uploadBlob`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.accessJwt}`,
      'Content-Type': image.mimeType,
    },
    body: image.buffer,
  });
  if (!response.ok) {
    throw new Error(`Bluesky blob upload failed: ${response.status} ${await response.text()}`);
  }
  const data = await response.json();
  if (!data?.blob) {
    throw new Error('Bluesky blob upload failed: missing blob');
  }
  return data.blob as BlueskyBlob;
}

async function postToBluesky(payload: SocialPayload): Promise<string | null> {
  if (DRY_RUN) {
    console.log('\n--- DRY RUN ---');
    console.log(payload.postType);
    console.log(payload.text);
    console.log(`image: ${payload.imageUrl || 'generated-or-none'}`);
    return null;
  }

  const session = await createBlueskySession();
  const record: Record<string, any> = {
    $type: 'app.bsky.feed.post',
    text: payload.text,
    createdAt: new Date().toISOString(),
  };

  if (payload.image) {
    try {
      const blob = await uploadBlueskyBlob(session, payload.image);
      record.embed = {
        $type: 'app.bsky.embed.images',
        images: [
          {
            alt: 'Programme Ce Soir',
            image: blob,
          },
        ],
      };
    } catch (error) {
      console.warn(`[social:bluesky] Image upload failed, posting without image: ${String(error)}`);
    }
  }

  const response = await fetch(`${session.serviceUrl}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.accessJwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      repo: session.did,
      collection: 'app.bsky.feed.post',
      record,
    }),
  });

  if (!response.ok) {
    throw new Error(`Bluesky post failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data?.uri || null;
}

function buildGenreHashtag(genre: string | null | undefined) {
  const normalized = normalizeHashtag(String(genre || '').split(/[,\//]/)[0] || '');
  return normalized || '#TVFr';
}

function getProgramEmoji(genre: string | null | undefined) {
  const value = String(genre || '');
  if (/film|cin[ée]ma/i.test(value)) return '🎬';
  if (/s[ée]rie|serie/i.test(value)) return '🎭';
  if (/document/i.test(value)) return '🎥';
  return '📺';
}

function compactProgramTitle(title: string, maxChars: number) {
  return truncateText(
    String(title || '')
      .replace(/\s*:\s*/g, ' : ')
      .replace(/\s+/g, ' ')
      .trim(),
    maxChars,
  );
}

function buildTonightFallbackText(rows: JsonRecord[]): string {
  const intro = '📺 Ce soir à la télé :';
  const tailBase = `#ProgrammeCeSoir #TVFr`;
  const maxChars = 290;
  const visible: string[] = [];

  for (const row of rows.slice(0, 5)) {
    const line = `${getProgramEmoji(row.genre)} ${compactProgramTitle(row.title, 30)} · ${getNowLabel(row.start_time)} · ${row.channel_name}`;
    const remainingRows = Math.max(0, rows.length - (visible.length + 1));
    const trailer = remainingRows > 0
      ? `+ ${remainingRows} autres sur ${SITE_URL}\n${tailBase}`
      : `${SITE_URL}\n${tailBase}`;
    const candidate = [intro, ...visible, line, trailer].join('\n');
    if (candidate.length <= maxChars) {
      visible.push(line);
    }
  }

  const hiddenCount = Math.max(0, rows.length - visible.length);
  const trailer = hiddenCount > 0
    ? `+ ${hiddenCount} autres sur ${SITE_URL}`
    : SITE_URL;
  const finalText = [intro, ...visible, trailer, tailBase].join('\n');
  if (finalText.length <= maxChars) return finalText;
  return `${intro}\n${visible.slice(0, 3).join('\n')}\n${SITE_URL}\n${tailBase}`;
}

function queryBirthdayArticle(todayIso: string) {
  const sql = `
    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
    FROM (
      SELECT
        entity_slug,
        entity_name,
        age_today,
        article_title,
        article_excerpt,
        upcoming_airings,
        known_for,
        article_slug
      FROM birthday_articles
      WHERE published_date = DATE ${toSqlText(todayIso)}
        AND is_published = true
      ORDER BY created_at DESC
      LIMIT 1
    ) t;
  `;
  const rows = runPsqlJson<JsonRecord[]>(sql, []);
  return rows[0] || null;
}

function queryAfternoonFilm(todayIso: string) {
  const sql = `
    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
    FROM (
      SELECT
        p.title,
        p.genre,
        p.start_time,
        p.channel_id,
        c.name AS channel_name
      FROM programs_fr p
      LEFT JOIN channels_fr c ON c.channel_id = p.channel_id
      WHERE (p.start_time AT TIME ZONE '${TIMEZONE}')::date = DATE ${toSqlText(todayIso)}
        AND (p.start_time AT TIME ZONE '${TIMEZONE}')::time >= TIME '12:00'
        AND (p.start_time AT TIME ZONE '${TIMEZONE}')::time < TIME '17:00'
        AND (
          COALESCE(p.genre, '') ILIKE '%film%'
          OR COALESCE(p.genre, '') ILIKE '%cinéma%'
        )
        AND COALESCE(c.channel_number, 9999) <= 18
        AND COALESCE(c.name, '') !~* '(brazzers|dorcel|playboy|xxl)'
      ORDER BY p.start_time ASC
      LIMIT 3
    ) t;
  `;
  const rows = runPsqlJson<JsonRecord[]>(sql, []);
  return rows[0] || null;
}

function queryTonightTop(todayIso: string) {
  const sql = `
    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
    FROM (
      SELECT
        ranked.title,
        ranked.genre,
        ranked.start_time,
        ranked.channel_name,
        ranked.channel_number,
        ranked.priority_rank
      FROM (
        SELECT DISTINCT ON (p.channel_id)
          p.title,
          p.genre,
          p.start_time,
          c.name AS channel_name,
          COALESCE(c.channel_number, 9999) AS channel_number,
          CASE
            WHEN COALESCE(p.genre, '') ILIKE '%film%' OR COALESCE(p.genre, '') ILIKE '%cinéma%' THEN 1
            WHEN COALESCE(p.genre, '') ILIKE '%série%' OR COALESCE(p.genre, '') ILIKE '%serie%' THEN 2
            WHEN COALESCE(p.genre, '') ILIKE '%document%' THEN 3
            ELSE 9
          END AS priority_rank,
          ABS(
            EXTRACT(
              EPOCH FROM (
                (p.start_time AT TIME ZONE '${TIMEZONE}')::time - TIME '21:00'
              )
            )
          ) AS prime_distance
        FROM programs_fr p
        LEFT JOIN channels_fr c ON c.channel_id = p.channel_id
        WHERE (p.start_time AT TIME ZONE '${TIMEZONE}')::date = DATE ${toSqlText(todayIso)}
          AND (p.start_time AT TIME ZONE '${TIMEZONE}')::time >= TIME '18:00'
          AND (p.start_time AT TIME ZONE '${TIMEZONE}')::time < TIME '23:00'
          AND COALESCE(c.channel_number, 9999) <= 18
        ORDER BY p.channel_id, priority_rank ASC, prime_distance ASC, p.start_time ASC
      ) ranked
      ORDER BY ranked.priority_rank ASC, ranked.prime_distance ASC, ranked.channel_number ASC
      LIMIT 5
    ) t;
  `;
  return runPsqlJson<JsonRecord[]>(sql, []);
}

function queryOnNow() {
  const sql = `
    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
    FROM (
      SELECT
        p.title,
        p.genre,
        p.start_time,
        p.end_time,
        p.channel_id,
        c.name AS channel_name
      FROM programs_fr p
      LEFT JOIN channels_fr c ON c.channel_id = p.channel_id
      WHERE p.start_time <= now()
        AND p.end_time >= now()
        AND COALESCE(c.channel_number, 9999) <= 18
        AND COALESCE(c.name, '') !~* '(brazzers|dorcel|playboy|xxl)'
      ORDER BY
        CASE
          WHEN COALESCE(p.genre, '') ILIKE '%film%' OR COALESCE(p.genre, '') ILIKE '%cinéma%' THEN 1
          WHEN COALESCE(p.genre, '') ILIKE '%série%' OR COALESCE(p.genre, '') ILIKE '%serie%' THEN 2
          ELSE 9
        END ASC,
        p.start_time ASC
      LIMIT 1
    ) t;
  `;
  const rows = runPsqlJson<JsonRecord[]>(sql, []);
  return rows[0] || null;
}

function buildEditorialGenreScores() {
  return buildGenreScoresFromProfile(EDITORIAL_RECO_PROFILE, ['Film', 'Cinéma', 'Cinema', 'Films', "Film d'animation"]);
}

function buildSportGenreScores() {
  return buildGenreScoresFromProfile(EDITORIAL_SPORT_PROFILE, [
    'Sport',
    'Magazine sportif',
    'Football',
    'Rugby',
    'Tennis',
    'Cyclisme',
    'Basket',
    'Golf',
    'Formule 1',
  ]);
}

function buildGenreScoresFromProfile(
  profile: { ages: number[]; genders: string[]; preference: string },
  preferenceBoosts: string[],
) {
  const merged: Record<string, number> = {};
  for (const age of profile.ages) {
    for (const gender of profile.genders) {
      const partial = getRecommendedGenres(age, gender);
      Object.entries(partial).forEach(([genre, score]) => {
        merged[genre] = Math.max(merged[genre] || 0, Number(score) || 0);
      });
    }
  }
  preferenceBoosts.forEach((genre) => {
    merged[genre] = (merged[genre] || 0) + 10;
  });
  merged['Generico'] = (merged['Generico'] || 0) + 1;
  return merged;
}

function computeEditorialFilmScore(row: JsonRecord, genreScores: Record<string, number>) {
  const genre = String(row.genre || '').trim();
  const genreLower = genre.toLowerCase();
  let baseScore = genreScores[genre] || 0;

  if (baseScore === 0) {
    for (const [key, value] of Object.entries(genreScores)) {
      const keyLower = key.toLowerCase();
      if (genreLower.includes(keyLower) || keyLower.includes(genreLower)) {
        baseScore = Number(value) || 0;
        break;
      }
    }
  }

  if (baseScore === 0) baseScore = 1;

  const startDate = new Date(row.start_time);
  const startHour = Number.isNaN(startDate.getTime())
    ? 21
    : Number(
        startDate.toLocaleString('fr-FR', {
          timeZone: TIMEZONE,
          hour: '2-digit',
          hour12: false,
        }),
      );

  let score = baseScore;
  if (startHour >= 20 && startHour < 22) score += 3;
  if (startHour >= 21 && startHour < 22) score += 1;
  if (Number(row.channel_number || 999) <= 10) score += 2;

  return score;
}

function queryChosenFilmTonight(todayIso: string) {
  const sql = `
    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
    FROM (
      SELECT
        p.title,
        p.slug,
        p.genre,
        p.description,
        p.poster_url,
        p.start_time,
        p.end_time,
        c.channel_id,
        c.name AS channel_name,
        COALESCE(c.channel_number, 9999) AS channel_number
      FROM programs_fr p
      LEFT JOIN channels_fr c ON c.channel_id = p.channel_id
      WHERE (p.start_time AT TIME ZONE '${TIMEZONE}')::date = DATE ${toSqlText(todayIso)}
        AND (p.start_time AT TIME ZONE '${TIMEZONE}')::time >= TIME '18:00'
        AND (p.start_time AT TIME ZONE '${TIMEZONE}')::time < TIME '23:30'
        AND (
          COALESCE(p.genre, '') ILIKE '%film%'
          OR COALESCE(p.genre, '') ILIKE '%cinéma%'
        )
        AND COALESCE(c.channel_number, 9999) <= 18
      ORDER BY COALESCE(c.channel_number, 9999) ASC, p.start_time ASC
    ) t;
  `;
  const rows = runPsqlJson<JsonRecord[]>(sql, []);
  const genreScores = buildEditorialGenreScores();
  const scored = rows
    .filter((row) => row.channel_id && row.slug && row.title)
    .map((row) => ({
      ...row,
      score: computeEditorialFilmScore(row, genreScores),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if ((a.channel_number || 9999) !== (b.channel_number || 9999)) {
        return (a.channel_number || 9999) - (b.channel_number || 9999);
      }
      return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
    });
  return scored[0] || null;
}

function queryChosenSportTonight(todayIso: string) {
  const sql = `
    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
    FROM (
      SELECT
        p.title,
        p.slug,
        p.genre,
        p.description,
        p.poster_url,
        p.start_time,
        p.end_time,
        c.channel_id,
        c.name AS channel_name,
        COALESCE(c.channel_number, 9999) AS channel_number
      FROM programs_fr p
      LEFT JOIN channels_fr c ON c.channel_id = p.channel_id
      WHERE (p.start_time AT TIME ZONE '${TIMEZONE}')::date = DATE ${toSqlText(todayIso)}
        AND (p.start_time AT TIME ZONE '${TIMEZONE}')::time >= TIME '18:00'
        AND (p.start_time AT TIME ZONE '${TIMEZONE}')::time < TIME '23:30'
        AND (
          COALESCE(p.genre, '') ILIKE '%sport%'
          OR COALESCE(p.genre, '') ILIKE '%football%'
          OR COALESCE(p.genre, '') ILIKE '%rugby%'
          OR COALESCE(p.genre, '') ILIKE '%tennis%'
          OR COALESCE(p.genre, '') ILIKE '%cyclisme%'
          OR COALESCE(p.genre, '') ILIKE '%basket%'
          OR COALESCE(p.genre, '') ILIKE '%golf%'
        )
      ORDER BY COALESCE(c.channel_number, 9999) ASC, p.start_time ASC
    ) t;
  `;
  const rows = runPsqlJson<JsonRecord[]>(sql, []);
  const genreScores = buildSportGenreScores();
  const scored = rows
    .filter((row) => row.channel_id && row.slug && row.title)
    .filter((row) => {
      const title = String(row.title || '').toLowerCase();
      const channel = String(row.channel_name || '').toLowerCase();
      if (!row.description && /360|live\s+\d+|vivez en direct|a bient[oô]t/i.test(title)) return false;
      if (/^eurosport 360/.test(title)) return false;
      if (/^ligue 1\+\s+\d+/.test(title)) return false;
      if (/^vivez en direct les [ée]v[ée]nements/.test(title)) return false;
      if (/brazzers|dorcel|playboy|xxl/.test(channel)) return false;
      return true;
    })
    .map((row) => {
      let score = computeEditorialFilmScore(row, genreScores);
      if (row.description) score += 3;
      if (Number(row.channel_number || 9999) <= 18) score += 4;
      if (/stade 2|masters|tour des flandres|nba|ligue 1|roland|champions/i.test(String(row.title || ''))) {
        score += 3;
      }
      if (/quotidienne/i.test(String(row.title || ''))) {
        score -= 2;
      }
      return {
        ...row,
        score,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if ((a.channel_number || 9999) !== (b.channel_number || 9999)) {
        return (a.channel_number || 9999) - (b.channel_number || 9999);
      }
      return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
    });
  return scored[0] || null;
}

async function resolveChosenFilmImage(row: JsonRecord) {
  const siteProgramUrl = `${SITE_URL}/programme/${row.channel_id}/${row.slug}`;
  if (row.poster_url) {
    const downloaded = await fetchImageBuffer(row.poster_url);
    if (downloaded) return { image: downloaded, imageUrl: row.poster_url as string };
  }

  const localUrl = getEntityImageUrl('films', slugify(row.title));
  if (localUrl) {
    const downloaded = await fetchImageBuffer(localUrl);
    if (downloaded) return { image: downloaded, imageUrl: localUrl };
  }

  const generated = await generateTogetherPortraitImage(
    [
      `Vertical 9:16 cinematic poster inspired by the film '${row.title}'.`,
      `Mood and story cues: ${stripHtml(row.description || row.genre || 'soirée cinéma française')}.`,
      `Elegant editorial key art, premium French TV magazine style, strong central composition, dramatic lighting, refined color palette, theatrical poster feeling.`,
      `Avoid generic television screens, avoid text, avoid watermark, avoid logos, no collage, no split panels.`,
      `Create a single compelling movie-poster image that feels premium and evocative for a social post by Programme Ce Soir.`,
      `Reference link context: ${siteProgramUrl}`,
    ].join(' '),
  );
  return { image: generated, imageUrl: null };
}

async function resolveChosenSportImage(row: JsonRecord) {
  const localSeriesUrl = getEntityImageUrl('series', slugify(row.title));
  if (localSeriesUrl) {
    const downloaded = await fetchImageBuffer(localSeriesUrl);
    if (downloaded) return { image: downloaded, imageUrl: localSeriesUrl };
  }

  const generated = await generateTogetherPortraitImage(
    [
      `Vertical 9:16 premium sports editorial poster inspired by '${row.title}'.`,
      `Context: ${stripHtml(row.description || row.genre || 'grand rendez-vous sportif à la télévision')}.`,
      `Dynamic composition, one iconic sporting moment, dramatic stadium or arena atmosphere, premium magazine cover style, strong subject focus, cinematic lighting.`,
      `No television screens, no collage, no split layout, no text, no watermark, no logos.`,
      `The result must feel like a polished social cover for Programme Ce Soir, exciting and elegant.`,
    ].join(' '),
  );
  return { image: generated, imageUrl: null };
}

async function buildPost1(todayIso: string): Promise<SocialPayload | null> {
  const article = queryBirthdayArticle(todayIso);
  if (!article) return null;

  const airings = Array.isArray(article.upcoming_airings) ? article.upcoming_airings : [];
  const firstAiring = airings[0] || null;
  const fallbackText = truncateText(
    `🎂 ${article.entity_name} fête ses ${article.age_today} ans aujourd'hui. À voir sur ${firstAiring?.channelName || 'les chaînes TV'} ce soir 👉 programmecesoir.fr #Anniversaire #ProgrammeCeSoir`,
    290,
  );
  const prompt = `Rédige un post Bluesky de moins de 290 caractères.
Sujet: anniversaire de ${article.entity_name}, ${article.age_today} ans.
Contexte: ${stripHtml(article.article_excerpt || '')}
Chaîne à mentionner si possible: ${firstAiring?.channelName || 'aucune'}
Contraintes:
- commencer par 🎂
- ton vivant, informatif
- inclure "programmecesoir.fr"
- finir avec #Anniversaire #ProgrammeCeSoir
- une seule idée marquante de carrière
Réponds uniquement avec le texte final.`;
  const text = await callDeepSeek(prompt, fallbackText, 290);
  const imageResult = await resolveBirthdayImage(article.entity_slug, article.entity_name, article.age_today);
  return {
    postType: 'post1',
    text,
    image: imageResult.image,
    imageUrl: imageResult.imageUrl,
  };
}

async function buildPost2(todayIso: string): Promise<SocialPayload | null> {
  const row = queryAfternoonFilm(todayIso);
  if (!row) return null;
  const hour = getNowLabel(row.start_time);
  const genreTag = buildGenreHashtag(row.genre);
  const targetUrl = buildHeadUrl(row.channel_id, '/film-ce-soir');
  const fallbackText = truncateText(
    `🎬 ${row.title} à ${hour} sur ${row.channel_name}. Un rendez-vous cinéma à retrouver sur ${targetUrl} ${genreTag} #CinémaTV #ProgrammeCeSoir`,
    290,
  );
  const prompt = `Rédige un post Bluesky de moins de 290 caractères.
Programme: ${row.title}
Heure: ${hour}
Chaîne: ${row.channel_name}
Genre: ${row.genre || 'film'}
Contraintes:
- commencer par 🎬
- 1 phrase accrocheuse sur le genre et l'ambiance
- orienter le clic vers la page head ${targetUrl}, pas vers une fiche programme longue traîne
- finir avec #CinémaTV #ProgrammeCeSoir ${genreTag}
Réponds uniquement avec le texte final.`;
  const text = await callDeepSeek(prompt, fallbackText, 290);
  const imageResult = await resolveTitleImage(
    'films',
    row.title,
    `Movie poster style illustration for '${row.title}', ${row.genre || 'cinema'} atmosphere, cinematic composition, rich colors, French TV broadcast aesthetic, no text, 1216x640`,
  );
  return {
    postType: 'post2',
    text,
    image: imageResult.image,
    imageUrl: imageResult.imageUrl,
  };
}

async function buildPost3(todayIso: string): Promise<SocialPayload | null> {
  const rows = queryTonightTop(todayIso);
  if (!rows.length) return null;
  const fallbackText = buildTonightFallbackText(rows);
  const prompt = `Rédige un post Bluesky de moins de 290 caractères pour un guide TV français.
Programmes TNT principaux du soir :
${rows.map((row: JsonRecord) => `- ${row.title} | ${getNowLabel(row.start_time)} | ${row.channel_name} | ${row.genre || ''}`).join('\n')}
Contraintes :
- commencer par "📺 Ce soir à la télé :"
- 3 ou 4 lignes programmes maximum
- style clair, rythmé, éditorial
- garder les heures et chaînes
- ajouter ensuite "+ ${Math.max(0, rows.length - 4)} autres sur ${SITE_URL}"
- finir par #ProgrammeCeSoir #TVFr
Réponds uniquement avec le texte final.`;
  let text = await callDeepSeek(prompt, fallbackText, 290);
  if (
    !text.includes('#ProgrammeCeSoir') ||
    !text.includes(SITE_URL) ||
    (text.match(/\n/g) || []).length < 2
  ) {
    text = fallbackText;
  }

  let image = await generateTogetherImage(
    'French television evening guide illustration, 5 glowing TV screens in a cozy living room, warm evening light, art deco borders, text overlay areas for program titles, deep blue and gold palette, 1216x640, no faces',
  );
  let imageUrl: string | null = null;
  if (!image) {
    image = await fetchImageBuffer(DEFAULT_OG_IMAGE);
    imageUrl = DEFAULT_OG_IMAGE;
  }
  return {
    postType: 'post3',
    text,
    image,
    imageUrl: image?.sourceUrl || imageUrl,
  };
}

async function buildPost4(): Promise<SocialPayload | null> {
  const row = queryOnNow();
  if (!row) return null;
  const genre = row.genre || 'programme TV';
  const targetUrl = buildHeadUrl(row.channel_id, '/en-direct');
  const fallbackText = truncateText(
    `📡 En ce moment sur ${row.channel_name} : ${row.title} — ${genre}. Tu regardes ? 👀 ${targetUrl} #EnDirect #ProgrammeCeSoir`,
    290,
  );
  const prompt = `Rédige un post Bluesky de moins de 290 caractères.
Programme en cours: ${row.title}
Chaîne: ${row.channel_name}
Genre: ${genre}
Contraintes:
- commencer par 📡
- une phrase teaser sans spoiler
- inclure "Tu regardes ? 👀"
- orienter le clic vers la page head ${targetUrl}, pas vers une fiche programme longue traîne
- finir avec #EnDirect #ProgrammeCeSoir
Réponds uniquement avec le texte final.`;
  const text = await callDeepSeek(prompt, fallbackText, 290);

  let image: ImageAsset | null = null;
  let imageUrl: string | null = null;
  if (String(genre).match(/film|cinéma/i)) {
    const result = await resolveTitleImage(
      'films',
      row.title,
      `Live TV broadcast atmosphere, glowing screen in dark room, '${row.title}' text area, dramatic cinematic lighting, deep blue tones, 1216x640, no faces, no text`,
    );
    image = result.image;
    imageUrl = result.imageUrl;
  } else if (String(genre).match(/s[ée]rie|serie/i)) {
    const result = await resolveTitleImage(
      'series',
      row.title,
      `Live TV broadcast atmosphere, glowing screen in dark room, '${row.title}' text area, dramatic cinematic lighting, deep blue tones, 1216x640, no faces, no text`,
    );
    image = result.image;
    imageUrl = result.imageUrl;
  } else {
    image = await generateTogetherImage(
      `Live TV broadcast atmosphere, glowing screen in dark room, '${row.title}' text area, dramatic cinematic lighting, deep blue tones, 1216x640, no faces, no text`,
    );
  }

  return {
    postType: 'post4',
    text,
    image,
    imageUrl,
  };
}

async function buildPost5(todayIso: string): Promise<SocialPayload | null> {
  const row = queryChosenFilmTonight(todayIso);
  if (!row) return null;

  const hour = getNowLabel(row.start_time);
  const targetUrl = buildHeadUrl(row.channel_id, '/film-ce-soir');
  const fallbackText = truncateText(
    `🎬 Choisi pour vous ce soir : ${row.title} à ${hour} sur ${row.channel_name}. Notre moteur recommandations retient ce film pour une soirée cinéma grand public. 👉 ${targetUrl} #ChoisiPourVous #ProgrammeCeSoir`,
    290,
  );
  const prompt = `Rédige un post Bluesky de moins de 290 caractères.
Titre: ${row.title}
Chaîne: ${row.channel_name}
Heure: ${hour}
Genre: ${row.genre}
Description: ${stripHtml(row.description || '')}
Angle: "Choisi pour vous · film ce soir", sélection issue du moteur recommandations du site.
Contraintes:
- commencer par 🎬
- inclure "Choisi pour vous ce soir"
- ton éditorial, premium, pas criard
- expliquer en une phrase pourquoi ce film mérite le prime time
- orienter le clic vers la page head ${targetUrl}, pas vers une fiche programme longue traîne
- finir avec #ChoisiPourVous #ProgrammeCeSoir
Réponds uniquement avec le texte final.`;
  let text = await callDeepSeek(prompt, fallbackText, 290);
  if (
    !text.includes('#ProgrammeCeSoir') ||
    !text.toLowerCase().includes('choisi pour vous') ||
    !text.includes(targetUrl)
  ) {
    text = fallbackText;
  }

  const imageResult = await resolveChosenFilmImage(row);
  return {
    postType: 'post5',
    text,
    image: imageResult.image,
    imageUrl: imageResult.image?.sourceUrl || imageResult.imageUrl,
  };
}

async function buildPost6(todayIso: string): Promise<SocialPayload | null> {
  const row = queryChosenSportTonight(todayIso);
  if (!row) return null;

  const hour = getNowLabel(row.start_time);
  const targetUrl = buildHeadUrl(row.channel_id, '/sport-ce-soir');
  const fallbackText = truncateText(
    `🏅 Choisi pour vous ce soir : ${row.title} à ${hour} sur ${row.channel_name}. Notre moteur recommandations retient ce rendez-vous sport pour une soirée intense et accessible. 👉 ${targetUrl} #ChoisiPourVous #ProgrammeCeSoir`,
    290,
  );
  const prompt = `Rédige un post Bluesky de moins de 290 caractères.
Titre: ${row.title}
Chaîne: ${row.channel_name}
Heure: ${hour}
Genre: ${row.genre}
Description: ${stripHtml(row.description || '')}
Angle: "Choisi pour vous · sport du soir", sélection issue du moteur recommandations du site.
Contraintes:
- commencer par 🏅
- inclure "Choisi pour vous ce soir"
- ton éditorial, dynamique, premium
- expliquer en une phrase pourquoi ce rendez-vous sport vaut le détour
- orienter le clic vers la page head ${targetUrl}, pas vers une fiche programme longue traîne
- finir avec #ChoisiPourVous #ProgrammeCeSoir
Réponds uniquement avec le texte final.`;
  let text = await callDeepSeek(prompt, fallbackText, 290);
  if (
    !text.includes('#ProgrammeCeSoir') ||
    !text.toLowerCase().includes('choisi pour vous') ||
    !text.includes(targetUrl)
  ) {
    text = fallbackText;
  }

  const imageResult = await resolveChosenSportImage(row);
  return {
    postType: 'post6',
    text,
    image: imageResult.image,
    imageUrl: imageResult.image?.sourceUrl || imageResult.imageUrl,
  };
}

async function buildPayload(postId: string, todayIso: string): Promise<SocialPayload | null> {
  if (postId === '1') return buildPost1(todayIso);
  if (postId === '2') return buildPost2(todayIso);
  if (postId === '3') return buildPost3(todayIso);
  if (postId === '4') return buildPost4();
  if (postId === '5') return buildPost5(todayIso);
  if (postId === '6') return buildPost6(todayIso);
  throw new Error(`Unsupported --post=${postId}`);
}

async function main() {
  loadEnv();
  if (!DRY_RUN) {
    ensureSocialLogTable();
  }

  if (!postArg) {
    throw new Error('Usage: npm run social:bluesky -- --post=1|2|3|4|5|6');
  }

  const todayIso = getTodayIso();
  const payload = await buildPayload(postArg, todayIso);
  const postType = (`post${postArg}`) as SocialPayload['postType'];

  if (!payload) {
    if (!DRY_RUN) saveLog(postType, todayIso, 'skipped', '', null, 'No content available');
    console.log(`[social:bluesky] No payload available for ${postType}`);
    return;
  }

  if (wasAlreadyPosted(payload.postType, todayIso)) {
    console.log(`[social:bluesky] ${payload.postType} already posted today, skipping`);
    return;
  }

  try {
    const postUri = await postToBluesky(payload);
    if (!DRY_RUN) {
      saveLog(payload.postType, todayIso, 'success', payload.text, postUri, null);
    }
    console.log(`[social:bluesky] ${payload.postType} ready${postUri ? ` -> ${postUri}` : ''}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!DRY_RUN) {
      saveLog(payload.postType, todayIso, 'error', payload.text, null, message);
    }
    throw error;
  }
}

main().catch((error) => {
  console.error('[social:bluesky] fatal:', error);
  process.exit(1);
});
