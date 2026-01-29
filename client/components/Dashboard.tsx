
import React from 'react';
import { Screen } from '../types';

interface DashboardProps {
  selectedCount: number;
  activeCount: number;
  closedCount: number;
  onNavigate: (s: Screen) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ selectedCount, activeCount, closedCount, onNavigate }) => {
  return (
    <section id="dashboard" className="flex-1 flex flex-col p-8 space-y-8">
      <header>
        <h2 className="text-2xl font-bold text-white uppercase tracking-tight">Network Overview</h2>
      </header>

      <div className="flex-1 flex flex-col md:flex-row gap-8 items-center justify-center">
        {/* Abstract Node Visual */}
        <div className="relative w-64 h-64 node-network border border-gray-800 rounded-full flex items-center justify-center">
          <div className="absolute inset-0 flex items-center justify-center opacity-20">
             <div className="w-[80%] h-[80%] border border-indigo-500 rounded-full animate-spin-slow"></div>
          </div>
          <div className="z-10 bg-[#1a1c23] border-2 border-indigo-500 p-6 rounded-full shadow-[0_0_30px_rgba(79,70,229,0.2)]">
            <div className="flex flex-col items-center">
              <span className="text-3xl font-bold text-white mono">{selectedCount}</span>
              <span className="text-[10px] text-gray-500 uppercase tracking-widest">Nodes</span>
            </div>
          </div>
          
          {/* Decorative nodes */}
          <div className="absolute top-10 right-4 w-3 h-3 bg-indigo-500/40 rounded-full"></div>
          <div className="absolute bottom-12 left-2 w-2 h-2 bg-indigo-400/30 rounded-full"></div>
          <div className="absolute top-1/2 -left-3 w-4 h-4 border border-indigo-500/50 rounded-sm rotate-45"></div>
        </div>

        {/* Metrics */}
        <div className="flex-1 grid grid-cols-1 gap-4 w-full">
          <div className="bg-gray-900/40 border border-gray-800 p-4 rounded-md">
            <span className="block text-[10px] text-gray-500 uppercase mono mb-1">Connections Recorded</span>
            <span className="text-2xl font-semibold text-white">{selectedCount}</span>
          </div>
          <div className="bg-gray-900/40 border border-gray-800 p-4 rounded-md">
            <span className="block text-[10px] text-gray-500 uppercase mono mb-1">Active Obligations</span>
            <span className="text-2xl font-semibold text-indigo-400">{activeCount}</span>
          </div>
          <div className="bg-gray-900/40 border border-gray-800 p-4 rounded-md">
            <span className="block text-[10px] text-gray-500 uppercase mono mb-1">Closed Obligations</span>
            <span className="text-2xl font-semibold text-gray-400">{closedCount}</span>
          </div>
        </div>
      </div>

      <footer className="grid grid-cols-2 gap-4">
        <button 
          onClick={() => onNavigate(Screen.RECORD)}
          className="py-3 bg-indigo-600/10 border border-indigo-500/50 hover:bg-indigo-600/20 text-indigo-300 font-medium rounded uppercase tracking-wider text-xs transition-colors"
        >
          Record New Obligation
        </button>
        <button 
          onClick={() => onNavigate(Screen.ACTIVE)}
          className="py-3 bg-gray-800/40 border border-gray-700 hover:bg-gray-800 text-gray-300 font-medium rounded uppercase tracking-wider text-xs transition-colors"
        >
          View Records
        </button>
      </footer>
    </section>
  );
};

export default Dashboard;
