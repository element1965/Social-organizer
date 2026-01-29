
import React from 'react';
import { Screen, UIobligation } from '../types';

interface ArchiveProps {
  obligations: UIobligation[];
  onNavigate: (s: Screen) => void;
}

const Archive: React.FC<ArchiveProps> = ({ obligations, onNavigate }) => {
  return (
    <section id="archive" className="flex-1 flex flex-col p-8 space-y-6 bg-[#16181d]">
      <header className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-400 uppercase tracking-widest opacity-80">Closed Records</h2>
        <button 
          onClick={() => onNavigate(Screen.DASHBOARD)}
          className="text-[10px] text-gray-600 hover:text-gray-400 uppercase mono border-b border-gray-800 pb-0.5"
        >
          Exit Archive
        </button>
      </header>

      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2 opacity-60">
        {obligations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 border border-gray-900 rounded">
            <span className="text-xs text-gray-700 uppercase mono">Archive empty</span>
          </div>
        ) : (
          obligations.map((o) => (
            <div 
              key={o.id}
              className="bg-gray-900/20 border border-gray-900/50 p-4 rounded grayscale flex items-center justify-between"
            >
              <div>
                <span className="text-sm font-medium text-gray-500 block">{o.targetName}</span>
                <div className="flex gap-3 mt-1">
                  <span className="text-[9px] text-gray-600 mono uppercase tracking-tight">Type: {o.type}</span>
                  <span className="text-[9px] text-gray-600 mono">Closed: {o.timestamp}</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-gray-600 mono">{o.units} U</span>
                <span className="block text-[8px] text-gray-700 uppercase mono">Resolved</span>
              </div>
            </div>
          ))
        )}
      </div>

      <footer className="pt-4 border-t border-gray-900 flex justify-center">
        <span className="text-[9px] text-gray-700 uppercase tracking-[0.3em] mono italic">History persists for record integrity.</span>
      </footer>
    </section>
  );
};

export default Archive;
