import React, { useEffect, useMemo, useState } from 'react';
import { fetchEntityIndex } from '../utils/entityData';
import { buildEntityIndexJsonLd } from '../utils/entityJsonLd';
import { useSEO } from '../utils/seo';
import type { EntityIndexPayload, EntityType } from '../types/entities';
import { fetchCurrentBirthdayArticle } from '../utils/birthdayData';
import type { BirthdayArticlePayload } from '../types/birthday';

interface EntityIndexPageProps {
  type: EntityType;
  initialData?: EntityIndexPayload | null;
  initialBirthdayArticle?: BirthdayArticlePayload | null;
}

const TITLES: Record<EntityType, { title: string; description: string }> = {
  film: {
    title: 'Films à voir à la TV - Programme Ce Soir',
    description: 'Films les plus diffusés à la télévision française, avec prochaines diffusions et chaînes.',
  },
  series: {
    title: 'Séries à voir à la TV - Programme Ce Soir',
    description: 'Séries les plus diffusées à la télévision française, avec prochaines diffusions et chaînes.',
  },
  actor: {
    title: 'Acteurs et réalisateurs TV - Programme Ce Soir',
    description: 'Acteurs et réalisateurs les plus présents dans les programmes TV diffusés en France.',
  },
};

export const EntityIndexPage: React.FC<EntityIndexPageProps> = ({
  type,
  initialData = null,
  initialBirthdayArticle = null,
}) => {
  const [payload, setPayload] = useState<EntityIndexPayload | null>(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [birthdayArticle, setBirthdayArticle] = useState<BirthdayArticlePayload | null>(initialBirthdayArticle);
  const copy = TITLES[type];

  useEffect(() => {
    setPayload(initialData);
    setLoading(!initialData);
    setBirthdayArticle(type === 'actor' ? initialBirthdayArticle : null);
  }, [initialData, initialBirthdayArticle, type]);

  useEffect(() => {
    let cancelled = false;

    if (type !== 'actor') {
      setBirthdayArticle(null);
      return () => {
        cancelled = true;
      };
    }

    fetchCurrentBirthdayArticle()
      .then((data) => {
        if (cancelled) return;
        setBirthdayArticle(data);
      })
      .catch(() => {
        if (cancelled) return;
        setBirthdayArticle(null);
      });

    return () => {
      cancelled = true;
    };
  }, [type]);

  useSEO({
    title: payload?.title || copy.title,
    description: payload?.description || copy.description,
    url: type === 'film' ? '/films' : type === 'series' ? '/series' : '/acteurs',
  });

  useEffect(() => {
    let cancelled = false;
    if (payload?.type === type) return undefined;

    setLoading(true);
    fetchEntityIndex(type).then((data) => {
      if (cancelled) return;
      setPayload(data);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [payload, type]);

  useEffect(() => {
    const oldScripts = document.querySelectorAll('script[data-seo="entity-index"]');
    oldScripts.forEach((script) => script.remove());

    if (!payload) return undefined;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-seo', 'entity-index');
    script.textContent = JSON.stringify(buildEntityIndexJsonLd(payload));
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, [payload]);

  const grouped = useMemo(() => {
    if (!payload) return [];
    const buckets = new Map<string, typeof payload.items>();
    payload.items.forEach((item) => {
      const letter = item.title.charAt(0).toUpperCase();
      if (!buckets.has(letter)) buckets.set(letter, []);
      buckets.get(letter)?.push(item);
    });
    return Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b, 'fr'));
  }, [payload]);

  const birthdayLead = useMemo(() => {
    if (!birthdayArticle) return null;
    const excerpt = birthdayArticle.excerpt && !birthdayArticle.excerpt.trim().startsWith('{')
      ? birthdayArticle.excerpt
      : birthdayArticle.metaDescription;
    return excerpt || birthdayArticle.metaDescription || null;
  }, [birthdayArticle]);

  if (loading && !payload) {
    return <div className="flex h-screen items-center justify-center">Chargement…</div>;
  }

  if (!payload) {
    return (
      <div className="container mx-auto px-4 py-16">
        <h1 className="text-4xl font-black text-slate-900 mb-4">{copy.title}</h1>
        <p className="text-slate-600">Le catalogue statique n’est pas encore généré.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto px-4 py-12 md:py-16">
        <div className="max-w-6xl mx-auto">
          {type === 'actor' && birthdayArticle ? (
            <section className="relative mb-10 overflow-hidden rounded-[2rem] border border-amber-200 bg-[radial-gradient(circle_at_top_left,_rgba(255,236,179,0.95),_rgba(255,255,255,0.96)_38%,_rgba(255,242,242,0.98)_75%)] shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-amber-300/30 via-rose-300/20 to-sky-300/30 blur-2xl" />
              <div className="pointer-events-none absolute -left-10 top-10 h-28 w-28 rounded-full bg-amber-300/25 blur-xl animate-pulse" />
              <div className="pointer-events-none absolute right-8 top-8 h-16 w-16 rounded-full border border-rose-300/40 bg-white/40 backdrop-blur-sm animate-bounce" style={{ animationDuration: '4.8s' }} />
              <div className="pointer-events-none absolute right-32 top-16 h-5 w-5 rotate-12 rounded-md bg-sky-300/60 animate-pulse" style={{ animationDuration: '2.4s' }} />
              <div className="pointer-events-none absolute left-1/3 top-6 h-4 w-4 rounded-full bg-rose-300/60 animate-ping" style={{ animationDuration: '3s' }} />
              <div className="pointer-events-none absolute right-1/4 top-14 text-2xl opacity-80 animate-bounce" style={{ animationDuration: '5.2s' }}>✨</div>
              <div className="pointer-events-none absolute left-24 top-20 text-xl opacity-70 animate-bounce" style={{ animationDuration: '4.4s' }}>🎉</div>
              <div className="pointer-events-none absolute right-14 bottom-10 text-3xl opacity-60 animate-pulse" style={{ animationDuration: '3.8s' }}>🎂</div>

              <div className="relative grid gap-8 px-6 py-7 md:grid-cols-[minmax(0,1fr)_220px] md:px-8 md:py-8">
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.28em] text-amber-800">
                      Anniversaire du jour
                    </span>
                    {birthdayArticle.age ? (
                      <span className="inline-flex items-center rounded-full bg-rose-500/10 px-3 py-1 text-sm font-bold text-rose-600">
                        {birthdayArticle.age} ans aujourd&apos;hui
                      </span>
                    ) : null}
                  </div>

                  <div className="space-y-3">
                    <h2 className="max-w-4xl text-3xl font-black tracking-tight text-slate-900 md:text-5xl md:leading-[0.96]">
                      <a href="/anniversaire-du-jour" className="hover:text-rose-600">
                        Aujourd&apos;hui, {birthdayArticle.selectedActor} est à l&apos;honneur.
                      </a>
                    </h2>
                    <p className="max-w-3xl text-base leading-8 text-slate-600 md:text-lg">
                      {birthdayLead}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <a
                      href="/anniversaire-du-jour"
                      className="inline-flex items-center rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white transition-transform hover:-translate-y-0.5 hover:bg-slate-800"
                    >
                      Lire le portrait anniversaire
                    </a>
                    <a
                      href={`/acteur/${birthdayArticle.selectedSlug}`}
                      className="inline-flex items-center rounded-full border border-slate-300 bg-white/80 px-5 py-3 text-sm font-black text-slate-700 transition-transform hover:-translate-y-0.5 hover:border-slate-400"
                    >
                      Voir la fiche acteur
                    </a>
                  </div>
                </div>

                <aside className="relative hidden md:flex md:items-center md:justify-end">
                  <div className="relative h-44 w-44 overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.12)]">
                    {birthdayArticle.actorImageUrl ? (
                      <img
                        src={birthdayArticle.actorImageUrl}
                        alt={birthdayArticle.selectedActor}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-6xl">🎂</div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/70 to-transparent p-4">
                      <div className="text-lg font-black text-white">{birthdayArticle.selectedActor}</div>
                    </div>
                  </div>
                </aside>
              </div>
            </section>
          ) : null}

          <div className="mb-10">
            <h1 className="text-4xl md:text-5xl font-black text-slate-900 mb-4">{payload.title}</h1>
            <p className="text-slate-600 text-lg max-w-3xl">{payload.description}</p>
          </div>
          <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
            {grouped.map(([letter, items]) => (
              <section key={letter} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-black text-slate-900 mb-4">{letter}</h2>
                <ul className="space-y-3">
                  {items.slice(0, 24).map((item) => (
                    <li key={item.href} className="flex items-start justify-between gap-3">
                      <a href={item.href} className="font-semibold text-blue-600 hover:underline">
                        {item.title}
                      </a>
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        {item.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
