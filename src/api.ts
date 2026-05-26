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
  roomRole?: 'guest' | 'driver' | 'tour_leader';
  isSaturday?: boolean;
  vegetarianCount?: number;
  notes?: string;
  activities: {
    chineseBreakfast: ActivityCounts;
    chineseLunch: ActivityCounts;
    chineseLunchSecondDay: ActivityCounts;
    chineseDinner: ActivityCounts;
    westernLunch: ActivityCounts;
    westernLunchSecondDay?: ActivityCounts;
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
  westernLunchSecondDay: '第二天西式午餐(WL2)',
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

// Default rooms for local mock scenario
const defaultRooms: RoomRecord[] = [
  {
    id: "1",
    roomNumber: "A101",
    guestName: "王大明",
    groupType: "none",
    checkInDate: "2026-05-25",
    activities: {
      chineseBreakfast: { total: 2, consumed: 0 },
      chineseLunch: { total: 2, consumed: 0 },
      chineseLunchSecondDay: { total: 0, consumed: 0 },
      chineseDinner: { total: 0, consumed: 0 },
      westernLunch: { total: 0, consumed: 0 },
      westernDinner: { total: 2, consumed: 0 },
      seasonalActivity: { total: 2, consumed: 0 },
      jamDiy: { total: 1, consumed: 0 },
      vinegarDiy: { total: 0, consumed: 0 },
      afternoonTea: { total: 2, consumed: 0 },
    },
    consumptions: []
  },
  {
    id: "2",
    roomNumber: "B205",
    guestName: "陳小華",
    groupType: "none",
    checkInDate: "2026-05-25",
    activities: {
      chineseBreakfast: { total: 4, consumed: 0 },
      chineseLunch: { total: 0, consumed: 0 },
      chineseLunchSecondDay: { total: 0, consumed: 0 },
      chineseDinner: { total: 0, consumed: 0 },
      westernLunch: { total: 4, consumed: 2 },
      westernDinner: { total: 4, consumed: 0 },
      seasonalActivity: { total: 4, consumed: 1 },
      jamDiy: { total: 0, consumed: 0 },
      vinegarDiy: { total: 2, consumed: 0 },
      afternoonTea: { total: 4, consumed: 4 },
    },
    consumptions: []
  }
];

// Offline state controller
const isVercel = typeof window !== 'undefined' && (
  window.location.hostname.includes('vercel.app') || 
  window.location.hostname.includes('github.io') ||
  window.location.hostname.includes('netlify.app')
);

let isOfflineMode = isVercel;

export const getOfflineModeStatus = (): boolean => isOfflineMode;

const getLocalRooms = (): RoomRecord[] => {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem('hotel_quotas_local_rooms');
  if (!data) {
    localStorage.setItem('hotel_quotas_local_rooms', JSON.stringify(defaultRooms));
    return defaultRooms;
  }
  return JSON.parse(data);
};

const saveLocalRooms = (rooms: RoomRecord[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('hotel_quotas_local_rooms', JSON.stringify(rooms));
};

export const loginLocal = (password: string): { token: string; user: User } => {
  let role: Role | "" = "";
  let name = "";

  switch (password) {
    case "1111":
      role = "frontdesk";
      name = "櫃檯";
      break;
    case "2222":
      role = "chinese";
      name = "中式餐廳";
      break;
    case "3333":
      role = "western";
      name = "西式餐廳";
      break;
    case "4444":
      role = "activity";
      name = "活動組";
      break;
    case "5555":
      role = "cafe";
      name = "咖啡廳";
      break;
    case "6666":
      role = "manager";
      name = "主管核查看板";
      break;
    default:
      throw new Error("密碼錯誤");
  }
  return { token: role, user: { role, name } };
};

export const login = async (password: string): Promise<{ token: string; user: User } | null> => {
  if (isOfflineMode) {
    return loginLocal(password);
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    
    if (res.status === 404 || res.status === 405) {
      console.warn("API doesn't exist. Switching to LocalStorage mode.");
      isOfflineMode = true;
      return loginLocal(password);
    }
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || '密碼錯誤');
    }
    return res.json();
  } catch (err: any) {
    if (isOfflineMode || err.message?.includes('Fetch') || err.name === 'TypeError') {
      console.warn("Using LocalStorage fallback on connection error.");
      isOfflineMode = true;
      return loginLocal(password);
    }
    throw err;
  }
};

export const fetchRooms = async (): Promise<RoomRecord[]> => {
  if (isOfflineMode) {
    return getLocalRooms();
  }
  
  try {
    const res = await fetch('/api/rooms');
    if (res.status === 404) {
      isOfflineMode = true;
      return getLocalRooms();
    }
    if (!res.ok) throw new Error('無法取得資料');
    return res.json();
  } catch (error) {
    isOfflineMode = true;
    return getLocalRooms();
  }
};

export const consumeActivity = async (id: string, activityKey: string, amount: number = 1, date?: string): Promise<RoomRecord> => {
  if (isOfflineMode) {
    const rooms = getLocalRooms();
    const idx = rooms.findIndex(r => r.id === id);
    if (idx === -1) throw new Error("找不到該房間紀錄");
    const room = rooms[idx];
    if (!room.consumptions) room.consumptions = [];
    
    const act = room.activities[activityKey as keyof typeof room.activities];
    if (!act) throw new Error("無效的核銷項目");
    
    const targetDate = date || new Date().toISOString().slice(0, 10);
    
    if (amount > 0) {
      if (act.consumed + amount <= act.total) {
        act.consumed += amount;
        room.consumptions.push({
          id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
          activityKey,
          date: targetDate,
          count: amount,
          consumedAt: new Date().toISOString()
        });
      } else {
        throw new Error("超過可核銷總額數量");
      }
    } else if (amount < 0) {
      if (act.consumed > 0) {
        act.consumed = Math.max(0, act.consumed + amount);
        const logIndex = room.consumptions.reduce((lastIdx, c, innerIdx) => {
          return (c.activityKey === activityKey && c.date === targetDate) ? innerIdx : lastIdx;
        }, -1);
        if (logIndex !== -1) {
          room.consumptions.splice(logIndex, 1);
        }
      } else {
        throw new Error("無已核銷項目可取消");
      }
    }
    
    rooms[idx] = room;
    saveLocalRooms(rooms);
    return room;
  }

  const res = await fetch(`/api/rooms/${id}/consume`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activityKey, amount, date }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || '核銷失敗');
  }
  return res.json();
};

export const addRoom = async (roomData: Partial<RoomRecord>): Promise<RoomRecord> => {
  if (isOfflineMode) {
    const rooms = getLocalRooms();
    const newRoom: RoomRecord = {
      id: Date.now().toString(),
      roomNumber: roomData.roomNumber || '',
      guestName: roomData.guestName || "無名氏",
      checkInDate: roomData.checkInDate || new Date().toISOString().slice(0, 10),
      groupType: roomData.groupType || "none",
      tourLeaderName: roomData.tourLeaderName,
      tourLeaderPhone: roomData.tourLeaderPhone,
      isSaturday: roomData.isSaturday,
      vegetarianCount: typeof roomData.vegetarianCount === 'number' ? roomData.vegetarianCount : 0,
      notes: roomData.notes || "",
      activities: roomData.activities || {
        chineseBreakfast: { total: 0, consumed: 0 },
        chineseLunch: { total: 0, consumed: 0 },
        chineseLunchSecondDay: { total: 0, consumed: 0 },
        chineseDinner: { total: 0, consumed: 0 },
        westernLunch: { total: 0, consumed: 0 },
        westernDinner: { total: 0, consumed: 0 },
        seasonalActivity: { total: 0, consumed: 0 },
        jamDiy: { total: 0, consumed: 0 },
        vinegarDiy: { total: 0, consumed: 0 },
        afternoonTea: { total: 0, consumed: 0 },
      },
      consumptions: []
    };
    rooms.push(newRoom);
    saveLocalRooms(rooms);
    return newRoom;
  }

  const res = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(roomData),
  });
  if (!res.ok) throw new Error('新增失敗');
  return res.json();
};

export const deleteRoom = async (id: string): Promise<void> => {
  if (isOfflineMode) {
    const rooms = getLocalRooms();
    const updated = rooms.filter(r => r.id !== id);
    saveLocalRooms(updated);
    return;
  }

  const res = await fetch(`/api/rooms/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('刪除失敗');
};

export const updateRoom = async (id: string, updateData: Partial<RoomRecord>): Promise<RoomRecord> => {
  if (isOfflineMode) {
    const rooms = getLocalRooms();
    const idx = rooms.findIndex(r => r.id === id);
    if (idx === -1) throw new Error("找不到該房間紀錄");
    
    rooms[idx] = { ...rooms[idx], ...updateData };
    saveLocalRooms(rooms);
    return rooms[idx];
  }

  const res = await fetch(`/api/rooms/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updateData),
  });
  if (!res.ok) throw new Error('更新失敗');
  return res.json();
};
