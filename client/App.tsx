import React, { useState, useEffect, useMemo } from 'react';
import { Screen, UIobligation, UIParticipant } from './types';
import { useStore } from './store';
import type { ObligationType } from './gun-sync';

// Components
import Welcome from './components/Welcome';
import Connections from './components/Connections';
import Dashboard from './components/Dashboard';
import RecordObligation from './components/RecordObligation';
import ActiveObligations from './components/ActiveObligations';
import Confirmation from './components/Confirmation';
import Archive from './components/Archive';

// Map Gun ObligationType to display string
const typeToDisplay: Record<string, UIobligation['type']> = {
  ONE_TIME: 'One-time',
  REPEATING: 'Repeating',
  INITIATIVE: 'Initiative',
};
const displayToGun: Record<string, ObligationType> = {
  'One-time': 'ONE_TIME',
  'Repeating': 'REPEATING',
  'Initiative': 'INITIATIVE',
};

const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<Screen>(Screen.WELCOME);

  const {
    myPubKey,
    initialized,
    init,
    participants: gunParticipants,
    connections: gunConnections,
    obligations: gunObligations,
    register,
    addConnection,
    addObligation,
    confirmObligations,
    closeObl,
  } = useStore();

  // Initialize Gun identity on mount
  useEffect(() => {
    init();
  }, [init]);

  // Build UI participants from Gun participants + connections
  const [selectedPubKeys, setSelectedPubKeys] = useState<Set<string>>(new Set());

  const uiParticipants: UIParticipant[] = useMemo(() => {
    return gunParticipants
      .filter(p => p.pubKey !== myPubKey)
      .map((p, i) => ({
        id: p.pubKey,
        name: `Node ${p.pubKey.slice(0, 8)}`,
        avatar: `https://picsum.photos/seed/${p.pubKey.slice(0, 6)}/100/100`,
        selected: selectedPubKeys.has(p.pubKey),
      }));
  }, [gunParticipants, myPubKey, selectedPubKeys]);

  // If no other participants yet, show mock data for UI demo
  const hasPeers = uiParticipants.length > 0;
  const [mockParticipants, setMockParticipants] = useState<UIParticipant[]>(
    Array.from({ length: 24 }).map((_, i) => ({
      id: `mock-${i}`,
      name: `Entity ${100 + i}`,
      avatar: `https://picsum.photos/seed/${i + 100}/100/100`,
      selected: false,
    }))
  );

  const displayParticipants = hasPeers ? uiParticipants : mockParticipants;

  const toggleParticipant = (id: string) => {
    if (hasPeers) {
      setSelectedPubKeys(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    } else {
      setMockParticipants(prev => prev.map(p =>
        p.id === id ? { ...p, selected: !p.selected } : p
      ));
    }
  };

  const selectedCount = useMemo(() =>
    displayParticipants.filter(p => p.selected).length
  , [displayParticipants]);

  // Map Gun obligations to UI obligations
  const uiObligations: UIobligation[] = useMemo(() => {
    return gunObligations.map(o => ({
      id: o.id,
      targetId: o.toPubKey,
      targetName: `Node ${o.toPubKey.slice(0, 8)}`,
      type: typeToDisplay[o.type] || 'One-time',
      status: o.status,
      timestamp: new Date(o.createdAt).toISOString().replace('T', ' ').substring(0, 16),
      units: o.unitAmount,
    }));
  }, [gunObligations]);

  // Fallback: local obligations for demo mode (no peers)
  const [localObligations, setLocalObligations] = useState<UIobligation[]>([]);
  const displayObligations = gunObligations.length > 0 ? uiObligations : localObligations;

  const handleRecord = (targetId: string, type: string) => {
    if (hasPeers) {
      addObligation(targetId, 1, displayToGun[type] || 'ONE_TIME');
    } else {
      const target = mockParticipants.find(p => p.id === targetId);
      const newObl: UIobligation = {
        id: `o-${Date.now()}`,
        targetId,
        targetName: target?.name || targetId,
        type: type as UIobligation['type'],
        status: 'DECLARED',
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
        units: 1,
      };
      setLocalObligations(prev => [newObl, ...prev]);
    }
    setCurrentScreen(Screen.ACTIVE);
  };

  const handleConfirmSelection = () => {
    if (hasPeers) {
      // Record connections for all selected participants
      selectedPubKeys.forEach(pub => addConnection(pub));
    }
    // Register self if not yet registered
    if (myPubKey) register(null);
    setCurrentScreen(Screen.DASHBOARD);
  };

  const handleConfirm = () => {
    if (gunObligations.length > 0) {
      confirmObligations(1);
    } else {
      // Demo mode: transition first DECLARED to CLOSED
      setLocalObligations(prev => {
        const idx = prev.findIndex(o => o.status === 'DECLARED');
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = { ...updated[idx], status: 'CLOSED' };
        return updated;
      });
    }
    setCurrentScreen(Screen.ARCHIVE);
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case Screen.WELCOME:
        return <Welcome onStart={() => setCurrentScreen(Screen.CONNECTIONS)} />;
      case Screen.CONNECTIONS:
        return (
          <Connections
            participants={displayParticipants}
            selectedCount={selectedCount}
            onToggle={toggleParticipant}
            onConfirm={handleConfirmSelection}
          />
        );
      case Screen.DASHBOARD:
        return (
          <Dashboard
            selectedCount={selectedCount}
            activeCount={displayObligations.filter(o => o.status !== 'CLOSED').length}
            closedCount={displayObligations.filter(o => o.status === 'CLOSED').length}
            onNavigate={(s) => setCurrentScreen(s)}
          />
        );
      case Screen.RECORD:
        return (
          <RecordObligation
            participants={displayParticipants.filter(p => p.selected)}
            onRecord={handleRecord}
            onCancel={() => setCurrentScreen(Screen.DASHBOARD)}
          />
        );
      case Screen.ACTIVE:
        return (
          <ActiveObligations
            obligations={displayObligations.filter(o => o.status !== 'CLOSED')}
            onNavigate={(s) => setCurrentScreen(s)}
            onSelectForConfirmation={() => setCurrentScreen(Screen.CONFIRM)}
          />
        );
      case Screen.CONFIRM:
        return (
          <Confirmation
            onConfirm={handleConfirm}
            onCancel={() => setCurrentScreen(Screen.ACTIVE)}
          />
        );
      case Screen.ARCHIVE:
        return (
          <Archive
            obligations={displayObligations.filter(o => o.status === 'CLOSED')}
            onNavigate={(s) => setCurrentScreen(s)}
          />
        );
      default:
        return <Welcome onStart={() => setCurrentScreen(Screen.CONNECTIONS)} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-4xl bg-[#1a1c23] border border-gray-800 rounded-lg shadow-2xl overflow-hidden min-h-[600px] flex flex-col">
        {renderScreen()}
      </div>
    </div>
  );
};

export default App;
