
import React from 'react';

interface WelcomeProps {
  onStart: () => void;
}

const Welcome: React.FC<WelcomeProps> = ({ onStart }) => {
  return (
    <section id="welcome" className="flex-1 flex flex-col items-center justify-center text-center p-12 space-y-8 animate-in fade-in duration-700">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight text-white uppercase mono">Social Organizer</h1>
        <p className="text-gray-400 text-xl font-light">Record connections. Track commitments.</p>
      </div>
      
      <button 
        onClick={onStart}
        className="px-12 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded border border-indigo-400/30 transition-all uppercase tracking-widest text-sm"
      >
        Start
      </button>

      <footer className="pt-12">
        <span className="text-xs text-gray-600 uppercase tracking-widest mono">Runs inside Facebook Gaming</span>
      </footer>
    </section>
  );
};

export default Welcome;
