// ============================================================
// Demo mock data for all tRPC procedures
// Used when accessToken === 'demo-token'
// ============================================================

const DEMO_USER_ID = 'demo-user';

// ---------- User generation ----------

const firstNames = [
  'Алексей', 'Мария', 'Дмитрий', 'Елена', 'Сергей',
  'Анна', 'Иван', 'Ольга', 'Андрей', 'Наталья',
  'Михаил', 'Татьяна', 'Николай', 'Екатерина', 'Павел',
  'Юлия', 'Владимир', 'Светлана', 'Артём', 'Ирина',
];

const lastNames = [
  'Петров', 'Иванова', 'Сидоров', 'Козлова', 'Смирнов',
  'Новикова', 'Морозов', 'Волкова', 'Лебедев', 'Соколова',
];

interface DemoUser {
  id: string;
  name: string;
  photoUrl: string | null;
  role: string;
  createdAt: string;
  deletedAt: null;
  bio: string | null;
  phone: string | null;
  language: string;
  theme: string;
  soundEnabled: boolean;
  fontScale: number;
}

const baseDate = new Date('2025-06-01T10:00:00Z');

function makeUser(id: string, name: string, idx: number): DemoUser {
  const d = new Date(baseDate);
  d.setDate(d.getDate() - idx);
  return {
    id,
    name,
    photoUrl: null,
    role: 'USER',
    createdAt: d.toISOString(),
    deletedAt: null,
    bio: idx % 3 === 0 ? `Bio of ${name}` : null,
    phone: idx % 4 === 0 ? `+38067${String(1000000 + idx).slice(1)}` : null,
    language: 'ru',
    theme: 'DARK',
    soundEnabled: true,
    fontScale: 1.0,
  };
}

let demoUser: DemoUser & {
  onboardingCompleted: boolean;
  preferredCurrency: string;
  monthlyBudget: number | null;
  remainingBudget: number | null;
  budgetUpdatedAt: string | null;
} = {
  id: DEMO_USER_ID,
  name: 'Алексей Петров',
  photoUrl: null,
  role: 'USER',
  createdAt: '2025-01-15T08:00:00Z',
  preferredCurrency: 'UAH',
  deletedAt: null,
  bio: 'Демо-пользователь Social Organizer',
  phone: '+380671234567',
  language: 'ru',
  theme: 'DARK',
  soundEnabled: true,
  fontScale: 1.0,
  onboardingCompleted: false,
  monthlyBudget: 200,
  remainingBudget: 150,
  budgetUpdatedAt: new Date().toISOString(),
};

const users: DemoUser[] = [demoUser];
let userIdx = 1;
for (let fi = 0; fi < firstNames.length; fi++) {
  for (let li = 0; li < lastNames.length; li++) {
    const id = `user-${userIdx}`;
    const name = `${firstNames[fi]} ${lastNames[li]}`;
    users.push(makeUser(id, name, userIdx));
    userIdx++;
  }
}

const usersMap = new Map<string, DemoUser>();
for (const u of users) usersMap.set(u.id, u);

// ---------- Connections (12 direct) ----------

const connectionUserIds = users.slice(1, 13).map((u) => u.id);

const connectionNicknames: Record<string, string> = {
  'user-1': 'Лёша работа',
  'user-3': 'Маша соседка',
};

const connections = connectionUserIds.map((uid, i) => {
  const nickname = connectionNicknames[uid] || null;
  const name = usersMap.get(uid)!.name;
  return {
    id: `conn-${i + 1}`,
    userId: uid,
    name,
    photoUrl: null,
    createdAt: new Date(Date.now() - (i + 1) * 86_400_000 * 3).toISOString(),
    connectionCount: 5 + Math.floor(Math.random() * 20),
    remainingBudget: Math.random() > 0.3 ? Math.floor(50 + Math.random() * 200) : null,
    nickname,
    displayName: nickname || name,
  };
});

// ---------- Graph slice (~60 nodes, ~80 edges, 3 levels) ----------

function buildGraphSlice() {
  const nodes: Array<{ id: string; name: string; photoUrl: string | null }> = [];
  const edges: Array<{ from: string; to: string }> = [];
  const added = new Set<string>();

  const addNode = (id: string) => {
    if (added.has(id)) return;
    added.add(id);
    const u = usersMap.get(id);
    nodes.push({ id, name: u?.name ?? id, photoUrl: null });
  };

  // Level 0: demo-user
  addNode(DEMO_USER_ID);

  // Level 1: 12 direct connections
  const level1 = connectionUserIds; // 12
  for (const uid of level1) {
    addNode(uid);
    edges.push({ from: DEMO_USER_ID, to: uid });
  }

  // Level 2: each L1 user has 3-4 connections to new users
  const level2: string[] = [];
  let l2idx = 13;
  for (const l1 of level1) {
    const cnt = 3 + (l2idx % 2); // 3 or 4
    for (let j = 0; j < cnt && l2idx < 50; j++) {
      const uid = users[l2idx]!.id;
      addNode(uid);
      edges.push({ from: l1, to: uid });
      level2.push(uid);
      l2idx++;
    }
  }

  // Level 3: some L2 users have 1-2 connections
  let l3idx = 50;
  for (let k = 0; k < level2.length && l3idx < 73; k += 2) {
    const l2u = level2[k]!;
    const cnt = 1 + (l3idx % 2);
    for (let j = 0; j < cnt && l3idx < 73; j++) {
      const uid = users[l3idx]!.id;
      addNode(uid);
      edges.push({ from: l2u, to: uid });
      l3idx++;
    }
  }

  // Cross-edges between some L2 nodes for visual density
  for (let i = 0; i < level2.length - 1; i += 3) {
    edges.push({ from: level2[i]!, to: level2[i + 1]! });
  }

  return { nodes, edges };
}

const graphSlice = buildGraphSlice();

// ---------- Collections ----------

const collections = [
  {
    id: 'coll-1',
    creatorId: DEMO_USER_ID,
    type: 'EMERGENCY' as const,
    amount: 500,
    currency: 'USD',
    chatLink: 'https://t.me/demo_chat_1',
    status: 'ACTIVE' as const,
    currentCycleStart: null,
    cycleNumber: 0,
    createdAt: '2025-11-20T12:00:00Z',
    updatedAt: '2025-11-20T12:00:00Z',
    closedAt: null,
    blockedAt: null,
    currentAmount: 280,
    _count: { obligations: 5 },
    creator: { id: DEMO_USER_ID, name: demoUser.name, photoUrl: null },
  },
  {
    id: 'coll-2',
    creatorId: DEMO_USER_ID,
    type: 'REGULAR' as const,
    amount: 1000,
    currency: 'EUR',
    chatLink: 'https://t.me/demo_chat_2',
    status: 'ACTIVE' as const,
    currentCycleStart: '2025-11-01T00:00:00Z',
    cycleNumber: 1,
    createdAt: '2025-10-15T09:30:00Z',
    updatedAt: '2025-11-01T00:00:00Z',
    closedAt: null,
    blockedAt: null,
    currentAmount: 350,
    _count: { obligations: 4 },
    creator: { id: DEMO_USER_ID, name: demoUser.name, photoUrl: null },
  },
];

// Obligations for collection details
function collectionObligations(collId: string) {
  const base = collId === 'coll-1'
    ? [
        { uid: 'user-1', amount: 50 },
        { uid: 'user-2', amount: 80 },
        { uid: 'user-3', amount: 50 },
        { uid: 'user-5', amount: 60 },
        { uid: 'user-7', amount: 40 },
      ]
    : [
        { uid: 'user-2', amount: 100 },
        { uid: 'user-4', amount: 100 },
        { uid: 'user-6', amount: 75 },
        { uid: 'user-8', amount: 75 },
      ];

  return base.map((o, i) => ({
    id: `obl-${collId}-${i}`,
    collectionId: collId,
    userId: o.uid,
    amount: o.amount,
    isSubscription: collId === 'coll-2',
    unsubscribedAt: null,
    createdAt: new Date(Date.now() - i * 86_400_000).toISOString(),
    updatedAt: new Date(Date.now() - i * 86_400_000).toISOString(),
    user: {
      id: o.uid,
      name: usersMap.get(o.uid)!.name,
      photoUrl: null,
    },
  }));
}

// ---------- My obligations ----------

const myObligations = [
  {
    id: 'my-obl-1',
    collectionId: 'ext-coll-1',
    userId: DEMO_USER_ID,
    amount: 50,
    isSubscription: false,
    unsubscribedAt: null,
    createdAt: '2025-11-18T14:00:00Z',
    updatedAt: '2025-11-18T14:00:00Z',
    collection: {
      id: 'ext-coll-1',
      creatorId: 'user-3',
      type: 'EMERGENCY',
      amount: 300,
      currency: 'USD',
      chatLink: 'https://t.me/ext_chat_1',
      status: 'ACTIVE',
      currentCycleStart: null,
      createdAt: '2025-11-10T10:00:00Z',
      updatedAt: '2025-11-10T10:00:00Z',
      closedAt: null,
      blockedAt: null,
      creator: { id: 'user-3', name: usersMap.get('user-3')!.name, photoUrl: null, connectionCount: 15, remainingBudget: 120 },
    },
  },
  {
    id: 'my-obl-2',
    collectionId: 'ext-coll-2',
    userId: DEMO_USER_ID,
    amount: 100,
    isSubscription: true,
    unsubscribedAt: null,
    createdAt: '2025-10-20T11:00:00Z',
    updatedAt: '2025-10-20T11:00:00Z',
    collection: {
      id: 'ext-coll-2',
      creatorId: 'user-5',
      type: 'REGULAR',
      amount: 800,
      currency: 'EUR',
      chatLink: 'https://t.me/ext_chat_2',
      status: 'ACTIVE',
      currentCycleStart: '2025-11-01T00:00:00Z',
      createdAt: '2025-09-15T08:00:00Z',
      updatedAt: '2025-11-01T00:00:00Z',
      closedAt: null,
      blockedAt: null,
      creator: { id: 'user-5', name: usersMap.get('user-5')!.name, photoUrl: null, connectionCount: 22, remainingBudget: 85 },
    },
  },
  {
    id: 'my-obl-3',
    collectionId: 'ext-coll-3',
    userId: DEMO_USER_ID,
    amount: 25,
    isSubscription: false,
    unsubscribedAt: null,
    createdAt: '2025-11-22T16:00:00Z',
    updatedAt: '2025-11-22T16:00:00Z',
    collection: {
      id: 'ext-coll-3',
      creatorId: 'user-9',
      type: 'EMERGENCY',
      amount: 200,
      currency: 'USD',
      chatLink: 'https://t.me/ext_chat_3',
      status: 'ACTIVE',
      currentCycleStart: null,
      createdAt: '2025-11-21T09:00:00Z',
      updatedAt: '2025-11-21T09:00:00Z',
      closedAt: null,
      blockedAt: null,
      creator: { id: 'user-9', name: usersMap.get('user-9')!.name, photoUrl: null, connectionCount: 8, remainingBudget: 200 },
    },
  },
];

// ---------- Notifications ----------

const notificationTypes = [
  'NEW_COLLECTION',
  'COLLECTION_BLOCKED',
  'OBLIGATION_RECEIVED',
  'CYCLE_CLOSED',
  'COLLECTION_CLOSED',
] as const;

// New urgent notification - for collection where user hasn't participated yet
const urgentNotification = {
  id: 'notif-urgent',
  userId: DEMO_USER_ID,
  collectionId: 'ext-coll-new',
  type: 'NEW_COLLECTION' as const,
  status: 'UNREAD',
  readAt: null,
  handshakePath: [DEMO_USER_ID, 'user-1', 'user-3'],
  wave: 1,
  expiresAt: new Date(Date.now() + 23 * 3600_000).toISOString(),
  createdAt: new Date(Date.now() - 30 * 60_000).toISOString(), // 30 min ago
  updatedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
  sender: {
    id: 'user-3',
    name: usersMap.get('user-3')!.name,
    photoUrl: null,
    connectionCount: 7,
    remainingBudget: 120,
  },
  collection: {
    id: 'ext-coll-new',
    creatorId: 'user-3',
    type: 'EMERGENCY' as const,
    amount: 300,
    currency: 'USD',
    chatLink: 'https://t.me/help_needed_chat',
    status: 'ACTIVE',
    currentCycleStart: null,
    createdAt: '2025-11-22T08:00:00Z',
    updatedAt: '2025-11-22T08:00:00Z',
    closedAt: null,
    blockedAt: null,
    creator: {
      id: 'user-3',
      name: usersMap.get('user-3')!.name,
      photoUrl: null,
      connectionCount: 7,
      remainingBudget: 120,
    },
  },
};

const notifications = [
  urgentNotification,
  ...notificationTypes.map((type, i) => {
    const creatorId = i < 2 ? 'user-3' : 'user-5';
    const creator = usersMap.get(creatorId)!;
    return {
      id: `notif-${i + 1}`,
      userId: DEMO_USER_ID,
      collectionId: i < 2 ? 'ext-coll-1' : 'ext-coll-2',
      type,
      status: i < 3 ? 'UNREAD' : 'READ',
      readAt: i < 3 ? null : new Date(Date.now() - i * 3600_000).toISOString(),
      handshakePath: i === 0
        ? [DEMO_USER_ID]
        : [DEMO_USER_ID, `user-${i}`, `user-${i + 5}`],
      wave: 1,
      expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
      createdAt: new Date(Date.now() - i * 3600_000 * 2).toISOString(),
      updatedAt: new Date(Date.now() - i * 3600_000 * 2).toISOString(),
      sender: {
        id: creatorId,
        name: creator.name,
        photoUrl: null,
        connectionCount: Math.floor(Math.random() * 12) + 3,
        remainingBudget: Math.floor(50 + Math.random() * 150),
      },
      collection: {
        id: i < 2 ? 'ext-coll-1' : 'ext-coll-2',
        creatorId,
        type: i < 2 ? 'EMERGENCY' : 'REGULAR',
        amount: i < 2 ? 300 : 800,
        currency: i < 2 ? 'USD' : 'EUR',
        chatLink: i < 2 ? 'https://t.me/ext_chat_1' : 'https://t.me/ext_chat_2',
        status: 'ACTIVE',
        currentCycleStart: null,
        createdAt: '2025-11-10T10:00:00Z',
        updatedAt: '2025-11-10T10:00:00Z',
        closedAt: null,
        blockedAt: null,
        creator: {
          id: creatorId,
          name: creator.name,
          photoUrl: null,
          connectionCount: Math.floor(Math.random() * 12) + 3,
          remainingBudget: Math.floor(50 + Math.random() * 150),
        },
      },
    };
  }),
];

// ---------- Invite timing (simulates acceptance after 5 seconds) ----------

let demoInviteGeneratedAt: number | null = null;

// ---------- Settings state (mutable within demo session) ----------

let settingsState = {
  language: 'ru',
  theme: 'DARK',
  soundEnabled: true,
  voiceGender: 'FEMALE' as 'FEMALE' | 'MALE',
  fontScale: 1.0,
};

// ---------- Router ----------

export function handleDemoRequest(path: string, input: unknown): unknown {
  const inp = input as Record<string, unknown> | undefined;

  switch (path) {
    // ---- Auth ----
    case 'auth.generateLinkCode':
      return { code: '123456', expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() };
    case 'auth.registerWithEmail':
    case 'auth.loginWithEmail':
    case 'auth.loginWithTelegram':
    case 'auth.loginWithPlatform':
      return { accessToken: 'demo-token', refreshToken: 'demo-refresh', userId: DEMO_USER_ID };
    case 'auth.refresh':
      return { accessToken: 'demo-token', refreshToken: 'demo-refresh' };
    case 'auth.linkAccount':
      return { success: true, linkedUserId: DEMO_USER_ID };

    // ---- User ----
    case 'user.me':
      return {
        ...demoUser,
        platformAccounts: [{ platform: 'TELEGRAM', platformId: 'demo-tg-123' }],
      };
    case 'user.getById': {
      const userId = inp?.userId as string;
      const u = usersMap.get(userId);
      if (!u) return { id: userId, name: 'Unknown', photoUrl: null, role: 'USER', createdAt: baseDate.toISOString(), deletedAt: null, bio: null, phone: null };
      return { id: u.id, name: u.name, bio: u.bio, phone: u.phone, photoUrl: u.photoUrl, role: u.role, createdAt: u.createdAt, deletedAt: u.deletedAt };
    }
    case 'user.getStats': {
      const uid = (inp?.userId as string) ?? DEMO_USER_ID;
      if (uid === DEMO_USER_ID) return { connectionsCount: 12, collectionsCount: 2, obligationsCount: 3 };
      return { connectionsCount: Math.floor(Math.random() * 20) + 1, collectionsCount: Math.floor(Math.random() * 3), obligationsCount: Math.floor(Math.random() * 5) };
    }
    case 'user.update':
      return { ...demoUser, ...inp, platformAccounts: [{ platform: 'TELEGRAM', platformId: 'demo-tg-123' }] };
    case 'user.delete':
      return { success: true };
    case 'user.completeOnboarding':
      demoUser.onboardingCompleted = true;
      return { success: true };
    case 'user.setPreferredCurrency':
      demoUser.preferredCurrency = (inp?.currency as string) ?? 'USD';
      return { ...demoUser, platformAccounts: [{ platform: 'TELEGRAM', platformId: 'demo-tg-123' }] };
    case 'user.setMonthlyBudget': {
      const amount = (inp?.amount as number) ?? 0;
      demoUser.monthlyBudget = amount;
      demoUser.remainingBudget = amount;
      demoUser.budgetUpdatedAt = new Date().toISOString();
      return { ...demoUser, platformAccounts: [{ platform: 'TELEGRAM', platformId: 'demo-tg-123' }] };
    }
    case 'user.getContacts': {
      const contactTypes = [
        { type: 'telegram', label: 'Telegram', icon: 'telegram', placeholder: '@username или t.me/...' },
        { type: 'whatsapp', label: 'WhatsApp', icon: 'whatsapp', placeholder: '+380...' },
        { type: 'viber', label: 'Viber', icon: 'viber', placeholder: '+380...' },
        { type: 'signal', label: 'Signal', icon: 'signal', placeholder: '+380...' },
        { type: 'facebook', label: 'Facebook', icon: 'facebook', placeholder: 'facebook.com/...' },
        { type: 'instagram', label: 'Instagram', icon: 'instagram', placeholder: '@username' },
        { type: 'twitter', label: 'X (Twitter)', icon: 'twitter', placeholder: '@username' },
        { type: 'linkedin', label: 'LinkedIn', icon: 'linkedin', placeholder: 'linkedin.com/in/...' },
        { type: 'vk', label: 'VKontakte', icon: 'vk', placeholder: 'vk.com/...' },
        { type: 'email', label: 'Email', icon: 'mail', placeholder: 'email@example.com' },
        { type: 'website', label: 'Website', icon: 'globe', placeholder: 'https://...' },
      ];
      const targetId = (inp?.userId as string) || DEMO_USER_ID;
      const isOwn = targetId === DEMO_USER_ID;
      // Demo contacts for demo user
      const demoContacts = [
        { type: 'telegram', value: '@demo_user' },
        { type: 'email', value: 'demo@example.com' },
      ];
      if (isOwn) {
        return contactTypes.map(ct => ({
          ...ct,
          value: demoContacts.find(c => c.type === ct.type)?.value || '',
        }));
      }
      return demoContacts.map(c => {
        const ct = contactTypes.find(t => t.type === c.type);
        return { type: c.type, value: c.value, label: ct?.label, icon: ct?.icon };
      });
    }
    case 'user.updateContacts':
      return { success: true };

    // ---- Connection ----
    case 'connection.list':
      return connections;
    case 'connection.getCount':
      return { count: 12, max: 150 };
    case 'connection.add':
      return { id: `conn-new-${Date.now()}`, userAId: DEMO_USER_ID, userBId: inp?.userId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    case 'connection.graphSlice':
      return graphSlice;
    case 'connection.findPath': {
      const targetId = inp?.targetUserId as string;
      // Build a demo path to the target user
      const targetUser = usersMap.get(targetId);
      if (!targetUser) return { path: [] };
      // Demo path: demo-user -> user-1 -> target (if different)
      const path = [
        { id: DEMO_USER_ID, name: demoUser.name, photoUrl: null },
      ];
      if (targetId !== DEMO_USER_ID) {
        // Check if direct connection
        if (connectionUserIds.includes(targetId)) {
          path.push({ id: targetId, name: targetUser.name, photoUrl: null });
        } else {
          // Add intermediate user
          const intermediateId = connectionUserIds[0]!;
          const intermediate = usersMap.get(intermediateId)!;
          path.push({ id: intermediateId, name: intermediate.name, photoUrl: null });
          path.push({ id: targetId, name: targetUser.name, photoUrl: null });
        }
      }
      return { path };
    }
    case 'connection.getNickname': {
      const targetId = inp?.targetUserId as string;
      const conn = connections.find((c) => c.userId === targetId);
      if (!conn) return { nickname: null, isConnected: false };
      return { nickname: conn.nickname, isConnected: true };
    }
    case 'connection.setNickname': {
      const targetId = inp?.targetUserId as string;
      const nickname = (inp?.nickname as string)?.trim() || null;
      const conn = connections.find((c) => c.userId === targetId);
      if (conn) {
        (conn as any).nickname = nickname;
        (conn as any).displayName = nickname || conn.name;
      }
      return { success: true, nickname };
    }
    case 'connection.getNetworkStats': {
      // Generate users by depth for expandable lists
      const usersByDepth: Record<number, Array<{ id: string; name: string; photoUrl: string | null; connectionCount: number; remainingBudget: number | null }>> = {
        1: connections.map((c) => ({ id: c.userId, name: c.name, photoUrl: c.photoUrl, connectionCount: c.connectionCount, remainingBudget: c.remainingBudget })),
        2: Array.from({ length: 48 }, (_, i) => {
          const u = usersMap.get(`user-${13 + i}`)!;
          return { id: u.id, name: u.name, photoUrl: null, connectionCount: 5 + Math.floor(Math.random() * 15), remainingBudget: Math.random() > 0.4 ? Math.floor(30 + Math.random() * 150) : null };
        }),
        3: Array.from({ length: 72 }, (_, i) => {
          const u = usersMap.get(`user-${61 + i}`) || users[(61 + i) % users.length]!;
          return { id: u.id, name: u.name, photoUrl: null, connectionCount: 3 + Math.floor(Math.random() * 10), remainingBudget: Math.random() > 0.5 ? Math.floor(20 + Math.random() * 100) : null };
        }),
        4: Array.from({ length: 24 }, (_, i) => {
          const u = usersMap.get(`user-${133 + i}`) || users[(133 + i) % users.length]!;
          return { id: u.id, name: u.name, photoUrl: null, connectionCount: 2 + Math.floor(Math.random() * 8), remainingBudget: Math.random() > 0.6 ? Math.floor(10 + Math.random() * 80) : null };
        }),
      };
      return {
        totalReachable: 156,
        byDepth: { 1: 12, 2: 48, 3: 72, 4: 24 },
        usersByDepth,
        growth: { day: 3, week: 18, month: 47, year: 156 },
      };
    }
    case 'stats.help':
      return {
        given: { count: 7, totalAmount: 425 },
        received: { count: 2, totalAmount: 580 },
        activeIntentions: 3,
        completedCollections: 1,
        networkReach: 156,
      };

    case 'stats.helpGivenByPeriod':
      return {
        allTime: { count: 47, amount: 2850 },
        year: { count: 35, amount: 2100 },
        month: { count: 8, amount: 520 },
        week: { count: 3, amount: 175 },
        day: { count: 1, amount: 50 },
      };

    case 'stats.networkCapabilities':
      return {
        total: 12500,
        contributors: 87,
      };

    case 'stats.platformGrowth': {
      const days = 30;
      const result: Array<{ date: string; count: number }> = [];
      let cumulative = 0;
      for (let i = 0; i <= days; i++) {
        const d = new Date(Date.now() - (days - i) * 86_400_000);
        cumulative += i === 0 ? 5 : Math.floor(Math.random() * 8) + 1;
        result.push({ date: d.toISOString().slice(0, 10), count: cumulative });
      }
      return result;
    }

    case 'chat.send': {
      const { message, language } = input as { message: string; language: string };
      // Demo mode: return a helpful response based on keywords
      const q = message.toLowerCase();
      const isRu = language.startsWith('ru');

      let response: string;
      if (q.includes('рукопожатие') || q.includes('handshake') || q.includes('связь') || q.includes('connection')) {
        response = isRu
          ? 'Рукопожатие — это взаимное подтверждение связи между двумя людьми. Оба должны подтвердить. Лимит: 150 (число Данбара).'
          : 'A handshake is a mutual confirmation of connection between two people. Both must confirm. Limit: 150 (Dunbar\'s number).';
      } else if (q.includes('намерение') || q.includes('intention') || q.includes('помощь') || q.includes('help')) {
        response = isRu
          ? 'Намерение — ваше добровольное решение помочь кому-то. Это не обязательство! Записывается и видно всей сети.'
          : 'An intention is your voluntary decision to help someone. It\'s not an obligation! Recorded and visible to the network.';
      } else if (q.includes('возможности') || q.includes('capabilities') || q.includes('бюджет') || q.includes('budget')) {
        response = isRu
          ? 'Текущие возможности — сумма месячных бюджетов всех участников вашей сети. Показывает готовность помогать.'
          : 'Current Capabilities is the sum of monthly budgets across your network. Shows collective willingness to help.';
      } else if (q.includes('начать') || q.includes('start') || q.includes('как') || q.includes('how')) {
        response = isRu
          ? 'Начните с добавления рукопожатий с людьми, которых знаете лично. Затем установите месячный бюджет (необязательно). Когда кому-то нужна помощь — получите уведомление!'
          : 'Start by adding handshakes with people you know personally. Then set your monthly budget (optional). When someone needs help — you\'ll get a notification!';
      } else {
        response = isRu
          ? 'Я могу объяснить как работает приложение. Спросите о рукопожатиях, намерениях, текущих возможностях сети или как начать пользоваться.'
          : 'I can explain how the app works. Ask about handshakes, intentions, current capabilities, or how to get started.';
      }
      return { response };
    }
    case 'chat.speak':
      // Demo mode: return empty base64 (no real audio in demo)
      return { audio: '' };

    // ---- Currency ----
    case 'currency.list':
      return [
        { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
        { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
        { code: 'GBP', name: 'British Pound', symbol: '£', decimals: 2 },
        { code: 'UAH', name: 'Ukrainian Hryvnia', symbol: '₴', decimals: 2 },
        { code: 'RUB', name: 'Russian Ruble', symbol: '₽', decimals: 2 },
        { code: 'PLN', name: 'Polish Zloty', symbol: 'zł', decimals: 2 },
        { code: 'ILS', name: 'Israeli Shekel', symbol: '₪', decimals: 2 },
        { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimals: 0 },
        { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', decimals: 2 },
        { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimals: 2 },
        { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', decimals: 2 },
        { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', decimals: 2 },
        { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimals: 2 },
        { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', decimals: 2 },
        { code: 'KRW', name: 'South Korean Won', symbol: '₩', decimals: 0 },
        { code: 'MXN', name: 'Mexican Peso', symbol: '$', decimals: 2 },
        { code: 'TRY', name: 'Turkish Lira', symbol: '₺', decimals: 2 },
        { code: 'ZAR', name: 'South African Rand', symbol: 'R', decimals: 2 },
        { code: 'SEK', name: 'Swedish Krona', symbol: 'kr', decimals: 2 },
        { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr', decimals: 2 },
      ];
    case 'currency.detectCurrency':
      return { currency: 'UAH', country: 'UA' };
    case 'currency.rates':
      return { USD: 1, EUR: 0.92, GBP: 0.79, UAH: 41.5, RUB: 92, PLN: 4.0, ILS: 3.7, JPY: 149, CNY: 7.2, INR: 83 };
    case 'currency.convert': {
      const rates: Record<string, number> = { USD: 1, EUR: 0.92, GBP: 0.79, UAH: 41.5, RUB: 92, PLN: 4.0, ILS: 3.7, JPY: 149, CNY: 7.2, INR: 83 };
      const from = inp?.from as string || 'USD';
      const to = inp?.to as string || 'USD';
      const amount = inp?.amount as number || 0;
      const fromRate = rates[from] || 1;
      const toRate = rates[to] || 1;
      const result = Math.round(amount / fromRate * toRate);
      return { result, rate: toRate / fromRate };
    }
    case 'currency.toUSD': {
      const rates: Record<string, number> = { USD: 1, EUR: 0.92, GBP: 0.79, UAH: 41.5, RUB: 92, PLN: 4.0, ILS: 3.7, JPY: 149, CNY: 7.2, INR: 83 };
      const from = inp?.from as string || 'USD';
      const amount = inp?.amount as number || 0;
      const rate = rates[from] || 1;
      return { result: Math.round(amount / rate) };
    }

    // ---- Collection ----
    case 'collection.myActive':
      return collections;
    case 'collection.myParticipating':
      return myObligations;
    case 'collection.getById': {
      const id = inp?.id as string;
      const coll = collections.find((c) => c.id === id);
      if (coll) {
        const obls = collectionObligations(id);
        return {
          ...coll,
          obligations: obls.map(o => ({ ...o, user: { ...o.user, connectionCount: Math.floor(Math.random() * 15) + 1 } })),
          creator: { ...coll.creator, connectionCount: 12 },
        };
      }
      // NEW collection where demo user has NOT participated yet (to show intention form)
      if (id === 'ext-coll-new') {
        return {
          id: 'ext-coll-new',
          creatorId: 'user-3',
          type: 'EMERGENCY',
          amount: 300,
          currency: 'USD',
          chatLink: 'https://t.me/help_needed_chat',
          status: 'ACTIVE',
          currentCycleStart: null,
          createdAt: '2025-11-22T08:00:00Z',
          updatedAt: '2025-11-22T08:00:00Z',
          closedAt: null,
          blockedAt: null,
          currentAmount: 150,
          obligations: [
            { id: `obl-new-1`, collectionId: id, userId: 'user-1', amount: 50, isSubscription: false, unsubscribedAt: null, createdAt: '2025-11-22T09:00:00Z', updatedAt: '2025-11-22T09:00:00Z', user: { id: 'user-1', name: usersMap.get('user-1')!.name, photoUrl: null, connectionCount: 8 } },
            { id: `obl-new-2`, collectionId: id, userId: 'user-4', amount: 60, isSubscription: false, unsubscribedAt: null, createdAt: '2025-11-22T10:00:00Z', updatedAt: '2025-11-22T10:00:00Z', user: { id: 'user-4', name: usersMap.get('user-4')!.name, photoUrl: null, connectionCount: 5 } },
            { id: `obl-new-3`, collectionId: id, userId: 'user-6', amount: 40, isSubscription: false, unsubscribedAt: null, createdAt: '2025-11-22T11:00:00Z', updatedAt: '2025-11-22T11:00:00Z', user: { id: 'user-6', name: usersMap.get('user-6')!.name, photoUrl: null, connectionCount: 3 } },
          ],
          _count: { obligations: 3 },
          creator: { id: 'user-3', name: usersMap.get('user-3')!.name, photoUrl: null, connectionCount: 7 },
        };
      }
      // External collection where demo user already participated
      const extObl = myObligations.find((o) => o.collectionId === id);
      if (extObl) {
        return {
          ...extObl.collection,
          currentAmount: extObl.amount * 3,
          obligations: [
            { id: `obl-ext-0`, collectionId: id, userId: DEMO_USER_ID, amount: extObl.amount, isSubscription: false, unsubscribedAt: null, createdAt: extObl.createdAt, updatedAt: extObl.updatedAt, user: { id: DEMO_USER_ID, name: demoUser.name, photoUrl: null, connectionCount: 12 } },
            { id: `obl-ext-1`, collectionId: id, userId: 'user-1', amount: extObl.amount + 20, isSubscription: false, unsubscribedAt: null, createdAt: extObl.createdAt, updatedAt: extObl.updatedAt, user: { id: 'user-1', name: usersMap.get('user-1')!.name, photoUrl: null, connectionCount: 8 } },
            { id: `obl-ext-2`, collectionId: id, userId: 'user-2', amount: extObl.amount + 10, isSubscription: false, unsubscribedAt: null, createdAt: extObl.createdAt, updatedAt: extObl.updatedAt, user: { id: 'user-2', name: usersMap.get('user-2')!.name, photoUrl: null, connectionCount: 6 } },
          ],
          _count: { obligations: 3 },
          creator: { ...extObl.collection.creator, connectionCount: Math.floor(Math.random() * 10) + 3 },
        };
      }
      return null;
    }
    case 'collection.create': {
      // Convert to USD if needed (demo rates)
      const rates: Record<string, number> = { USD: 1, EUR: 0.92, GBP: 0.79, UAH: 41.5, RUB: 92, PLN: 4.0, ILS: 3.7, JPY: 149 };
      const inputCurrency = (inp?.inputCurrency as string) ?? 'USD';
      const originalAmount = inp?.amount as number ?? null;
      const rate = rates[inputCurrency] || 1;
      const amountUSD = originalAmount != null ? Math.round(originalAmount / rate) : null;
      return {
        id: `coll-new-${Date.now()}`,
        creatorId: DEMO_USER_ID,
        type: inp?.type ?? 'EMERGENCY',
        amount: amountUSD,
        currency: 'USD',
        originalAmount,
        originalCurrency: inputCurrency,
        chatLink: inp?.chatLink ?? '',
        status: 'ACTIVE',
        currentCycleStart: inp?.type === 'REGULAR' ? new Date().toISOString() : null,
        cycleNumber: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        closedAt: null,
        blockedAt: null,
      };
    }
    case 'collection.close': {
      const c = collections.find((x) => x.id === (inp?.id as string));
      return { ...(c ?? collections[0]), status: 'CLOSED', closedAt: new Date().toISOString() };
    }
    case 'collection.cancel': {
      const c = collections.find((x) => x.id === (inp?.id as string));
      return { ...(c ?? collections[0]), status: 'CANCELLED' };
    }

    // ---- Obligation ----
    case 'obligation.myList':
      return myObligations;
    case 'obligation.create': {
      // Convert to USD if needed (demo rates)
      const rates: Record<string, number> = { USD: 1, EUR: 0.92, GBP: 0.79, UAH: 41.5, RUB: 92, PLN: 4.0, ILS: 3.7, JPY: 149 };
      const inputCurrency = (inp?.inputCurrency as string) ?? 'USD';
      const originalAmount = inp?.amount as number ?? 50;
      const rate = rates[inputCurrency] || 1;
      const amountUSD = Math.round(originalAmount / rate);
      return {
        id: `obl-new-${Date.now()}`,
        collectionId: inp?.collectionId,
        userId: DEMO_USER_ID,
        amount: amountUSD,
        originalAmount,
        originalCurrency: inputCurrency,
        isSubscription: inp?.isSubscription ?? false,
        unsubscribedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    case 'obligation.unsubscribe':
      return {
        id: inp?.obligationId,
        collectionId: 'ext-coll-2',
        userId: DEMO_USER_ID,
        amount: 100,
        isSubscription: true,
        unsubscribedAt: new Date().toISOString(),
        createdAt: '2025-10-20T11:00:00Z',
        updatedAt: new Date().toISOString(),
      };

    // ---- Notification ----
    case 'notification.list':
      return { items: notifications, nextCursor: undefined };
    case 'notification.unreadCount':
      return { count: 4 };
    case 'notification.markRead': {
      const n = notifications.find((x) => x.id === (inp?.id as string));
      return n ? { ...n, status: 'READ' } : { id: inp?.id, status: 'READ' };
    }
    case 'notification.dismiss': {
      const n = notifications.find((x) => x.id === (inp?.id as string));
      return n ? { ...n, status: 'DISMISSED' } : { id: inp?.id, status: 'DISMISSED' };
    }

    // ---- Settings ----
    case 'settings.get':
      return { ...settingsState };
    case 'settings.updateLanguage':
      settingsState = { ...settingsState, language: (inp?.language as string) ?? settingsState.language };
      return { ...demoUser, ...settingsState };
    case 'settings.updateTheme':
      settingsState = { ...settingsState, theme: (inp?.theme as string) ?? settingsState.theme };
      return { ...demoUser, ...settingsState };
    case 'settings.updateSound':
      settingsState = { ...settingsState, soundEnabled: (inp?.soundEnabled as boolean) ?? settingsState.soundEnabled };
      return { ...demoUser, ...settingsState };
    case 'settings.updateVoiceGender':
      settingsState = { ...settingsState, voiceGender: (inp?.voiceGender as 'FEMALE' | 'MALE') ?? settingsState.voiceGender };
      return { ...demoUser, ...settingsState };
    case 'settings.updateFontScale':
      settingsState = { ...settingsState, fontScale: (inp?.fontScale as number) ?? settingsState.fontScale };
      return { ...demoUser, ...settingsState };
    case 'settings.ignoreList':
      return [];
    case 'settings.addIgnore':
      return { id: `ign-${Date.now()}`, fromUserId: DEMO_USER_ID, toUserId: inp?.userId, createdAt: new Date().toISOString() };
    case 'settings.removeIgnore':
      return { id: `ign-${Date.now()}`, fromUserId: DEMO_USER_ID, toUserId: inp?.userId, createdAt: new Date().toISOString() };

    // ---- Stats ----
    case 'stats.profile':
      return {
        connectionsCount: 12,
        collectionsCreated: 3,
        collectionsActive: 2,
        obligationsGiven: 8,
        totalAmountPledged: 450,
        amountByCurrency: { USD: 200, EUR: 250 },
      };

    // ---- Invite ----
    case 'invite.generate':
      demoInviteGeneratedAt = Date.now();
      return { token: 'demo-invite-' + Date.now().toString(16), id: `inv-${Date.now()}` };
    case 'invite.accept':
      return { success: true, connectedWith: 'user-1' };
    case 'invite.getByToken': {
      // Simulate acceptance after 5 seconds
      const elapsed = demoInviteGeneratedAt ? Date.now() - demoInviteGeneratedAt : 0;
      const accepted = elapsed > 5000;
      return {
        id: 'inv-demo',
        inviterId: DEMO_USER_ID,
        token: inp?.token ?? 'demo-token',
        usedById: accepted ? 'user-1' : null,
        usedAt: accepted ? new Date().toISOString() : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        inviter: { id: DEMO_USER_ID, name: demoUser.name, photoUrl: null },
      };
    }

    default:
      console.warn(`[Demo] Unhandled procedure: ${path}`);
      return null;
  }
}
