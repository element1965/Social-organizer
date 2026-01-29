
import React, { useState } from 'react';

interface ConfirmationProps {
  onConfirm: () => void;
  onCancel: () => void;
}

const Confirmation: React.FC<ConfirmationProps> = ({ onConfirm, onCancel }) => {
  const [val, setVal] = useState(1);

  return (
    <section id="confirm" className="flex-1 flex flex-col p-8 space-y-12 items-center justify-center">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-white uppercase tracking-tight">Confirm Completion</h2>
        <p className="text-sm text-gray-400">Confirm received commitments up to a sufficient level.</p>
      </div>

      <div className="w-full max-w-sm space-y-8 bg-gray-900/40 border border-gray-800 p-8 rounded-lg">
        <div className="space-y-4">
          <div className="flex justify-between items-end">
            <span className="text-[10px] text-gray-500 uppercase mono">Confirm up to:</span>
            <span className="text-3xl font-bold text-indigo-400 mono">{val} units</span>
          </div>
          
          <input 
            type="range" 
            min="1" 
            max="1" 
            value={val} 
            onChange={(e) => setVal(parseInt(e.target.value))}
            className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
          
          <div className="flex justify-between text-[9px] text-gray-600 mono">
            <span>MIN</span>
            <span>MAX</span>
          </div>
        </div>

        <div className="pt-4 space-y-6">
          <button 
            onClick={onConfirm}
            className="w-full py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded uppercase tracking-widest text-xs transition-all shadow-[0_0_15px_rgba(20,184,166,0.2)]"
          >
            Confirm
          </button>
          
          <p className="text-[10px] text-gray-500 text-center leading-relaxed">
            “Confirmation closes records deterministically. This process is irreversible within the active cycle.”
          </p>
        </div>
      </div>

      <button 
        onClick={onCancel}
        className="text-[10px] text-gray-500 hover:text-gray-300 uppercase mono tracking-widest"
      >
        Cancel and Return
      </button>
    </section>
  );
};

export default Confirmation;
