import React, { useEffect, useMemo, useState } from 'react';
import { fetchEntity } from '../utils/entityData';
import { buildFilmJsonLd } from '../utils/entityJsonLd';
import { useSEO } from '../utils/seo';
import { hasEntityPage } from '../utils/entityAvailability';
import { filterActiveEntityAirings } from '../utils/entityAirings';
import { NotFoundPage } from './NotFoundPage';
import type { FilmEntity } from '../types/entities';

interface FilmEntityPageProps {
  slug: string;
  initialData?: FilmEntity | null;
}

export const FilmEntityPage: React.FC<FilmEntityPageProps> = ({ slug, initialData = null }) => {
  const [entity, setEntity] = useState<FilmEntity | null>(initialData);
  const [loading, setLoading] = useState(!initialData);

  useEffect(() => {
    setEntity(initialData);
    setLoading(!initialData);
  }, [initialData, slug]);

  useSEO({
    title: entity ? `${entity.title} à la TV - Programme Ce Soir` : 'Film à la TV - Programme Ce Soir',
    description: entity?.descriptionAi || entity?.description || 'Film diffusé à la télévision française.',
    url: `/film/${slug}`,
    image: entity?.image?.url || undefined,
    type: 'article',
    category: entity?.genres?.[0],
  });

  useEffect(() => {
    let cancelled = false;
    if (!entity || entity.slug !== slug) {
      setLoading(true);
    }
    fetchEntity('film', slug, { force: true }).then((data) => {
      if (cancelled) return;
      setEntity((data as FilmEntity | null) || null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [entity?.slug, slug]);

  useEffect(() => {
    const oldScripts = document.querySelectorAll('script[data-seo="entity-film"]');
    oldScripts.forEach((script) => script.remove());
    if (!entity) return undefined;

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-seo', 'entity-film');
    script.textContent = JSON.stringify(buildFilmJsonLd(entity));
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [entity]);

  const sortedAirings = useMemo(
    () => filterActiveEntityAirings(entity?.upcomingAirings).slice().sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [entity],
  );

  if (loading && !entity) {
    return <div className="flex h-screen items-center justify-center">Chargement…</div>;
  }

  if (!entity) {
    return <NotFoundPage type="entity" onBack={() => { window.location.href = '/films'; }} />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto px-4 py-12 md:py-16">
        <div className="max-w-6xl mx-auto grid gap-10 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-6">
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              {entity.image?.url ? (
                <img src={entity.image.url} alt={entity.title} className="aspect-[2/3] w-full object-cover" loading="lazy" />
              ) : (
                <div className="aspect-[2/3] w-full bg-slate-200" />
              )}
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xs font-black uppercase tracking-[0.28em] text-slate-400 mb-3">Données</h2>
              <dl className="space-y-3 text-sm text-slate-700">
                {entity.year ? <div><dt className="font-bold text-slate-900">Année</dt><dd>{entity.year}</dd></div> : null}
                {entity.durationMinutes ? <div><dt className="font-bold text-slate-900">Durée</dt><dd>{entity.durationMinutes} min</dd></div> : null}
                {entity.director ? <div><dt className="font-bold text-slate-900">Réalisation</dt><dd>{entity.director.name}</dd></div> : null}
                {entity.genres.length ? <div><dt className="font-bold text-slate-900">Genre</dt><dd>{entity.genres.join(', ')}</dd></div> : null}
              </dl>
            </div>
          </aside>

          <div className="space-y-8">
            <header className="rounded-[2rem] bg-slate-900 p-8 text-white shadow-xl">
              <p className="text-xs font-black uppercase tracking-[0.3em] text-blue-300 mb-4">Film</p>
              <h1 className="text-4xl md:text-6xl font-black leading-[0.95] mb-5">{entity.title}</h1>
              <p className="max-w-3xl text-lg text-slate-200">
                {entity.descriptionAi || entity.description || 'Fiche film enrichie à partir de données ouvertes et des diffusions TV détectées.'}
              </p>
            </header>

            <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <h2 className="text-2xl font-black text-slate-900 mb-5">Prochaines diffusions</h2>
              {sortedAirings.length ? (
                <ul className="space-y-4">
                  {sortedAirings.slice(0, 12).map((airing) => (
                    <li key={airing.id} className="flex flex-col gap-1 border-b border-slate-100 pb-4 last:border-b-0 last:pb-0">
                      <a href={airing.programUrl} className="text-lg font-bold text-blue-600 hover:underline">
                        {airing.title}
                      </a>
                      <div className="text-sm text-slate-600">
                        {new Date(airing.startTime).toLocaleString('fr-FR', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: 'Europe/Paris',
                        })}{' '}
                        sur <a href={`/${airing.channelSlug}`} className="font-semibold text-slate-900 hover:underline">{airing.channelName}</a>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-600">Aucune diffusion détectée dans les 7 prochains jours.</p>
              )}
            </section>

            {entity.cast.length ? (
              <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                <h2 className="text-2xl font-black text-slate-900 mb-5">Distribution</h2>
                <div className="flex flex-wrap gap-3">
                  {entity.cast.slice(0, 16).map((person) => (
                    hasEntityPage('actor', person.slug) ? (
                      <a
                        key={`${person.slug}-${person.name}`}
                        href={`/acteur/${person.slug}`}
                        className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-blue-400 hover:text-blue-600"
                      >
                        {person.name}
                      </a>
                    ) : (
                      <span
                        key={`${person.slug}-${person.name}`}
                        className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-500"
                      >
                        {person.name}
                      </span>
                    )
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
