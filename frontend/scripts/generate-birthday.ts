#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import Together from 'together-ai';
import { createClient } from '@supabase/supabase-js';

type ActorEntity = {
  type: 'actor';
  slug: string;
  name: string;
  description?: string | null;
  descriptionAi?: string | null;
  birthDate?: string | null;
  nationality?: string | null;
  jobTitle?: string | null;
  worksCount?: number | null;
  knownFor?: Array<{
    type?: string;
    slug?: string;
    title?: string;
    year?: number | null;
  }>;
  upcomingAirings?: Array<{
    id?: string;
    title?: string;
    channelName?: string;
    channel?: string;
    date?: string;
    startTime?: string;
    programUrl?: string;
  }>;
  externalIds?: Record<string, string | null> | null;
};

type BirthdayCandidate = {
  actor: ActorEntity;
  slug: string;
  birthYear: number | null;
  mmdd: string;
  exactBirthday: boolean;
  daysUntilBirthday: number;
};

type ArticlePayload = {
  title: string;
  bodyHtml: string;
  excerpt: string;
  metaDescription: string;
  plainText: string;
  wordCount: number;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(FRONTEND_DIR, '..');
const ENTITIES_DIR = path.join(FRONTEND_DIR, 'public', 'entities-data', 'actors');
const REPORT_DIR = path.join(FRONTEND_DIR, 'scripts', '.cache');
const REPORT_FILE = path.join(REPORT_DIR, 'birthday-last-run.json');

const SITE_NAME = 'Programme Ce Soir';
const SITE_URL = 'https://programmecesoir.fr';
const SITE_LOGO_URL = `${SITE_URL}/apple-touch-icon.png`;
const AUTHOR_NAME = 'La rédaction web';
const ARTICLE_MIN_WORDS = Number(process.env.BIRTHDAY_MIN_WORDS || 200);
const ARTICLE_TARGET_MIN_WORDS = Number(process.env.BIRTHDAY_TARGET_MIN_WORDS || 450);
const ARTICLE_TARGET_MAX_WORDS = Number(process.env.BIRTHDAY_TARGET_MAX_WORDS || 650);
const MAX_BIRTHDAY_AGE = Number(process.env.BIRTHDAY_MAX_AGE || 90);
const IMAGE_BUCKET = process.env.BIRTHDAY_IMAGE_BUCKET || 'editorial-images';
const DEEPSEEK_TIMEOUT_MS = Number(process.env.DEEPSEEK_TIMEOUT_MS || 120000);
const DEEPSEEK_MAX_TOKENS = Number(process.env.DEEPSEEK_MAX_TOKENS || 2600);

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? 'true'];
  }),
);

const DRY_RUN = process.env.DRY_RUN === 'true' || args.get('dry-run') === 'true';
const FORCE_REGENERATE = process.env.FORCE_REGENERATE === 'true' || args.get('force') === 'true';
const ALLOW_UPCOMING_FALLBACK =
  process.env.ALLOW_UPCOMING_FALLBACK === 'true' || args.get('allow-upcoming-fallback') === 'true';
const SKIP_IMAGE = process.env.SKIP_IMAGE === 'true' || args.get('skip-image') === 'true' || DRY_RUN;
const TODAY_OVERRIDE = args.get('today') || process.env.TODAY_MMDD || '';

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadEnv() {
  const envFiles = [
    path.join(FRONTEND_DIR, '.env'),
    path.join(ROOT_DIR, 'scripts', '.env'),
  ];

  envFiles.forEach((envPath) => {
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
  });

  if (!process.env.DEEPSEEK_API_KEY) {
    const deepseekFile = path.join(ROOT_DIR, 'DEEPSEEK.md');
    if (fs.existsSync(deepseekFile)) {
      const content = fs.readFileSync(deepseekFile, 'utf8');
      const match = content.match(/DEEPSEEK_API_KEY\s*=\s*(.+)/);
      if (match) process.env.DEEPSEEK_API_KEY = match[1].trim();
    }
  }

  if (!process.env.TOGETHER_API_KEY) {
    const togetherFile = path.join(ROOT_DIR, 'together-api.md');
    if (fs.existsSync(togetherFile)) {
      const content = fs.readFileSync(togetherFile, 'utf8');
      const match = content.match(/api-user-programmecesoir:\s*(.+)/);
      if (match) process.env.TOGETHER_API_KEY = match[1].trim();
    }
  }
}

function requireEnv(name: string, fallbackNames: string[] = []) {
  const candidates = [name, ...fallbackNames];
  for (const candidate of candidates) {
    if (process.env[candidate]) return process.env[candidate] as string;
  }
  throw new Error(`Variable d'environnement manquante: ${[name, ...fallbackNames].join(' / ')}`);
}

function getOptionalEnv(name: string, fallbackNames: string[] = []) {
  const candidates = [name, ...fallbackNames];
  for (const candidate of candidates) {
    if (process.env[candidate]) return process.env[candidate] as string;
  }
  return null;
}

function slugify(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function stripHtml(html: string): string {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordCount(text: string): number {
  return stripHtml(text)
    .split(/\s+/)
    .filter(Boolean).length;
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeSqlLiteral(value: string): string {
  return String(value || '').replace(/'/g, "''");
}

function toSqlText(value: string | null | undefined) {
  if (value == null) return 'NULL';
  return `'${escapeSqlLiteral(value)}'`;
}

function toSqlInt(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return 'NULL';
  return String(value);
}

function toSqlBool(value: boolean | null | undefined) {
  if (value == null) return 'NULL';
  return value ? 'TRUE' : 'FALSE';
}

function toSqlJson(value: unknown) {
  if (value == null) return 'NULL';
  return `'${escapeSqlLiteral(JSON.stringify(value))}'::jsonb`;
}

function runPsqlScalar(sql: string): string {
  const databaseUrl = requireEnv('DATABASE_URL');
  const output = execFileSync(
    'psql',
    ['-qAt', databaseUrl, '-c', sql],
    {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 20,
    },
  ).trim();

  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^[A-Z]+ \d+/.test(line));

  return lines[0] || '';
}

function cleanGeneratedHtml(html: string): string {
  return String(html || '')
    .replace(/^```(?:html|json)?/i, '')
    .replace(/```$/i, '')
    .replace(/<\/?(html|head|body)[^>]*>/gi, '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/\s(on\w+|style)=("[^"]*"|'[^']*')/gi, '')
    .trim();
}

function extractJsonObject(content: string): Record<string, unknown> {
  const trimmed = String(content || '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}$/);
    if (!match) throw new Error('Réponse JSON DeepSeek introuvable');
    return JSON.parse(match[0]);
  }
}

function getToday(): Date {
  if (TODAY_OVERRIDE) {
    const [month, day] = TODAY_OVERRIDE.split('-').map(Number);
    const base = new Date();
    return new Date(Date.UTC(base.getUTCFullYear(), month - 1, day, 12, 0, 0));
  }
  return new Date();
}

function getTodayMMDD(today: Date): string {
  const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(today.getUTCDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

function getTodayIsoDate(today: Date): string {
  return today.toISOString().slice(0, 10);
}

function getAgeForBirthday(birthYear: number | null, today: Date, exactBirthday: boolean): number | null {
  if (!birthYear) return null;
  const currentYear = today.getUTCFullYear();
  return exactBirthday ? currentYear - birthYear : currentYear - birthYear + 1;
}

function getNextBirthdayDate(mmdd: string, today: Date): Date {
  const [month, day] = mmdd.split('-').map(Number);
  const currentYear = today.getUTCFullYear();
  const currentMonthDay = getTodayMMDD(today);
  const targetYear = mmdd >= currentMonthDay ? currentYear : currentYear + 1;
  return new Date(Date.UTC(targetYear, month - 1, day, 12, 0, 0));
}

function daysBetween(a: Date, b: Date): number {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.round((b.getTime() - a.getTime()) / oneDay);
}

function readActorFiles(): BirthdayCandidate[] {
  if (!fs.existsSync(ENTITIES_DIR)) {
    throw new Error(`Dossier acteurs introuvable: ${ENTITIES_DIR}`);
  }

  const today = getToday();
  const todayMMDD = getTodayMMDD(today);
  const files = fs.readdirSync(ENTITIES_DIR).filter((file) => file.endsWith('.json'));
  const candidates: BirthdayCandidate[] = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(ENTITIES_DIR, file), 'utf8');
      const actor = JSON.parse(raw) as ActorEntity;
      if (!actor.birthDate) continue;

      const parts = String(actor.birthDate).split('-');
      const mmdd = parts.length === 3 ? `${parts[1]}-${parts[2]}` : String(actor.birthDate);
      if (!/^\d{2}-\d{2}$/.test(mmdd)) continue;

      const exactBirthday = mmdd === todayMMDD;
      const nextBirthdayDate = getNextBirthdayDate(mmdd, today);
      const daysUntilBirthday = exactBirthday ? 0 : daysBetween(today, nextBirthdayDate);
      const birthdayAge = getAgeForBirthday(parts.length === 3 ? Number(parts[0]) : null, today, exactBirthday);
      if (birthdayAge != null && birthdayAge > MAX_BIRTHDAY_AGE) continue;

      candidates.push({
        actor,
        slug: file.replace(/\.json$/, ''),
        birthYear: parts.length === 3 ? Number(parts[0]) : null,
        mmdd,
        exactBirthday,
        daysUntilBirthday,
      });
    } catch {
      // ignore malformed JSON
    }
  }

  return candidates;
}

function compareCandidates(a: BirthdayCandidate, b: BirthdayCandidate): number {
  const worksDiff = (b.actor.worksCount || 0) - (a.actor.worksCount || 0);
  if (worksDiff !== 0) return worksDiff;

  const airingsDiff = (b.actor.upcomingAirings?.length || 0) - (a.actor.upcomingAirings?.length || 0);
  if (airingsDiff !== 0) return airingsDiff;

  const knownForDiff = (b.actor.knownFor?.length || 0) - (a.actor.knownFor?.length || 0);
  if (knownForDiff !== 0) return knownForDiff;

  return a.actor.name.localeCompare(b.actor.name, 'fr');
}

function selectCandidate(candidates: BirthdayCandidate[]) {
  const exact = candidates.filter((candidate) => candidate.exactBirthday).sort(compareCandidates);
  if (exact.length > 0) {
    return {
      mode: 'exact' as const,
      selected: exact[0],
      exactMatches: exact,
      upcomingMatches: [] as BirthdayCandidate[],
    };
  }

  const upcoming = candidates
    .filter((candidate) => candidate.daysUntilBirthday > 0)
    .sort((a, b) => {
      if (a.daysUntilBirthday !== b.daysUntilBirthday) return a.daysUntilBirthday - b.daysUntilBirthday;
      return compareCandidates(a, b);
    });

  return {
    mode: 'upcoming' as const,
    selected: upcoming[0] || null,
    exactMatches: exact,
    upcomingMatches: upcoming,
  };
}

function buildUpcomingAiringsLines(actor: ActorEntity): string {
  const items = (actor.upcomingAirings || []).slice(0, 5);
  if (items.length === 0) return 'Aucune diffusion confirmée dans les prochains jours.';
  return items
    .map((airing) => {
      const channel = airing.channelName || airing.channel || 'une chaîne TV';
      const date = airing.date || '';
      return `- "${airing.title || 'Programme'}" sur ${channel}${date ? ` le ${date}` : ''}`;
    })
    .join('\n');
}

function buildKnownForLine(actor: ActorEntity): string {
  const items = (actor.knownFor || []).slice(0, 6);
  if (items.length === 0) return 'Aucune œuvre notable renseignée.';
  return items
    .map((item) => item.year ? `"${item.title}" (${item.year})` : `"${item.title}"`)
    .join(', ');
}

function buildPrompt(candidate: BirthdayCandidate, age: number | null, mode: 'exact' | 'upcoming') {
  const actor = candidate.actor;
  const programmesTV = buildUpcomingAiringsLines(actor);
  const knownFor = buildKnownForLine(actor);
  const birthdaySentence = mode === 'exact'
    ? `${actor.name} fête aujourd'hui ses ${age ?? 'N'} ans`
    : `${actor.name} fêtera bientôt ses ${age ?? 'N'} ans`;
  const dateContext = mode === 'exact'
    ? `né(e) le ${actor.birthDate}`
    : `né(e) le ${actor.birthDate}, prochain anniversaire dans ${candidate.daysUntilBirthday} jour(s)`;

  return [
    {
      role: 'system',
      content: `Tu es journaliste culture et télévision pour programmecesoir.fr.
Tu écris en français naturel, factuel et chaleureux.
Tu ne dois jamais inventer de dates, de récompenses, de liens familiaux, de films ou de séries non fournis.
Réponds uniquement avec un objet JSON valide ayant exactement les clés: title, bodyHtml, metaDescription.`,
    },
    {
      role: 'user',
      content: `Rédige un article éditorial HTML pour la rubrique "Anniversaire du jour".

Sujet:
- ${birthdaySentence}
- ${dateContext}
- Nationalité: ${actor.nationality || 'non précisée'}
- Métier: ${actor.jobTitle || 'acteur / actrice'}
- Connu(e) pour: ${knownFor}
- Diffusions TV à venir:
${programmesTV}

Contraintes fortes:
- Français de France
- Article complet de ${ARTICLE_TARGET_MIN_WORDS} à ${ARTICLE_TARGET_MAX_WORDS} mots
- Minimum absolu: ${ARTICLE_MIN_WORDS} mots
- Premier paragraphe sans titre intermédiaire
- Utiliser uniquement ces balises HTML: <p>, <h2>, <ul>, <li>, <strong>, <em>
- Inclure une section "À voir à la télévision"
- Mentionner programmecesoir.fr au moins une fois
- Le ton doit être éditorial, accessible et crédible
- Si certaines informations manquent, ne pas les combler
- Si le mode est "upcoming", préciser clairement qu'il s'agit du prochain anniversaire et non de l'anniversaire du jour

Le JSON doit respecter:
- title: titre SEO éditorial
- bodyHtml: HTML complet de l'article
- metaDescription: 140 à 160 caractères

Réponds en JSON uniquement.`.trim(),
    },
  ];
}

function buildDryRunArticle(candidate: BirthdayCandidate, age: number | null, mode: 'exact' | 'upcoming'): ArticlePayload {
  const actor = candidate.actor;
  const title = mode === 'exact'
    ? `${actor.name} fête ses ${age ?? 'N'} ans : carrière, rôles marquants et programmes TV`
    : `${actor.name} bientôt à l'honneur : son prochain anniversaire et ses programmes TV`;
  const intro = mode === 'exact'
    ? `${actor.name} est à l'honneur aujourd'hui sur Programme Ce Soir. L'occasion de revenir sur un parcours artistique marquant, sur les rôles qui ont construit sa réputation et sur les œuvres que les téléspectateurs peuvent retrouver à l'antenne dans les prochains jours.`
    : `${actor.name} sera bientôt célébré(e) sur Programme Ce Soir. Même si aucun anniversaire exact n'est enregistré aujourd'hui dans le catalogue, cette fiche éditoriale permet d'anticiper le prochain rendez-vous et de remettre en lumière une carrière déjà bien identifiée dans les diffusions TV.`;
  const knownFor = (actor.knownFor || [])
    .slice(0, 5)
    .map((item) => `<li><strong>${escapeHtml(item.title || 'Œuvre')}</strong>${item.year ? ` (${item.year})` : ''}</li>`)
    .join('');
  const airings = (actor.upcomingAirings || [])
    .slice(0, 5)
    .map((item) => `<li><strong>${escapeHtml(item.title || 'Programme')}</strong> sur ${escapeHtml(item.channelName || item.channel || 'une chaîne TV')}${item.date ? ` le ${escapeHtml(item.date)}` : ''}</li>`)
    .join('');

  const bodyHtml = cleanGeneratedHtml(`
    <p>${escapeHtml(intro)} Né(e) le ${escapeHtml(actor.birthDate || 'date non précisée')}, ${escapeHtml(actor.name)}${age ? ` ${mode === 'exact' ? `fête aujourd'hui ses ${age} ans` : `fêtera bientôt ses ${age} ans`}` : ' reste une figure reconnue du paysage audiovisuel'}. Sur programmecesoir.fr, cette mise en avant éditoriale sert de point d'entrée simple pour retrouver ses films, ses séries et ses prochaines diffusions télévisées.</p>
    <h2>Une présence reconnaissable à l'écran</h2>
    <p>${escapeHtml(actor.name)}${actor.nationality ? `, artiste ${actor.nationality.toLowerCase()},` : ''} s'est imposé(e) grâce à des apparitions remarquées et à une identité de jeu immédiatement repérable. ${actor.descriptionAi ? escapeHtml(actor.descriptionAi) : actor.description ? escapeHtml(actor.description) : 'Même quand les données biographiques sont limitées, le catalogue du site permet déjà de remettre en contexte ses œuvres les plus visibles et de valoriser leur diffusion à la télévision.'} Cette approche éditoriale évite les extrapolations tout en gardant une vraie utilité pour les lecteurs qui cherchent quoi regarder ce soir.</p>
    <h2>Œuvres à retenir</h2>
    <p>Parmi les titres associés à ${escapeHtml(actor.name)}, plusieurs œuvres ressortent nettement dans le catalogue. Elles servent de repères pour comprendre le type de rôles, d'univers ou de registres que le public peut relier à son nom. Cette sélection n'a pas vocation encyclopédique: elle met d'abord en avant ce qui aide le lecteur à relier une personne, un titre et une prochaine diffusion TV.</p>
    <ul>${knownFor || '<li>Aucune œuvre notable renseignée dans le catalogue statique.</li>'}</ul>
    <h2>À voir à la télévision</h2>
    <p>Le vrai intérêt d'une page anniversaire sur programmecesoir.fr est de transformer une information éditoriale en usage concret. Au lieu de s'arrêter à un simple hommage, la page renvoie vers des diffusions identifiables, avec chaîne et date, afin que l'utilisateur puisse passer de la lecture à l'action en quelques secondes.</p>
    <ul>${airings || '<li>Aucune diffusion confirmée dans les prochains jours.</li>'}</ul>
    <p>Cette logique éditoriale garde la promesse du site: relier la culture TV, l'actualité des grilles et l'intention de visionnage. ${escapeHtml(actor.name)} y trouve ainsi une place utile, à la fois comme personnalité du jour et comme point d'entrée vers les films ou séries visibles à l'antenne.</p>
  `);

  const plainText = stripHtml(bodyHtml);
  const excerpt = `${plainText.slice(0, 200).trim()}…`;
  const metaDescription = mode === 'exact'
    ? `${actor.name} fête ses ${age ?? ''} ans aujourd'hui. Biographie, œuvres marquantes et diffusions TV à retrouver sur programmecesoir.fr.`
    : `Le prochain anniversaire de ${actor.name} approche. Découvrez ses œuvres marquantes et ses diffusions TV sur programmecesoir.fr.`;

  return {
    title,
    bodyHtml,
    excerpt: metaDescription.length > 200 ? metaDescription.slice(0, 197).trim() + '…' : excerpt,
    metaDescription: metaDescription.slice(0, 160),
    plainText,
    wordCount: wordCount(plainText),
  };
}

function validateArticlePayload(article: ArticlePayload, candidate: BirthdayCandidate, mode: 'exact' | 'upcoming') {
  const errors: string[] = [];
  if (!article.title) errors.push('title manquant');
  if (!article.bodyHtml) errors.push('bodyHtml manquant');
  if (!article.metaDescription) errors.push('metaDescription manquant');
  if (article.wordCount < ARTICLE_MIN_WORDS) errors.push(`article trop court (${article.wordCount} mots)`);
  if (!article.plainText.includes('programmecesoir.fr')) errors.push('mention programmecesoir.fr absente');
  if (!article.plainText.toLowerCase().includes(candidate.actor.name.toLowerCase())) errors.push('nom de l’acteur absent');
  if (mode === 'upcoming' && !/bient[oô]t|prochain anniversaire/i.test(article.plainText)) {
    errors.push('fallback prochain anniversaire non explicite');
  }
  if (mode === 'exact' && !/anniversaire|f[eê]te aujourd'hui|fete aujourd'hui/i.test(article.plainText)) {
    errors.push('contexte anniversaire du jour insuffisant');
  }
  if (article.metaDescription.length > 160) errors.push('metaDescription trop longue');
  if (!/<h2>/i.test(article.bodyHtml)) errors.push('section h2 absente');
  if (!/À voir à la télévision/i.test(article.bodyHtml)) errors.push('section TV absente');
  if (/<(script|style|html|body|head)/i.test(article.bodyHtml)) errors.push('balises interdites détectées');
  return errors;
}

function normalizeArticlePayload(payload: Record<string, unknown>, candidate: BirthdayCandidate, mode: 'exact' | 'upcoming'): ArticlePayload {
  const bodyHtml = cleanGeneratedHtml(String(payload.bodyHtml || ''));
  const plainText = stripHtml(bodyHtml);
  const excerpt = `${plainText.slice(0, 200).trim()}…`;
  const metaDescription = String(payload.metaDescription || '').trim().slice(0, 160);
  const title = String(payload.title || '').trim();

  return {
    title,
    bodyHtml,
    excerpt,
    metaDescription,
    plainText,
    wordCount: wordCount(plainText),
  };
}

function buildDefaultTitle(candidate: BirthdayCandidate, age: number | null, mode: 'exact' | 'upcoming') {
  return mode === 'exact'
    ? `${candidate.actor.name} fête ses ${age ?? 'N'} ans : carrière, rôles marquants et programmes TV`
    : `${candidate.actor.name} bientôt à l'honneur : son prochain anniversaire et ses programmes TV`;
}

function buildDefaultMetaDescription(candidate: BirthdayCandidate, age: number | null, mode: 'exact' | 'upcoming') {
  const description = mode === 'exact'
    ? `${candidate.actor.name} fête ses ${age ?? ''} ans aujourd'hui. Biographie, œuvres marquantes et diffusions TV à retrouver sur programmecesoir.fr.`
    : `Le prochain anniversaire de ${candidate.actor.name} approche. Découvrez ses œuvres marquantes et ses diffusions TV sur programmecesoir.fr.`;
  return description.slice(0, 160);
}

function buildArticleFromHtml(content: string, candidate: BirthdayCandidate, age: number | null, mode: 'exact' | 'upcoming'): ArticlePayload {
  const bodyHtml = cleanGeneratedHtml(content);
  const plainText = stripHtml(bodyHtml);
  const excerpt = `${plainText.slice(0, 200).trim()}…`;

  return {
    title: buildDefaultTitle(candidate, age, mode),
    bodyHtml,
    excerpt,
    metaDescription: buildDefaultMetaDescription(candidate, age, mode),
    plainText,
    wordCount: wordCount(plainText),
  };
}

async function generateArticle(candidate: BirthdayCandidate, age: number | null, mode: 'exact' | 'upcoming'): Promise<ArticlePayload> {
  if (DRY_RUN) {
    return buildDryRunArticle(candidate, age, mode);
  }

  const apiKey = requireEnv('DEEPSEEK_API_KEY');

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEEPSEEK_TIMEOUT_MS);
    let response: Response;

    try {
      response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'deepseek-chat',
          temperature: 0.55,
          max_tokens: DEEPSEEK_MAX_TOKENS,
          messages: buildPrompt(candidate, age, mode),
        }),
      });
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new Error(`DeepSeek timeout après ${Math.round(DEEPSEEK_TIMEOUT_MS / 1000)}s`);
        continue;
      }
      throw error;
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      lastError = new Error(`DeepSeek HTTP ${response.status}`);
      continue;
    }

    const payload = await response.json();
    const content = String(payload?.choices?.[0]?.message?.content || '').trim();
    let article: ArticlePayload;
    try {
      const json = extractJsonObject(content);
      article = normalizeArticlePayload(json, candidate, mode);
    } catch {
      article = buildArticleFromHtml(content, candidate, age, mode);
    }
    const errors = validateArticlePayload(article, candidate, mode);
    if (errors.length === 0) return article;
    lastError = new Error(`Validation éditoriale échouée: ${errors.join(', ')}`);
  }

  throw lastError || new Error('Échec génération article');
}

function buildImagePrompt(candidate: BirthdayCandidate, age: number | null, mode: 'exact' | 'upcoming') {
  return [
    'Elegant celebratory editorial illustration for a French TV guide website.',
    'Cinema and television mood, art deco poster inspiration, film reels, spotlight, golden confetti, red velvet atmosphere.',
    `Dedicated to "${candidate.actor.name}"${age ? ` and the milestone of ${age} years` : ''}.`,
    mode === 'exact' ? 'Birthday of the day visual.' : 'Upcoming birthday editorial visual.',
    'No human faces, no portrait likeness, decorative only.',
    'Space for title overlay, horizontal social card composition, discover-friendly, premium newsroom aesthetic.',
  ].join(' ');
}

async function generateImage(candidate: BirthdayCandidate, age: number | null, isoDate: string) {
  if (SKIP_IMAGE) return null;

  const togetherKey = requireEnv('TOGETHER_API_KEY');
  const supabaseUrl = requireEnv('VITE_SUPABASE_URL', ['SUPABASE_URL']);
  const supabaseKey = getOptionalEnv('SUPABASE_SERVICE_ROLE_KEY', ['SUPABASE_SERVICE_KEY']);
  if (!supabaseKey) {
    console.error('⚠️ Service role Supabase absente: image ignorée.');
    return null;
  }
  const together = new Together({ apiKey: togetherKey });
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  try {
    const response = await together.images.create({
      model: 'black-forest-labs/FLUX.1-schnell-Free',
      prompt: buildImagePrompt(candidate, age, candidate.exactBirthday ? 'exact' : 'upcoming'),
      width: 1216,
      height: 640,
      steps: 4,
      n: 1,
    });

    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl) return null;

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) return null;
    const arrayBuffer = await imageResponse.arrayBuffer();
    const fileName = `birthday/${candidate.slug}-${isoDate}.jpg`;

    const upload = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(fileName, arrayBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (upload.error) {
      console.error(`⚠️ Upload image échoué: ${upload.error.message}`);
      return null;
    }

    const publicUrl = supabase.storage
      .from(IMAGE_BUCKET)
      .getPublicUrl(fileName);

    return {
      url: publicUrl.data.publicUrl,
      alt: `${candidate.actor.name}${age ? `, ${age} ans` : ''} — Anniversaire du jour sur ${SITE_NAME}`,
    };
  } catch (error) {
    console.error(`⚠️ together.ai: ${(error as Error).message}`);
    return null;
  }
}

function buildStructuredData(article: ArticlePayload, candidate: BirthdayCandidate, articleSlug: string, isoDate: string, imageUrl?: string | null) {
  const articleUrl = `${SITE_URL}/anniversaire/${articleSlug}`;
  const sameAs = [
    candidate.actor.externalIds?.wikidata ? `https://www.wikidata.org/wiki/${candidate.actor.externalIds.wikidata}` : null,
    candidate.actor.externalIds?.wikipedia || null,
    candidate.actor.externalIds?.imdb ? `https://www.imdb.com/name/${candidate.actor.externalIds.imdb}/` : null,
  ].filter(Boolean);

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${articleUrl}#article`,
    headline: article.title,
    description: article.metaDescription,
    url: articleUrl,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': articleUrl,
    },
    author: {
      '@type': 'Person',
      name: AUTHOR_NAME,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
      logo: {
        '@type': 'ImageObject',
        url: SITE_LOGO_URL,
      },
    },
    datePublished: `${isoDate}T06:00:00+01:00`,
    dateModified: new Date().toISOString(),
    inLanguage: 'fr-FR',
    articleSection: 'Anniversaire du jour',
    ...(imageUrl ? { image: [imageUrl] } : {}),
    about: {
      '@type': 'Person',
      name: candidate.actor.name,
      ...(sameAs.length ? { sameAs } : {}),
      ...(candidate.actor.birthDate ? { birthDate: candidate.actor.birthDate } : {}),
      ...(candidate.actor.nationality ? {
        nationality: {
          '@type': 'Country',
          name: candidate.actor.nationality,
        },
      } : {}),
    },
  };
}

function buildOgPayload(article: ArticlePayload, articleSlug: string, imageUrl?: string | null) {
  const articleUrl = `${SITE_URL}/anniversaire/${articleSlug}`;
  return {
    type: 'article',
    siteName: SITE_NAME,
    locale: 'fr_FR',
    title: article.title,
    description: article.metaDescription,
    url: articleUrl,
    image: imageUrl || `${SITE_URL}/static/img/programmecesoir-social.jpg`,
  };
}

async function saveArticle(candidate: BirthdayCandidate, article: ArticlePayload, image: { url: string; alt: string } | null, age: number | null, isoDate: string) {
  if (DRY_RUN) return `${candidate.slug}-anniversaire-${isoDate}`;

  const articleSlug = `${candidate.slug}-anniversaire-${isoDate}`;
  const supabaseUrl = getOptionalEnv('VITE_SUPABASE_URL', ['SUPABASE_URL']);
  const supabaseKey = getOptionalEnv('SUPABASE_SERVICE_ROLE_KEY', ['SUPABASE_SERVICE_KEY']);

  const payload = {
    published_date: isoDate,
    birth_date_mmdd: candidate.mmdd,
    birth_year: candidate.birthYear,
    age_today: age,
    entity_type: 'actor',
    entity_slug: candidate.slug,
    entity_name: candidate.actor.name,
    article_title: article.title,
    article_slug: articleSlug,
    article_body_html: article.bodyHtml,
    article_excerpt: article.excerpt,
    image_url: image?.url ?? null,
    image_alt: image?.alt ?? null,
    upcoming_airings: candidate.actor.upcomingAirings ?? null,
    known_for: candidate.actor.knownFor ?? null,
    external_ids: candidate.actor.externalIds ?? null,
    meta_description: article.metaDescription,
    is_published: true,
    generation_model: 'deepseek-chat',
  };

  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
    const query = supabase
      .from('birthday_articles')
      .upsert(payload, {
        onConflict: 'entity_slug,published_date',
      })
      .select('article_slug')
      .single();

    const { data, error } = await query;
    if (error) throw error;
    return data.article_slug as string;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY ou DATABASE_URL requis pour sauvegarder l’article');
  }

  const sql = `
    INSERT INTO birthday_articles (
      published_date,
      birth_date_mmdd,
      birth_year,
      age_today,
      entity_type,
      entity_slug,
      entity_name,
      article_title,
      article_slug,
      article_body_html,
      article_excerpt,
      image_url,
      image_alt,
      upcoming_airings,
      known_for,
      external_ids,
      meta_description,
      is_published,
      generation_model
    ) VALUES (
      ${toSqlText(payload.published_date)},
      ${toSqlText(payload.birth_date_mmdd)},
      ${toSqlInt(payload.birth_year)},
      ${toSqlInt(payload.age_today)},
      ${toSqlText(payload.entity_type)},
      ${toSqlText(payload.entity_slug)},
      ${toSqlText(payload.entity_name)},
      ${toSqlText(payload.article_title)},
      ${toSqlText(payload.article_slug)},
      ${toSqlText(payload.article_body_html)},
      ${toSqlText(payload.article_excerpt)},
      ${toSqlText(payload.image_url)},
      ${toSqlText(payload.image_alt)},
      ${toSqlJson(payload.upcoming_airings)},
      ${toSqlJson(payload.known_for)},
      ${toSqlJson(payload.external_ids)},
      ${toSqlText(payload.meta_description)},
      ${toSqlBool(payload.is_published)},
      ${toSqlText(payload.generation_model)}
    )
    ON CONFLICT (entity_slug, published_date)
    DO UPDATE SET
      article_title = EXCLUDED.article_title,
      article_slug = EXCLUDED.article_slug,
      article_body_html = EXCLUDED.article_body_html,
      article_excerpt = EXCLUDED.article_excerpt,
      image_url = EXCLUDED.image_url,
      image_alt = EXCLUDED.image_alt,
      upcoming_airings = EXCLUDED.upcoming_airings,
      known_for = EXCLUDED.known_for,
      external_ids = EXCLUDED.external_ids,
      meta_description = EXCLUDED.meta_description,
      is_published = EXCLUDED.is_published,
      generation_model = EXCLUDED.generation_model
    RETURNING article_slug;
  `;

  return runPsqlScalar(sql);
}

async function articleAlreadyExists(candidate: BirthdayCandidate, isoDate: string) {
  if (DRY_RUN || FORCE_REGENERATE) return false;

  const supabaseUrl = getOptionalEnv('VITE_SUPABASE_URL', ['SUPABASE_URL']);
  const supabaseKey = getOptionalEnv('SUPABASE_SERVICE_ROLE_KEY', ['SUPABASE_SERVICE_KEY']);

  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
    const { data, error } = await supabase
      .from('birthday_articles')
      .select('id')
      .eq('entity_slug', candidate.slug)
      .eq('published_date', isoDate)
      .maybeSingle();

    if (error) throw error;
    return Boolean(data);
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY ou DATABASE_URL requis pour vérifier l’existence de l’article');
  }

  const sql = `
    SELECT id
    FROM birthday_articles
    WHERE entity_slug = ${toSqlText(candidate.slug)}
      AND published_date = ${toSqlText(isoDate)}
    LIMIT 1;
  `;
  return Boolean(runPsqlScalar(sql));
}

function writeRunReport(payload: Record<string, unknown>) {
  ensureDir(REPORT_DIR);
  fs.writeFileSync(REPORT_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function main() {
  loadEnv();

  const today = getToday();
  const isoDate = getTodayIsoDate(today);
  const todayMMDD = getTodayMMDD(today);
  const candidates = readActorFiles();
  const selection = selectCandidate(candidates);

  console.log(`🎂 Recherche anniversaire pour ${isoDate} (${todayMMDD})`);
  console.log(`• Candidats exacts: ${selection.exactMatches.length}`);
  console.log(`• Candidats à venir: ${selection.upcomingMatches.length}`);

  if (selection.mode === 'upcoming' && !ALLOW_UPCOMING_FALLBACK) {
    writeRunReport({
      ok: true,
      mode: 'none',
      publishedDate: isoDate,
      reason: 'Aucun anniversaire exact aujourd’hui. Fallback désactivé.',
    });
    console.log('ℹ️ Aucun anniversaire exact aujourd’hui. Fallback désactivé, arrêt propre.');
    return;
  }

  if (!selection.selected) {
    writeRunReport({
      ok: true,
      mode: 'none',
      publishedDate: isoDate,
      reason: 'Aucun acteur exploitable trouvé.',
    });
    console.log('ℹ️ Aucun acteur exploitable trouvé.');
    return;
  }

  const candidate = selection.selected;
  const mode = selection.mode;
  const age = getAgeForBirthday(candidate.birthYear, today, mode === 'exact');

  console.log(`→ Sélection: ${candidate.actor.name} (${mode === 'exact' ? 'anniversaire exact' : `prochain anniversaire dans ${candidate.daysUntilBirthday} jour(s)`})`);

  if (await articleAlreadyExists(candidate, isoDate)) {
    writeRunReport({
      ok: true,
      mode,
      publishedDate: isoDate,
      selectedActor: candidate.actor.name,
      selectedSlug: candidate.slug,
      reason: 'Article déjà présent, skip.',
    });
    console.log('⏭️ Article déjà généré pour aujourd’hui, arrêt.');
    return;
  }

  const article = await generateArticle(candidate, age, mode);
  const validationErrors = validateArticlePayload(article, candidate, mode);
  if (validationErrors.length > 0) {
    throw new Error(`Validation finale échouée: ${validationErrors.join(', ')}`);
  }

  const image = await generateImage(candidate, age, isoDate);
  const articleSlug = await saveArticle(candidate, article, image, age, isoDate);
  const structuredData = buildStructuredData(article, candidate, articleSlug, isoDate, image?.url);
  const og = buildOgPayload(article, articleSlug, image?.url);

  writeRunReport({
    ok: true,
    mode,
    dryRun: DRY_RUN,
    publishedDate: isoDate,
    selectedActor: candidate.actor.name,
    selectedSlug: candidate.slug,
    exactMatches: selection.exactMatches.map((item) => item.actor.name),
    upcomingMatches: selection.upcomingMatches.slice(0, 10).map((item) => ({
      name: item.actor.name,
      daysUntilBirthday: item.daysUntilBirthday,
    })),
    age,
    articleSlug,
    title: article.title,
    wordCount: article.wordCount,
    imageUrl: image?.url || null,
    imageAlt: image?.alt || null,
    og,
    structuredData,
  });

  console.log(`✅ Article prêt: /anniversaire/${articleSlug}`);
  console.log(`• Mots: ${article.wordCount}`);
  console.log(`• OG site_name: ${og.siteName}`);
  console.log(`• Auteur schema: ${AUTHOR_NAME}`);
  console.log(`• Report: ${REPORT_FILE}`);
}

main().catch((error) => {
  writeRunReport({
    ok: false,
    dryRun: DRY_RUN,
    error: error instanceof Error ? error.message : String(error),
    at: new Date().toISOString(),
  });
  console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
