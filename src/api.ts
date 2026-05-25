export interface ActivityCounts {
  total: number;
  consumed: number;
}

export interface ConsumptionLog {
  id: string;
  activityKey: string;
  date: string;
  count: number;
  consumedAt: string;
}

export interface RoomRecord {
  id: string;
  roomNumber: string;
  guestName: string;
  checkInDate?: string;
  groupType?: 'none' | 'lion' | 'yirong' | 'general_group';
  tourLeaderName?: string;
  tourLeaderPhone?: string;
  isSaturday?: boolean;
  vegetarianCount?: number;
  notes?: string;
  activities: {
    chineseBreakfast: ActivityCounts;
    chineseLunch: ActivityCounts;
    chineseLunchSecondDay: ActivityCounts;
    chineseDinner: ActivityCounts;
    westernLunch: ActivityCounts;
    westernDinner: ActivityCounts;
    seasonalActivity: ActivityCounts;
    jamDiy: ActivityCounts;
    vinegarDiy: ActivityCounts;
    afternoonTea: ActivityCounts;
  };
  consumptions?: ConsumptionLog[];
}

export type Role = 'frontdesk' | 'chinese' | 'western' | 'activity' | 'cafe' | 'manager';

export interface User {
  role: Role;
  name: string;
}

export const ACTIVITY_DICT: Record<string, string> = {
  chineseBreakfast: '中式早餐(B)',
  chineseLunch: '中式午餐(CL)',
  chineseLunchSecondDay: '第二天中式午餐(CL2)',
  chineseDinner: '中式晚餐(CD)',
  westernLunch: '西式午餐(WL)',
  westernDinner: '西式晚餐(WD)',
  seasonalActivity: '當季活動卷(D)',
  jamDiy: '果醬DIY(J)',
  vinegarDiy: '果醋DIY(W)',
  afternoonTea: '下午茶(T)',
};

export const ROLE_ACTIVITIES: Record<Role, string[]> = {
  frontdesk: Object.keys(ACTIVITY_DICT),
  chinese: ['chineseBreakfast', 'chineseLunch', 'chineseLunchSecondDay', 'chineseDinner'],
  western: ['westernLunch', 'westernDinner'],
  activity: ['seasonalActivity', 'jamDiy', 'vinegarDiy'],
  cafe: ['afternoonTea'],
  manager: Object.keys(ACTIVITY_DICT),
};

export const login = async (password: string): Promise<{ token: string; user: User } | null> => {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error('密碼錯誤');
  return res.json();
};

export const fetchRooms = async (): Promise<RoomRecord[]> => {
  const res = await fetch('/api/rooms');
  if (!res.ok) throw new Error('無法取得資料');
  return res.json();
};

export const consumeActivity = async (id: string, activityKey: string, amount: number = 1, date?: string): Promise<RoomRecord> => {
  const res = await fetch(`/api/rooms/${id}/consume`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activityKey, amount, date }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || '核銷失敗');
  }
  return res.json();
};

export const addRoom = async (roomData: Partial<RoomRecord>): Promise<RoomRecord> => {
  const res = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(roomData),
  });
  if (!res.ok) throw new Error('新增失敗');
  return res.json();
};

export const deleteRoom = async (id: string): Promise<void> => {
  const res = await fetch(`/api/rooms/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('刪除失敗');
};
