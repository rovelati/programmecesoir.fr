
import React, { useEffect, useMemo, useState } from 'react';
import { Channel, Program } from '../types';
import { getNowInParis } from '../utils/timeSlots';
import { getChannelLogo } from '../utils/channelLogos';
import { getChannelNumberLabel } from '../utils/channelNumbers';

interface ChannelDetailProps {
  channel: Channel;
  onClose: () => void;
}

export const ChannelDetail: React.FC<ChannelDetailProps> = ({ channel, onClose }) => {
  const now = useMemo(() => getNowInParis(), []);
  const [logoError, setLogoError] = useState(false);
  const channelNumberLabel = getChannelNumberLabel(channel.number);

  useEffect(() => {
    setLogoError(false);
  }, [channel.id, channel.logo, channel.name]);
  
  // Get logo with fallback
  const logoUrl = useMemo(() => {
    if (logoError) {
      return getChannelLogo(channel.id, null, channel.name);
    }
    return getChannelLogo(channel.id, channel.logo, channel.name);
  }, [channel.id, channel.logo, channel.name, logoError]);
  
  const formatHour = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  const isCurrent = (program: Program) => {
    const nowTime = now.getTime();
    const start = new Date(program.startTime).getTime();
    const end = new Date(program.endTime).getTime();
    return nowTime >= start && nowTime <= end;
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full border border-slate-100 bg-white flex items-center justify-center p-1 overflow-hidden min-w-[56px]">
              <img 
                src={logoUrl} 
                alt={channel.name} 
                className="w-full h-full object-contain max-w-full max-h-full"
                onError={() => {
                  if (!logoError) {
                    console.warn(`[ChannelDetail] Logo failed to load for ${channel.name}, using fallback`);
                    setLogoError(true);
                  }
                }}
              />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{channel.name}</h2>
              <p className="text-slate-500 font-medium">Chaîne {channelNumberLabel} • Programme du jour</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Content - Schedule List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {channel.programs.map((program) => {
            const active = isCurrent(program);
            return (
              <div 
                key={program.id} 
                className={`flex gap-6 p-4 rounded-2xl border-2 transition-all shadow-md hover:shadow-lg ${
                  active 
                    ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200 shadow-lg shadow-blue-100' 
                    : 'bg-white border-slate-300 hover:border-blue-400'
                }`}
              >
                <div className="flex-shrink-0 w-16 text-right">
                  <span className={`font-bold block ${active ? 'text-blue-600' : 'text-slate-400'}`}>
                    {formatHour(program.startTime)}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">{formatHour(program.endTime)}</span>
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {active && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white uppercase tracking-wider">
                        En direct
                      </span>
                    )}
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{program.category}</span>
                  </div>
                  <h4 className={`text-lg font-bold mb-1 ${active ? 'text-blue-900' : 'text-slate-800'}`}>
                    {program.title}
                  </h4>
                  <p className="text-sm text-slate-500 line-clamp-2 leading-relaxed">
                    {program.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
