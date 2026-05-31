import React, { useEffect, useMemo, useState } from 'react';
import { useSEO } from '../utils/seo';
import { fetchNewsPageData } from '../utils/newsData';
import type { NewsPagePayload, NewsStory } from '../types/news';

interface NewsPageProps {
  initialData?: NewsPagePayload | null;
}

const NEWS_ROUTE = '/actualites';
const NEWS_TITLE = 'Actualités TV et histoires éditoriales - Programme Ce Soir';
const NEWS_DESCRIPTION = "Les actualités éditoriales de Programme Ce Soir : anniversaire du jour, publications Bluesky et pages TV à suivre.";
const FALLBACK_IMAGE = 'https://programmecesoir.fr/static/img/programmecesoir-social.jpg';

const formatPublishedAt = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });
};

const buildNewsJsonLd = (stories: NewsStory[]) => ({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'CollectionPage',
      '@id': `https://programmecesoir.fr${NEWS_ROUTE}#collectionpage`,
      name: 'Actualités TV et histoires éditoriales',
      description: NEWS_DESCRIPTION,
      url: `https://programmecesoir.fr${NEWS_ROUTE}`,
      inLanguage: 'fr-FR',
      author: { '@id': 'https://programmecesoir.fr/#organization' },
      publisher: { '@id': 'https://programmecesoir.fr/#organization' },
      mainEntity: { '@id': `https://programmecesoir.fr${NEWS_ROUTE}#itemlist` },
    },
    {
      '@type': 'ItemList',
      '@id': `https://programmecesoir.fr${NEWS_ROUTE}#itemlist`,
      itemListElement: stories.map((story, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: story.url.startsWith('http') ? story.url : `https://programmecesoir.fr${story.url}`,
        name: story.title,
      })),
    },
    ...stories.map((story) => ({
      '@type': story.kind === 'birthday' ? 'NewsArticle' : 'BlogPosting',
      '@id': `https://programmecesoir.fr${NEWS_ROUTE}#${story.id}`,
      headline: story.title,
      description: story.excerpt,
      url: story.url.startsWith('http') ? story.url : `https://programmecesoir.fr${story.url}`,
      image: story.imageUrl ? [story.imageUrl.startsWith('http') ? story.imageUrl : `https://programmecesoir.fr${story.imageUrl}`] : undefined,
      datePublished: story.publishedAt || undefined,
      author: { '@id': 'https://programmecesoir.fr/#organization' },
      publisher: { '@id': 'https://programmecesoir.fr/#organization' },
      inLanguage: 'fr-FR',
    })),
  ],
});

export const NewsPage: React.FC<NewsPageProps> = ({ initialData = null }) => {
  const [payload, setPayload] = useState<NewsPagePayload | null>(initialData);

  useSEO({
    title: NEWS_TITLE,
    description: NEWS_DESCRIPTION,
    url: NEWS_ROUTE,
    canonicalUrl: `https://programmecesoir.fr${NEWS_ROUTE}`,
    image: FALLBACK_IMAGE,
    noindex: false,
  });

  useEffect(() => {
    let cancelled = false;
    if (initialData?.ok) {
      setPayload(initialData);
      return () => {
        cancelled = true;
      };
    }

    fetchNewsPageData()
      .then((data) => {
        if (!cancelled) setPayload(data);
      })
      .catch(() => {
        if (!cancelled) setPayload(null);
      });

    return () => {
      cancelled = true;
    };
  }, [initialData]);

  const stories = useMemo(() => {
    const items = payload?.stories || [];
    return payload?.leadStory ? [payload.leadStory, ...items] : items;
  }, [payload]);

  useEffect(() => {
    const oldScripts = document.querySelectorAll('script[type="application/ld+json"][data-seo="news-page"]');
    oldScripts.forEach((script) => script.remove());

    if (!stories.length) return;

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-seo', 'news-page');
    script.textContent = JSON.stringify(buildNewsJsonLd(stories));
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [stories]);

  const leadStory = payload?.leadStory || null;
  const secondaryStories = payload?.stories || [];

  return (
    <section className="container mx-auto px-4 py-8 md:py-12">
      <div className="mb-8 border-b border-slate-200 pb-5">
        <p className="mb-3 text-[11px] font-black uppercase tracking-[0.28em] text-rose-600">Actualités</p>
        <h1 className="max-w-4xl text-4xl font-black tracking-tight text-slate-950 md:text-5xl">
          Actualités TV, angles éditoriaux et sélection sociale
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600">
          Une page magazine pour suivre l’angle éditorial du jour, les contenus sociaux déjà publiés et les pages TV à pousser ensuite dans le maillage interne.
        </p>
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
        <div className="min-w-0">
          {leadStory ? (
            <article className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
              <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_260px] md:p-8">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3 text-xs font-black uppercase tracking-[0.24em] text-slate-500">
                    <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">{leadStory.eyebrow}</span>
                    <span>{leadStory.sourceLabel}</span>
                    {formatPublishedAt(leadStory.publishedAt) ? (
                      <span>{formatPublishedAt(leadStory.publishedAt)}</span>
                    ) : null}
                  </div>
                  <h2 className="font-serif text-4xl leading-tight text-slate-950 md:text-5xl">
                    <a href={leadStory.url} className="hover:text-blue-700">
                      {leadStory.title}
                    </a>
                  </h2>
                  <p className="max-w-3xl text-lg leading-8 text-slate-700">
                    {leadStory.excerpt}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <a
                      href={leadStory.url}
                      className="inline-flex items-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-800"
                    >
                      {leadStory.ctaLabel || 'Lire'}
                    </a>
                    {leadStory.externalUrl ? (
                      <a
                        href={leadStory.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center rounded-full border border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
                      >
                        Voir la source
                      </a>
                    ) : null}
                  </div>
                </div>
                <div className="rounded-[1.75rem] border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-4">
                  {leadStory.imageUrl ? (
                    <img
                      src={leadStory.imageUrl}
                      alt={leadStory.imageAlt || leadStory.title}
                      className="h-full min-h-[240px] w-full rounded-[1.25rem] object-cover"
                    />
                  ) : (
                    <div className="flex h-full min-h-[240px] items-center justify-center rounded-[1.25rem] bg-white text-6xl">
                      📰
                    </div>
                  )}
                </div>
              </div>
            </article>
          ) : (
            <article className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
              <h2 className="font-serif text-4xl text-slate-950">Aucune actualité éditoriale disponible</h2>
              <p className="mt-4 text-slate-600">La page sera alimentée automatiquement par le portrait anniversaire et les posts Bluesky valides.</p>
            </article>
          )}
        </div>

        <aside className="space-y-5">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="mb-4 text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">Dernières publications</p>
            <div className="space-y-4">
              {secondaryStories.length ? secondaryStories.map((story) => (
                <article key={story.id} className="border-b border-slate-100 pb-4 last:border-b-0 last:pb-0">
                  <p className="mb-2 text-[11px] font-black uppercase tracking-[0.24em] text-blue-600">{story.eyebrow}</p>
                  <h3 className="text-lg font-black leading-snug text-slate-900">
                    <a href={story.url} className="hover:text-blue-700">{story.title}</a>
                  </h3>
                  <p className="mt-2 text-sm leading-7 text-slate-600">{story.excerpt}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span>{story.sourceLabel}</span>
                    {formatPublishedAt(story.publishedAt) ? <span>{formatPublishedAt(story.publishedAt)}</span> : null}
                    {story.metrics?.likes != null ? <span>{story.metrics.likes} likes</span> : null}
                    {story.metrics?.reposts != null ? <span>{story.metrics.reposts} reposts</span> : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-sm font-bold">
                    <a href={story.url} className="text-blue-700 hover:text-blue-800">
                      {story.ctaLabel || 'Ouvrir'}
                    </a>
                    {story.externalUrl ? (
                      <a href={story.externalUrl} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-slate-700">
                        Bluesky
                      </a>
                    ) : null}
                  </div>
                </article>
              )) : (
                <p className="text-sm leading-7 text-slate-500">Aucune publication Bluesky exploitable pour le moment.</p>
              )}
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-slate-950 p-6 text-white shadow-sm">
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">Maillage recommandé</p>
            <p className="mt-3 text-sm leading-7 text-slate-200">
              Cette rubrique sert aussi de hub éditorial pour renvoyer vers les pages head qui performent déjà.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-sm font-bold">
              <a href="/en-direct" className="rounded-full bg-white/10 px-3 py-2 hover:bg-white/20">En direct</a>
              <a href="/film-ce-soir" className="rounded-full bg-white/10 px-3 py-2 hover:bg-white/20">Films ce soir</a>
              <a href="/sport-ce-soir" className="rounded-full bg-white/10 px-3 py-2 hover:bg-white/20">Sport ce soir</a>
              <a href="/demain" className="rounded-full bg-white/10 px-3 py-2 hover:bg-white/20">Demain</a>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
};

export default NewsPage;
