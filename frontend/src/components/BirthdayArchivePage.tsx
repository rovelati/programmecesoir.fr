import React, { useEffect, useMemo, useState } from 'react';
import { useSEO } from '../utils/seo';
import { fetchBirthdayArchive } from '../utils/birthdayData';
import type { BirthdayArchivePayload } from '../types/birthday';
import { hasEntityPage } from '../utils/entityAvailability';

interface BirthdayArchivePageProps {
  initialData?: BirthdayArchivePayload | null;
}

const formatFrenchDate = (value?: string | null) => {
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

export const BirthdayArchivePage: React.FC<BirthdayArchivePageProps> = ({ initialData = null }) => {
  const [archive, setArchive] = useState<BirthdayArchivePayload | null>(initialData);
  const [loading, setLoading] = useState(!initialData);

  useEffect(() => {
    setArchive(initialData);
    setLoading(!initialData);
  }, [initialData]);

  useEffect(() => {
    let cancelled = false;
    fetchBirthdayArchive({ force: true }).then((payload) => {
      if (cancelled) return;
      setArchive(payload);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentArticle = archive?.current || null;
  const todayBirthdays = currentArticle?.exactMatchItems || [];
  const archivedArticles = useMemo(
    () => (archive?.pastArticles || []).filter((item) => item.articleSlug !== currentArticle?.articleSlug),
    [archive, currentArticle?.articleSlug],
  );

  useSEO({
    title: 'Anniversaires acteurs : portraits et programmes TV - Programme Ce Soir',
    description: "Tous les anniversaires d'acteurs repérés par Programme Ce Soir : portrait du jour, acteurs qui fêtent leur anniversaire aujourd'hui et archives éditoriales.",
    url: '/anniversaires-acteurs',
    type: 'website',
  });

  if (loading && !archive) {
    return <div className="flex h-screen items-center justify-center">Chargement…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto max-w-7xl px-4 py-12 md:py-16">
        <div className="space-y-10">
          <section className="rounded-[2rem] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-rose-50 p-8 shadow-sm md:p-10">
            <p className="text-xs font-black uppercase tracking-[0.32em] text-amber-700">Anniversaires acteurs</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-tight text-slate-900 md:text-6xl">
              Les anniversaires d&apos;acteurs à suivre avec les programmes TV
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">
              Retrouvez le portrait anniversaire du jour, tous les acteurs qui fêtent leur anniversaire aujourd&apos;hui
              et les portraits passés archivés avec leurs programmes TV.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="/anniversaire-du-jour"
                className="inline-flex items-center rounded-full bg-slate-900 px-5 py-3 font-bold text-white hover:bg-slate-800"
              >
                Voir le portrait du jour
              </a>
              <a
                href="/acteurs"
                className="inline-flex items-center rounded-full border border-slate-300 px-5 py-3 font-bold text-slate-700 hover:bg-white"
              >
                Explorer les fiches acteurs
              </a>
            </div>
          </section>

          {currentArticle ? (
            <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-500">Aujourd&apos;hui</p>
                  <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-900">
                    {todayBirthdays.length} anniversaire{todayBirthdays.length > 1 ? 's' : ''} d&apos;acteur{todayBirthdays.length > 1 ? 's' : ''} aujourd&apos;hui
                  </h2>
                  <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
                    Le portrait éditorial du jour met à l&apos;honneur {currentArticle.selectedActor}. Les autres acteurs du jour
                    restent accessibles via leur fiche dédiée.
                  </p>
                </div>
                <a
                  href={`/anniversaire/${currentArticle.articleSlug}`}
                  className="inline-flex items-center rounded-full bg-rose-500 px-5 py-3 font-bold text-white hover:bg-rose-600"
                >
                  Lire le portrait du jour
                </a>
              </div>

              <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {todayBirthdays.map((person) => {
                  const isPrimary = person.slug === currentArticle.selectedSlug;
                  const actorHref = hasEntityPage('actor', person.slug) ? `/acteur/${person.slug}` : null;
                  return (
                    <article key={person.slug} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                      <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">
                        {isPrimary ? 'Portrait du jour' : 'Anniversaire du jour'}
                      </p>
                      <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-900">{person.name}</h3>
                      <p className="mt-2 text-sm leading-7 text-slate-600">
                        {person.age ? `${person.age} ans aujourd'hui` : 'Anniversaire repéré aujourd’hui'}
                        {currentArticle.actorBirthDate && isPrimary ? ` · Né·e le ${formatFrenchDate(currentArticle.actorBirthDate)}` : ''}
                      </p>
                      <div className="mt-5 flex flex-wrap gap-3">
                        {isPrimary ? (
                          <a
                            href={`/anniversaire/${currentArticle.articleSlug}`}
                            className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
                          >
                            Lire le portrait
                          </a>
                        ) : null}
                        {actorHref ? (
                          <a
                            href={actorHref}
                            className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-white"
                          >
                            Voir la fiche acteur
                          </a>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-slate-400">Archives</p>
                <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-900">Portraits anniversaire archivés</h2>
              </div>
            </div>

            {archivedArticles.length ? (
              <div className="mt-8 grid gap-4 lg:grid-cols-2">
                {archivedArticles.map((item) => (
                  <article key={item.articleSlug} className="rounded-[1.5rem] border border-slate-200 p-5 transition-colors hover:border-slate-300">
                    <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">
                      {formatFrenchDate(item.publishedDate)}
                    </p>
                    <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-900">{item.selectedActor}</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-600">
                      {item.age ? `${item.age} ans à la date du portrait` : 'Portrait anniversaire archivé'}
                    </p>
                    <p className="mt-4 text-sm leading-7 text-slate-600">{item.excerpt}</p>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <a
                        href={`/anniversaire/${item.articleSlug}`}
                        className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
                      >
                        Lire l&apos;article
                      </a>
                      {hasEntityPage('actor', item.selectedSlug) ? (
                        <a
                          href={`/acteur/${item.selectedSlug}`}
                          className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-white"
                        >
                          Voir la fiche acteur
                        </a>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-6 text-base leading-7 text-slate-600">
                Aucun portrait anniversaire archivé pour le moment.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
