
import React, { useState } from 'react';
import { UIParticipant } from '../types';

interface RecordObligationProps {
  participants: UIParticipant[];
  onRecord: (targetId: string, type: string) => void;
  onCancel: () => void;
}

const RecordObligation: React.FC<RecordObligationProps> = ({ participants, onRecord, onCancel }) => {
  const [selectedTarget, setSelectedTarget] = useState(participants[0]?.id || '');
  const [type, setType] = useState('One-time');

  return (
    <section id="record" className="flex-1 flex flex-col p-8 space-y-8">
      <header>
        <h2 className="text-2xl font-bold text-white uppercase tracking-tight">New Obligation</h2>
      </header>

      <div className="space-y-6 max-w-md">
        <div className="space-y-2">
          <label className="block text-[10px] text-gray-500 uppercase mono">Target Participant</label>
          <select 
            value={selectedTarget}
            onChange={(e) => setSelectedTarget(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 p-3 rounded text-sm text-gray-300 focus:outline-none focus:border-indigo-500 appearance-none"
          >
            {participants.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="block text-[10px] text-gray-500 uppercase mono">Unit Amount</label>
          <input 
            type="text" 
            value="1" 
            disabled 
            className="w-full bg-gray-900/50 border border-gray-800 p-3 rounded text-sm text-gray-600 cursor-not-allowed mono" 
          />
        </div>

        <div className="space-y-2">
          <label className="block text-[10px] text-gray-500 uppercase mono">Type Selector</label>
          <div className="grid grid-cols-3 gap-2">
            {['One-time', 'Repeating', 'Initiative'].map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`py-2 text-[10px] border rounded uppercase tracking-wider mono transition-all ${
                  type === t 
                    ? 'border-indigo-500 bg-indigo-900/30 text-indigo-300' 
                    : 'border-gray-800 text-gray-500 hover:border-gray-600'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-gray-900/60 border-l-2 border-indigo-500/40 p-4">
          <p className="text-xs text-gray-500 italic leading-relaxed">
            “This records a voluntary commitment. Execution happens outside the organizer.”
          </p>
        </div>
      </div>

      <footer className="mt-auto pt-8 flex gap-4">
        <button 
          onClick={() => onRecord(selectedTarget, type)}
          className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded uppercase tracking-widest text-xs shadow-lg shadow-indigo-900/20 transition-all"
        >
          Record
        </button>
        <button 
          onClick={onCancel}
          className="px-8 py-3 bg-transparent border border-gray-800 text-gray-500 hover:text-gray-400 hover:border-gray-700 rounded uppercase tracking-widest text-xs transition-all"
        >
          Cancel
        </button>
      </footer>
    </section>
  );
};

export default RecordObligation;
