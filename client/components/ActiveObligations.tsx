
import React from 'react';
import { Screen, UIobligation } from '../types';

interface ActiveObligationsProps {
  obligations: UIobligation[];
  onNavigate: (s: Screen) => void;
  onSelectForConfirmation: (o: UIobligation) => void;
}

const ActiveObligations: React.FC<ActiveObligationsProps> = ({ obligations, onNavigate, onSelectForConfirmation }) => {
  return (
    <section id="active" className="flex-1 flex flex-col p-8 space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white uppercase tracking-tight">Active Records</h2>
        <button 
          onClick={() => onNavigate(Screen.DASHBOARD)}
          className="text-[10px] text-gray-500 hover:text-gray-300 uppercase mono border-b border-gray-800 pb-0.5"
        >
          Back to Overview
        </button>
      </header>

      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
        {obligations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 border border-dashed border-gray-800 rounded">
            <span className="text-xs text-gray-600 uppercase mono">No active records found</span>
          </div>
        ) : (
          obligations.map((o) => (
            <div 
              key={o.id}
              onClick={() => onSelectForConfirmation(o)}
              className="group cursor-pointer bg-gray-900/40 border border-gray-800 hover:border-indigo-500/50 p-4 rounded-md flex items-center transition-all"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-sm font-semibold text-gray-200">{o.targetName}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded mono ${
                    o.status === 'DECLARED' ? 'bg-blue-900/30 text-blue-400' : 'bg-teal-900/30 text-teal-400'
                  }`}>
                    {o.status}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-[10px] text-gray-500 mono">{o.type}</span>
                  <span className="text-[10px] text-gray-600 mono">{o.timestamp}</span>
                </div>
              </div>
              <div className="text-right flex flex-col items-end">
                <span className="text-lg font-bold text-gray-300 mono">{o.units} U</span>
                <span className="text-[8px] text-gray-600 uppercase tracking-tighter group-hover:text-indigo-400 transition-colors">Select to process</span>
              </div>
            </div>
          ))
        )}
      </div>

      <footer className="pt-4 border-t border-gray-800">
        <p className="text-[10px] text-gray-600 mono">Records display deterministic system states. Action required for confirmation.</p>
      </footer>
    </section>
  );
};

export default ActiveObligations;
