import React from 'react';
import type { BirthdayArticlePayload } from '../types/birthday';

interface BirthdaySpotlightProps {
  article: BirthdayArticlePayload;
  context?: 'home' | 'program' | 'actor';
  className?: string;
}

const getCopy = (article: BirthdayArticlePayload) => {
  if (article.mode === 'upcoming') {
    const next = article.upcomingMatches[0];
    return next
      ? `${article.selectedActor} sera bientôt à l'honneur. Prochain anniversaire dans ${next.daysUntilBirthday} jour${next.daysUntilBirthday > 1 ? 's' : ''}.`
      : `${article.selectedActor} sera bientôt à l'honneur sur Programme Ce Soir.`;
  }

  return article.age
    ? `Aujourd'hui, ${article.selectedActor} fête ses ${article.age} ans.`
    : `Aujourd'hui, ${article.selectedActor} est à l'honneur sur Programme Ce Soir.`;
};

export const BirthdaySpotlight: React.FC<BirthdaySpotlightProps> = ({
  article,
  context = 'home',
  className = '',
}) => {
  const asideCount = Math.max(0, article.exactMatches.length - 1);
  const eyebrow = article.mode === 'exact' ? 'Anniversaire du jour' : 'Prochain anniversaire';
  const cleanExcerpt = article.excerpt && !article.excerpt.trim().startsWith('{')
    ? article.excerpt
    : article.metaDescription;
  const description = context === 'home'
    ? cleanExcerpt
    : getCopy(article);

  return (
    <section
      className={`overflow-hidden rounded-[2rem] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-rose-50 shadow-sm ${className}`.trim()}
    >
      <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:p-8">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.28em] text-amber-800">
              {eyebrow}
            </span>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
              <a href="/anniversaire-du-jour" className="hover:text-rose-600">
                {getCopy(article)}
              </a>
            </h2>
            <p className="max-w-3xl text-sm leading-7 text-slate-600 md:text-base">
              {description}
            </p>
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            <a
              href="/anniversaire-du-jour"
              className="inline-flex items-center rounded-full bg-slate-900 px-5 py-2.5 font-bold text-white transition-colors hover:bg-slate-800"
            >
              Lire l'article
            </a>
            <a
              href={`/acteur/${article.selectedSlug}`}
              className="inline-flex items-center rounded-full border border-slate-300 px-5 py-2.5 font-bold text-slate-700 transition-colors hover:border-slate-400 hover:bg-white"
            >
              Voir la fiche acteur
            </a>
          </div>

          {asideCount > 0 ? (
            <p className="text-sm font-semibold text-rose-600">
              <a href="/anniversaires-acteurs" className="hover:underline">
                Voir les {article.exactMatches.length} anniversaires acteurs du jour
              </a>
            </p>
          ) : null}
        </div>

        <div className="hidden md:block">
          <div className="flex h-28 w-28 items-center justify-center rounded-[2rem] border border-amber-200 bg-white shadow-sm">
            <span className="text-4xl">🎂</span>
          </div>
        </div>
      </div>
    </section>
  );
};
