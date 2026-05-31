
import React from 'react';

interface LogoProps {
  variant?: 'full' | 'compact';
}

export const Logo: React.FC<LogoProps> = ({ variant = 'full' }) => {
  return (
    <div className="flex items-center gap-3 select-none cursor-pointer group">
      <div className="flex h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-blue-100 transition-all duration-300 group-hover:scale-105 group-hover:rotate-1">
        <img
          src="/apple-touch-icon.png"
          alt="Programme Ce Soir"
          className="h-full w-full object-cover"
          loading="eager"
          decoding="async"
        />
      </div>

      {/* Brand Text */}
      {variant === 'full' && (
        <div className="flex flex-col -space-y-1.5 hidden sm:flex">
          <span className="text-[10px] font-black tracking-[0.3em] text-blue-600 uppercase">TNT France</span>
          <span className="text-xl font-light tracking-tighter text-slate-800">
            PROGRAMME <span className="font-black text-slate-950">CE SOIR</span>
          </span>
        </div>
      )}
    </div>
  );
};
