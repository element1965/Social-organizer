export enum Platform {
  FACEBOOK = 'FACEBOOK',
  TELEGRAM = 'TELEGRAM',
  APPLE = 'APPLE',
  GOOGLE = 'GOOGLE',
}

export enum UserRole {
  REGULAR = 'REGULAR',
  AUTHOR = 'AUTHOR',
  DEVELOPER = 'DEVELOPER',
}

export enum Theme {
  LIGHT = 'LIGHT',
  DARK = 'DARK',
  SYSTEM = 'SYSTEM',
}

export enum CollectionType {
  EMERGENCY = 'EMERGENCY',
  REGULAR = 'REGULAR',
}

export enum CollectionStatus {
  ACTIVE = 'ACTIVE',
  BLOCKED = 'BLOCKED',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
}

export enum NotificationType {
  NEW_COLLECTION = 'NEW_COLLECTION',
  COLLECTION_BLOCKED = 'COLLECTION_BLOCKED',
  COLLECTION_CLOSED = 'COLLECTION_CLOSED',
  NEW_OBLIGATION = 'NEW_OBLIGATION',
  RE_NOTIFY = 'RE_NOTIFY',
  SPECIAL_AUTHOR = 'SPECIAL_AUTHOR',
  SPECIAL_DEVELOPER = 'SPECIAL_DEVELOPER',
  INVITE_ACCEPTED = 'INVITE_ACCEPTED',
}

export enum NotificationStatus {
  UNREAD = 'UNREAD',
  READ = 'READ',
  DISMISSED = 'DISMISSED',
  RESPONDED = 'RESPONDED',
  EXPIRED = 'EXPIRED',
}

export interface UserProfile {
  id: string;
  name: string;
  bio: string | null;
  phone: string | null;
  photoUrl: string | null;
  language: string;
  theme: Theme;
  soundEnabled: boolean;
  fontScale: number;
  role: UserRole;
  createdAt: Date;
}

export interface ConnectionInfo {
  id: string;
  userId: string;
  name: string;
  photoUrl: string | null;
  createdAt: Date;
}

export interface CollectionInfo {
  id: string;
  creatorId: string;
  creatorName: string;
  type: CollectionType;
  amount: number;
  currency: string;
  chatLink: string;
  status: CollectionStatus;
  currentAmount: number;
  obligationsCount: number;
  cycleNumber: number;
  createdAt: Date;
}

export interface ObligationInfo {
  id: string;
  collectionId: string;
  userId: string;
  userName: string;
  amount: number;
  isSubscription: boolean;
  createdAt: Date;
}

export interface NotificationInfo {
  id: string;
  collectionId: string;
  type: NotificationType;
  handshakePath: string[];
  status: NotificationStatus;
  wave: number;
  expiresAt: Date;
  createdAt: Date;
  collection: {
    creatorName: string;
    amount: number;
    currency: string;
    type: CollectionType;
  };
}
