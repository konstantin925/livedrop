import React from 'react';
import { View } from '../types';
import { Zap, Ticket, Briefcase, MapPin } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  currentView: View;
  onViewChange: (view: View) => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, currentView, onViewChange }) => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col max-w-md mx-auto shadow-2xl overflow-hidden border-x border-slate-200">
      {/* Header */}
      <header className="p-6 pt-8 flex justify-between items-center border-b border-slate-100 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div>
          <h1 className="text-2xl font-black tracking-tighter flex items-center gap-1">
            LIVE<span className="text-indigo-600">DROP</span>
            <Zap size={20} className="fill-indigo-600 text-indigo-600" />
          </h1>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">Deals drop live.</p>
        </div>
        <div className="bg-slate-100 p-2 rounded-full text-slate-500">
          <MapPin size={18} />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 pb-24">
        {children}
      </main>

      {/* Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-slate-100 px-6 py-4 flex justify-between items-center z-50">
        <NavButton 
          active={currentView === 'live-deals'} 
          onClick={() => onViewChange('live-deals')}
          icon={<Zap size={24} />}
          label="Live"
        />
        <NavButton 
          active={currentView === 'my-claims'} 
          onClick={() => onViewChange('my-claims')}
          icon={<Ticket size={24} />}
          label="Claims"
        />
        <NavButton 
          active={currentView === 'business-portal'} 
          onClick={() => onViewChange('business-portal')}
          icon={<Briefcase size={24} />}
          label="Portal"
        />
      </nav>
    </div>
  );
};

interface NavButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

const NavButton: React.FC<NavButtonProps> = ({ active, onClick, icon, label }) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center gap-1 transition-all ${active ? 'text-indigo-600 scale-110' : 'text-slate-400'}`}
  >
    {icon}
    <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
  </button>
);
