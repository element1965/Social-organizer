
import React from 'react';
import { UIParticipant } from '../types';

interface ConnectionsProps {
  participants: UIParticipant[];
  selectedCount: number;
  onToggle: (id: string) => void;
  onConfirm: () => void;
}

const Connections: React.FC<ConnectionsProps> = ({ participants, selectedCount, onToggle, onConfirm }) => {
  return (
    <section id="connections" className="flex-1 flex flex-col p-6 space-y-6">
      <header className="flex flex-col space-y-2">
        <h2 className="text-2xl font-bold text-white uppercase tracking-tight">Select Empathic Connections</h2>
        <p className="text-sm text-gray-400">Select up to 150 people you personally know.</p>
      </header>

      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 py-2">
        {participants.map((p) => (
          <div 
            key={p.id}
            onClick={() => onToggle(p.id)}
            className={`cursor-pointer group relative border transition-all duration-200 aspect-square flex flex-col items-center justify-center p-4 rounded-md ${
              p.selected 
                ? 'border-indigo-500 bg-indigo-900/20 ring-1 ring-indigo-500' 
                : 'border-gray-800 bg-gray-900/40 hover:border-gray-600'
            }`}
          >
            <div className={`w-12 h-12 rounded bg-gray-700 mb-2 overflow-hidden border ${p.selected ? 'border-indigo-400' : 'border-gray-600'}`}>
              <img src={p.avatar} alt={p.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100" />
            </div>
            <span className={`text-[10px] mono uppercase text-center ${p.selected ? 'text-indigo-300' : 'text-gray-500'}`}>
              {p.name}
            </span>
            {p.selected && (
              <div className="absolute top-1 right-1">
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(79,70,229,0.8)]"></div>
              </div>
            )}
          </div>
        ))}
      </div>

      <footer className="pt-4 border-t border-gray-800 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-xs text-gray-500 uppercase mono">Selection Counter</span>
          <span className={`text-lg font-bold mono ${selectedCount > 0 ? 'text-indigo-400' : 'text-gray-600'}`}>
            Selected: {selectedCount} / 150
          </span>
        </div>
        <button 
          onClick={onConfirm}
          disabled={selectedCount === 0}
          className={`px-8 py-2 rounded font-medium uppercase tracking-wider text-sm border transition-all ${
            selectedCount > 0 
              ? 'bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500' 
              : 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          Confirm Selection
        </button>
      </footer>
    </section>
  );
};

export default Connections;
