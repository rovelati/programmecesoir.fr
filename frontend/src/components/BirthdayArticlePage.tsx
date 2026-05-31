import React, { useEffect, useMemo, useState } from 'react';
import { NotFoundPage } from './NotFoundPage';
import { useSEO } from '../utils/seo';
import { fetchBirthdayArticle, fetchCurrentBirthdayArticle } from '../utils/birthdayData';
import type { BirthdayArticlePayload } from '../types/birthday';
import { hasEntityPage } from '../utils/entityAvailability';

interface BirthdayArticlePageProps {
  slug?: string;
  initialData?: BirthdayArticlePayload | null;
}

const formatBirthDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  });
};

const formatAiringDate = (value: string) =>
  new Date(value).toLocaleString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });

const getParisDay = (value: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));

const stripTvSection = (html: string) =>
  String(html || '').replace(/<h2>\s*À voir à la télévision\s*<\/h2>[\s\S]*$/i, '').trim();

const getBirthdayPageTitle = (article?: BirthdayArticlePayload | null) =>
  article ? `Anniversaire de ${article.selectedActor} - Fêtez-le avec les programmes à la TV` : 'Anniversaire acteur - Programme Ce Soir';

export const BirthdayArticlePage: React.FC<BirthdayArticlePageProps> = ({ slug, initialData = null }) => {
  const [article, setArticle] = useState<BirthdayArticlePayload | null>(initialData);
  const [loading, setLoading] = useState(!initialData);

  useEffect(() => {
    setArticle(initialData);
    setLoading(!initialData);
  }, [initialData, slug]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(!initialData);
      const payload = slug
        ? await fetchBirthdayArticle(slug, { force: true })
        : await fetchCurrentBirthdayArticle({ force: true });
      if (cancelled) return;
      if (payload) {
        setArticle(payload);
      } else if (!initialData) {
        setArticle(null);
      }
      setLoading(false);
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [initialData, slug]);

  useSEO({
    title: getBirthdayPageTitle(article),
    description: article?.metaDescription || "Chaque jour, la rédaction met à l'honneur une personnalité liée aux programmes TV.",
    image: article?.imageUrl || article?.actorImageUrl || undefined,
    canonicalUrl: `${window.location.origin}${slug ? `/anniversaire/${slug}` : '/anniversaire-du-jour'}`,
    url: slug ? `/anniversaire/${slug}` : '/anniversaire-du-jour',
    type: 'article',
    publishedTime: article ? `${article.publishedDate}T06:00:00+01:00` : undefined,
    category: 'Anniversaire du jour',
  });

  useEffect(() => {
    const oldScripts = document.querySelectorAll('script[data-seo="birthday-article"]');
    oldScripts.forEach((script) => script.remove());
    if (!article?.structuredData) return undefined;

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-seo', 'birthday-article');
    script.textContent = JSON.stringify(article.structuredData);
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [article]);

  const pageTitle = useMemo(
    () => (article?.mode === 'upcoming' ? "Prochain anniversaire de l'écran" : "Anniversaire du jour"),
    [article?.mode],
  );

  const editorialBodyHtml = useMemo(() => stripTvSection(article?.bodyHtml || ''), [article?.bodyHtml]);

  const featuredAirings = useMemo(() => {
    if (!article) return [];
    const seen = new Set<string>();
    return article.upcomingAirings.filter((airing) => {
      if (article.publishedDate && getParisDay(airing.startTime) < article.publishedDate) {
        return false;
      }
      const key = `${airing.programSlug}:${airing.channelSlug}:${airing.startTime}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 6);
  }, [article]);

  const secondaryBirthdays = useMemo(
    () => (article?.exactMatchItems || []).filter((item) => item.slug !== article.selectedSlug),
    [article],
  );

  if (loading && !article) {
    return <div className="flex h-screen items-center justify-center">Chargement…</div>;
  }

  if (!article) {
    if (!slug) {
      return (
        <div className="min-h-screen bg-slate-50">
          <div className="container mx-auto max-w-4xl px-4 py-16">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-10 shadow-sm">
              <p className="mb-3 text-xs font-black uppercase tracking-[0.32em] text-slate-400">Anniversaire du jour</p>
              <h1 className="mb-4 text-4xl font-black tracking-tight text-slate-900">Aucun portrait publié aujourd&apos;hui</h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-600">
                La rubrique anniversaire ne contient pas encore d&apos;article éditorial pour aujourd&apos;hui.
                Vous pouvez revenir plus tard ou explorer directement le catalogue des acteurs.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="/acteurs" className="rounded-full bg-slate-900 px-5 py-3 font-bold text-white hover:bg-slate-800">
                  Explorer les acteurs
                </a>
                <a href="/" className="rounded-full border border-slate-300 px-5 py-3 font-bold text-slate-700 hover:bg-slate-50">
                  Retour à l&apos;accueil
                </a>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return <NotFoundPage type="entity" onBack={() => { window.location.href = '/anniversaire-du-jour'; }} />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto max-w-6xl px-4 py-12 md:py-16">
        <div className="space-y-8">
          <header className="grid gap-8 rounded-[2rem] bg-gradient-to-br from-slate-950 via-slate-900 to-rose-900 p-8 text-white shadow-xl md:grid-cols-[minmax(0,1fr)_260px] md:p-10">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.28em] text-amber-200">
                  {pageTitle}
                </span>
                {article.mode === 'exact' && article.age ? (
                  <span className="rounded-full bg-rose-500/20 px-3 py-1 text-sm font-bold text-rose-100">
                    {article.age} ans
                  </span>
                ) : null}
              </div>
              <h1 className="max-w-4xl text-4xl font-black leading-[0.95] tracking-tight md:text-6xl">
                {article.title}
              </h1>
              <p className="max-w-3xl text-lg leading-8 text-slate-200">
                {article.metaDescription}
              </p>
              <div className="flex flex-wrap gap-3 text-sm text-slate-100">
                <span className="rounded-full bg-white/10 px-3 py-1">{article.selectedActor}</span>
                {article.actorJobTitle ? <span className="rounded-full bg-white/10 px-3 py-1">{article.actorJobTitle}</span> : null}
                {article.actorNationality ? <span className="rounded-full bg-white/10 px-3 py-1">{article.actorNationality}</span> : null}
                {article.actorBirthDate ? <span className="rounded-full bg-white/10 px-3 py-1">Né·e le {formatBirthDate(article.actorBirthDate)}</span> : null}
              </div>
            </div>

            <aside className="space-y-4 rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
              <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/5">
                {article.actorImageUrl ? (
                  <img src={article.actorImageUrl} alt={article.selectedActor} className="aspect-[4/5] w-full object-cover" loading="lazy" />
                ) : (
                  <div className="aspect-[4/5] w-full bg-white/10" />
                )}
              </div>
              <a href={`/acteur/${article.selectedSlug}`} className="inline-flex w-full items-center justify-center rounded-full bg-white px-4 py-3 text-sm font-black text-slate-900 hover:bg-slate-100">
                Voir la fiche acteur
              </a>
              {secondaryBirthdays.length ? (
                <a
                  href="/anniversaires-acteurs"
                  className="inline-flex w-full items-center justify-center rounded-full border border-white/15 bg-white/10 px-4 py-3 text-sm font-black text-white hover:bg-white/15"
                >
                  Voir tous les anniversaires acteurs
                </a>
              ) : null}
            </aside>
          </header>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <article className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
              <p className="mb-8 max-w-4xl text-xl leading-9 text-slate-600">
                {article.excerpt}
              </p>
              <div
                className="max-w-none text-slate-800 [&_a]:font-bold [&_a]:text-blue-600 [&_a]:underline-offset-4 hover:[&_a]:underline [&_em]:italic [&_h2]:mb-5 [&_h2]:mt-12 [&_h2]:text-3xl [&_h2]:font-black [&_h2]:tracking-tight [&_li]:text-lg [&_li]:leading-8 [&_p]:mb-6 [&_p]:text-[1.18rem] [&_p]:leading-9 [&_strong]:font-black [&_ul]:mb-8 [&_ul]:list-disc [&_ul]:space-y-3 [&_ul]:pl-6"
                dangerouslySetInnerHTML={{ __html: editorialBodyHtml }}
              />

              {featuredAirings.length ? (
                <section className="mt-12 rounded-[1.75rem] border border-blue-100 bg-blue-50/60 p-6">
                  <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.28em] text-blue-500">À voir à la télévision</p>
                      <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">
                        Les prochaines diffusions liées à {article.selectedActor}
                      </h2>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {featuredAirings.map((airing) => (
                      <a
                        key={airing.id}
                        href={airing.programUrl}
                        className="rounded-[1.4rem] border border-blue-100 bg-white p-5 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50"
                      >
                        <div className="text-lg font-black leading-tight text-blue-600">{airing.title}</div>
                        <div className="mt-2 text-sm leading-7 text-slate-600">
                          {formatAiringDate(airing.startTime)}
                        </div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">
                          sur {airing.channelName}
                        </div>
                      </a>
                    ))}
                  </div>
                </section>
              ) : null}

              {secondaryBirthdays.length ? (
                <section className="mt-12 rounded-[1.75rem] border border-rose-100 bg-rose-50/60 p-6">
                  <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-500">Aujourd&apos;hui aussi</p>
                      <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">
                        {secondaryBirthdays.length} autre{secondaryBirthdays.length > 1 ? 's' : ''} anniversaire{secondaryBirthdays.length > 1 ? 's' : ''} acteur{secondaryBirthdays.length > 1 ? 's' : ''}
                      </h2>
                    </div>
                    <a
                      href="/anniversaires-acteurs"
                      className="inline-flex items-center rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50"
                    >
                      Voir la page complète
                    </a>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {secondaryBirthdays.map((person) => (
                      hasEntityPage('actor', person.slug) ? (
                        <a
                          key={person.slug}
                          href={`/acteur/${person.slug}`}
                          className="rounded-[1.25rem] border border-rose-100 bg-white px-4 py-4 transition-colors hover:border-rose-200 hover:bg-rose-50"
                        >
                          <div className="font-black text-slate-900">{person.name}</div>
                          <div className="mt-1 text-sm text-slate-600">
                            {person.age ? `${person.age} ans aujourd'hui` : 'Anniversaire du jour'}
                          </div>
                        </a>
                      ) : (
                        <div
                          key={person.slug}
                          className="rounded-[1.25rem] border border-rose-100 bg-white px-4 py-4"
                        >
                          <div className="font-black text-slate-900">{person.name}</div>
                          <div className="mt-1 text-sm text-slate-600">
                            {person.age ? `${person.age} ans aujourd'hui` : 'Anniversaire du jour'}
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                </section>
              ) : null}
            </article>

            <aside className="space-y-6">
              <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-xl font-black tracking-tight text-slate-900">À voir à la télévision</h2>
                {featuredAirings.length ? (
                  <ul className="space-y-4">
                    {featuredAirings.map((airing) => (
                      <li key={airing.id} className="border-b border-slate-100 pb-4 last:border-b-0 last:pb-0">
                        <a href={airing.programUrl} className="font-bold text-blue-600 hover:underline">
                          {airing.title}
                        </a>
                        <div className="mt-1 text-sm text-slate-600">
                          {formatAiringDate(airing.startTime)} sur{' '}
                          <a href={`/${airing.channelSlug}`} className="font-semibold text-slate-900 hover:underline">
                            {airing.channelName}
                          </a>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm leading-7 text-slate-600">Aucune diffusion liée n&apos;est confirmée dans les prochains jours.</p>
                )}
              </section>

              <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-xl font-black tracking-tight text-slate-900">Connu pour</h2>
                {article.knownFor.length ? (
                  <ul className="space-y-3">
                    {article.knownFor.slice(0, 8).map((item) => (
                      <li key={`${item.type}-${item.slug}`}>
                        <a href={item.type === 'film' ? `/film/${item.slug}` : `/serie/${item.slug}`} className="font-semibold text-blue-600 hover:underline">
                          {item.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm leading-7 text-slate-600">La fiche acteur n&apos;affiche pas encore d&apos;œuvres liées dans le catalogue.</p>
                )}
              </section>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
};
