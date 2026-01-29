export enum Screen {
  WELCOME = 'welcome',
  CONNECTIONS = 'connections',
  DASHBOARD = 'dashboard',
  RECORD = 'record',
  ACTIVE = 'active',
  CONFIRM = 'confirm',
  ARCHIVE = 'archive'
}

// UI-level obligation (maps from Gun Obligation for display)
export interface UIobligation {
  id: string;
  targetId: string;
  targetName: string;
  type: 'One-time' | 'Repeating' | 'Initiative';
  status: 'DECLARED' | 'CONFIRMED' | 'CLOSED';
  timestamp: string;
  units: number;
}

// UI-level participant (for display in connections grid)
export interface UIParticipant {
  id: string;       // pubKey
  name: string;
  avatar: string;
  selected: boolean;
}
