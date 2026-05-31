import React, { useEffect, useMemo, useState } from 'react';
import { fetchEntity } from '../utils/entityData';
import { fetchCurrentBirthdayArticle } from '../utils/birthdayData';
import { buildActorJsonLd } from '../utils/entityJsonLd';
import { useSEO } from '../utils/seo';
import { filterActiveEntityAirings } from '../utils/entityAirings';
import { NotFoundPage } from './NotFoundPage';
import type { ActorEntity } from '../types/entities';
import type { BirthdayArticlePayload } from '../types/birthday';
import { BirthdaySpotlight } from './BirthdaySpotlight';

interface ActorEntityPageProps {
  slug: string;
  initialData?: ActorEntity | null;
}

export const ActorEntityPage: React.FC<ActorEntityPageProps> = ({ slug, initialData = null }) => {
  const [entity, setEntity] = useState<ActorEntity | null>(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [birthdayArticle, setBirthdayArticle] = useState<BirthdayArticlePayload | null>(null);

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

  useEffect(() => {
    setEntity(initialData);
    setLoading(!initialData);
  }, [initialData, slug]);

  const actorSeoTitle = entity
    ? `${entity.name} à la TV : films, séries et diffusions - Programme Ce Soir`
    : 'Acteur à la TV : films, séries et diffusions - Programme Ce Soir';
  const actorSeoDescription = entity
    ? `${entity.name} à la TV ce soir et dans les prochains jours. Retrouvez les films, séries et chaînes où voir ${entity.name} sur Programme Ce Soir.`
    : 'Retrouvez les films, séries et diffusions TV liés à vos acteurs et réalisateurs sur Programme Ce Soir.';

  useSEO({
    title: actorSeoTitle,
    description: actorSeoDescription,
    url: `/acteur/${slug}`,
    image: entity?.image?.url || undefined,
    type: 'article',
  });

  useEffect(() => {
    let cancelled = false;
    if (!entity || entity.slug !== slug) {
      setLoading(true);
    }
    fetchEntity('actor', slug, { force: true }).then((data) => {
      if (cancelled) return;
      setEntity((data as ActorEntity | null) || null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [entity?.slug, slug]);

  useEffect(() => {
    let cancelled = false;
    fetchCurrentBirthdayArticle().then((payload) => {
      if (cancelled) return;
      if (!payload) {
        setBirthdayArticle(null);
        return;
      }
      const matchesActor =
        payload.selectedSlug === slug ||
        Boolean((payload.exactMatchItems || []).some((item) => item.slug === slug));
      setBirthdayArticle(matchesActor ? payload : null);
    });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    const oldScripts = document.querySelectorAll('script[data-seo="entity-actor"]');
    oldScripts.forEach((script) => script.remove());
    if (!entity) return undefined;

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-seo', 'entity-actor');
    script.textContent = JSON.stringify(buildActorJsonLd(entity));
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [entity]);

  const topKnownFor = useMemo(() => (entity?.knownFor || []).slice(0, 12), [entity]);
  const activeAirings = useMemo(() => filterActiveEntityAirings(entity?.upcomingAirings), [entity]);
  const birthdaySelf = useMemo(() => {
    if (!birthdayArticle) return null;
    if (birthdayArticle.selectedSlug === slug) {
      return {
        isPrimary: true,
        age: birthdayArticle.age,
      };
    }
    const secondary = (birthdayArticle.exactMatchItems || []).find((item) => item.slug === slug);
    if (!secondary) return null;
    return {
      isPrimary: false,
      age: secondary.age,
    };
  }, [birthdayArticle, slug]);

  if (loading && !entity) {
    return <div className="flex h-screen items-center justify-center">Chargement…</div>;
  }

  if (!entity) {
    return <NotFoundPage type="entity" onBack={() => { window.location.href = '/acteurs'; }} />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto px-4 py-12 md:py-16">
        <div className="max-w-5xl mx-auto space-y-8">
          {birthdayArticle && birthdaySelf?.isPrimary ? (
            <BirthdaySpotlight article={birthdayArticle} context="actor" />
          ) : null}

          {birthdayArticle && birthdaySelf && !birthdaySelf.isPrimary ? (
            <section className="rounded-[2rem] border border-rose-200 bg-gradient-to-br from-rose-50 via-white to-amber-50 p-6 shadow-sm md:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-3">
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-500">Anniversaire aujourd&apos;hui</p>
                  <h2 className="text-3xl font-black tracking-tight text-slate-900">
                    {entity.name}
                    {birthdaySelf.age ? ` fête ses ${birthdaySelf.age} ans.` : ' est à l’honneur aujourd’hui.'}
                  </h2>
                  <p className="max-w-3xl text-base leading-7 text-slate-600">
                    {entity.birthDate ? `Né·e le ${formatBirthDate(entity.birthDate)}, ` : ''}
                    cette fiche fait partie de la sélection anniversaire du jour. Le portrait éditorial principal du jour est publié dans la rubrique dédiée.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <a
                      href="/anniversaire-du-jour"
                      className="inline-flex items-center rounded-full bg-slate-900 px-5 py-2.5 font-bold text-white hover:bg-slate-800"
                    >
                      Voir la sélection anniversaire
                    </a>
                    <a
                      href={`/anniversaire/${birthdayArticle.articleSlug}`}
                      className="inline-flex items-center rounded-full border border-slate-300 px-5 py-2.5 font-bold text-slate-700 hover:border-slate-400 hover:bg-white"
                    >
                      Lire l&apos;article du jour
                    </a>
                  </div>
                </div>
                <div className="hidden h-24 w-24 items-center justify-center rounded-[1.75rem] border border-rose-200 bg-white text-4xl shadow-sm md:flex">
                  🎂
                </div>
              </div>
            </section>
          ) : null}

          <header className="grid gap-8 rounded-[2rem] bg-slate-900 p-8 text-white shadow-xl md:grid-cols-[220px_minmax(0,1fr)]">
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
              {entity.image?.url ? (
                <img src={entity.image.url} alt={entity.name} className="aspect-[3/4] w-full object-cover" loading="lazy" />
              ) : (
                <div className="aspect-[3/4] w-full bg-white/10" />
              )}
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-blue-300 mb-4">À la télévision</p>
              <h1 className="text-4xl md:text-6xl font-black leading-[0.95] mb-5">
                Films et séries avec {entity.name} à la TV
              </h1>
              <p className="max-w-3xl text-lg text-slate-200">
                {entity.descriptionAi || entity.description
                  ? `${entity.descriptionAi || entity.description} Retrouvez ici les programmes TV liés à ${entity.name}, les chaînes qui le diffusent et les œuvres à revoir.`
                  : `Retrouvez ici les programmes TV liés à ${entity.name}, les chaînes qui le diffusent et les œuvres à revoir.`}
              </p>
              <div className="mt-6 flex flex-wrap gap-3 text-sm text-slate-200">
                {entity.jobTitle ? <span className="rounded-full bg-white/10 px-3 py-1">{entity.jobTitle}</span> : null}
                {entity.nationality ? <span className="rounded-full bg-white/10 px-3 py-1">{entity.nationality}</span> : null}
                {entity.birthDate ? <span className="rounded-full bg-white/10 px-3 py-1">Né·e le {formatBirthDate(entity.birthDate)}</span> : null}
              </div>
            </div>
          </header>

          <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-black text-slate-900 mb-5">Films et séries associés</h2>
            <ul className="space-y-3">
              {topKnownFor.map((item) => (
                <li key={`${item.type}-${item.slug}`}>
                  <a
                    href={item.type === 'film' ? `/film/${item.slug}` : `/serie/${item.slug}`}
                    className="font-semibold text-blue-600 hover:underline"
                  >
                    {item.title}
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-black text-slate-900 mb-5">Programmes TV avec {entity.name}</h2>
            {activeAirings.length ? (
              <ul className="space-y-4">
                {activeAirings.slice(0, 12).map((airing) => (
                  <li key={airing.id} className="border-b border-slate-100 pb-4 last:border-b-0 last:pb-0">
                    <a href={airing.programUrl} className="font-semibold text-blue-600 hover:underline">
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
              <p className="text-slate-600">Aucune diffusion liée détectée dans les 7 prochains jours.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
