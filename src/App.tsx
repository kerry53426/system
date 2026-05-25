import React, { useState, useEffect } from 'react';
import { 
  login as apiLogin, 
  fetchRooms, 
  consumeActivity, 
  addRoom, 
  deleteRoom,
  updateRoom,
  getOfflineModeStatus,
  User, 
  RoomRecord, 
  ACTIVITY_DICT, 
  ROLE_ACTIVITIES,
  ActivityCounts
} from './api';
import { 
  MountainSnow, 
  LogOut, 
  CheckCircle2, 
  PlusCircle, 
  Trash2,
  Coffee,
  Utensils,
  Sun,
  ChevronDown,
  ChevronUp,
  Search,
  Users,
  Undo2,
  AlertTriangle,
  Calendar
} from 'lucide-react';

const getDurationSuffix = (nights: number): string => {
  const map: Record<number, string> = {
    1: ' (2天1夜)',
    2: ' (3天2夜)',
    3: ' (4天3夜)',
    4: ' (5天4夜)',
    5: ' (6天5夜)',
    6: ' (7天6夜)',
    7: ' (8天7夜)'
  };
  return map[nights] || ` (${nights + 1}天${nights}夜)`;
};

const getNightsFromGuestName = (guestName: string): number => {
  if (guestName.includes('2天1夜')) return 1;
  if (guestName.includes('3天2夜')) return 2;
  if (guestName.includes('4天3夜')) return 3;
  if (guestName.includes('5天4夜')) return 4;
  if (guestName.includes('6天5夜')) return 5;
  if (guestName.includes('7天6夜')) return 6;
  if (guestName.includes('8天7夜')) return 7;
  return 1;
};

const getNightsAndPeople = (room: RoomRecord) => {
  const nights = getNightsFromGuestName(room.guestName);
  const breakfastTotal = room.activities.chineseBreakfast?.total || 0;
  const people = nights > 0 ? Math.round(breakfastTotal / nights) : breakfastTotal;
  return { nights, people };
};

const getStayDaysList = (checkInDateStr: string | undefined, nights: number): string[] => {
  if (!checkInDateStr) return [];
  const parts = checkInDateStr.split('-');
  if (parts.length !== 3) return [];
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  
  const dates: string[] = [];
  for (let i = 0; i <= nights; i++) {
    const d = new Date(year, month, day + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    dates.push(`${yyyy}-${mm}-${dd}`);
  }
  return dates;
};

const formatDateWithDayOfWeek = (dateStr: string): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  if (isNaN(d.getTime())) return dateStr;
  const m = d.getMonth() + 1;
  const dateNum = d.getDate();
  const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
  return `${m}/${dateNum} (週${dayNames[d.getDay()]})`;
};

const distribute = (total: number, n: number): number[] => {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const remainder = total % n;
  const result = Array(n).fill(base);
  for (let i = 0; i < remainder; i++) {
    result[i] += 1;
  }
  return result;
};

const getRoomDailyDistribution = (room: RoomRecord): Record<string, Record<string, number>> => {
  const nights = getNightsFromGuestName(room.guestName);
  const checkIn = room.checkInDate || new Date().toISOString().slice(0, 10);
  const days = getStayDaysList(checkIn, nights);
  
  const distribution: Record<string, Record<string, number>> = {};
  days.forEach(d => {
    distribution[d] = {};
  });

  const allKeys = Object.keys(room.activities);

  allKeys.forEach(key => {
    const total = room.activities[key as keyof typeof room.activities]?.total || 0;
    if (total <= 0) return;

    if (room.groupType === 'general_group') {
      if (key === 'chineseDinner' || key === 'afternoonTea') {
        const d = days[0];
        distribution[d][key] = (distribution[d][key] || 0) + total;
        return;
      }
      if (key === 'chineseBreakfast' || key === 'chineseLunchSecondDay') {
        const d = days.length > 1 ? days[1] : days[0];
        distribution[d][key] = (distribution[d][key] || 0) + total;
        return;
      }
    }

    if (key === 'chineseBreakfast') {
      const breakfastDays = days.slice(1);
      const n = breakfastDays.length;
      if (n > 0) {
        const dist = distribute(total, n);
        breakfastDays.forEach((d, idx) => {
          distribution[d][key] = (distribution[d][key] || 0) + dist[idx];
        });
      } else {
        distribution[days[0]][key] = total;
      }
    } else if (key === 'chineseLunchSecondDay') {
      if (days.length > 1) {
        distribution[days[1]][key] = total;
      } else {
        distribution[days[0]][key] = total;
      }
    } else {
      const stayDays = days.slice(0, nights);
      const n = stayDays.length;
      if (n > 0) {
        const dist = distribute(total, n);
        stayDays.forEach((d, idx) => {
          distribution[d][key] = (distribution[d][key] || 0) + dist[idx];
        });
      } else {
        distribution[days[0]][key] = total;
      }
    }
  });

  return distribution;
};

const getRoomDailyConsumed = (room: RoomRecord): Record<string, Record<string, number>> => {
  const consumedMap: Record<string, Record<string, number>> = {};
  
  if (room.consumptions) {
    room.consumptions.forEach(c => {
      if (!consumedMap[c.date]) {
        consumedMap[c.date] = {};
      }
      consumedMap[c.date][c.activityKey] = (consumedMap[c.date][c.activityKey] || 0) + c.count;
    });
  }
  
  return consumedMap;
};

interface DailyActivityState {
  date: string;
  activityKey: string;
  total: number;
  consumed: number;
}

const getRoomDailyActivitiesList = (room: RoomRecord): DailyActivityState[] => {
  const nights = getNightsFromGuestName(room.guestName);
  const checkIn = room.checkInDate || new Date().toISOString().slice(0, 10);
  const days = getStayDaysList(checkIn, nights);
  
  const totalMap = getRoomDailyDistribution(room);
  const consumedMap = getRoomDailyConsumed(room);
  
  const result: DailyActivityState[] = [];
  const allKeys = Object.keys(room.activities);
  
  allKeys.forEach(key => {
    const actTotal = room.activities[key as keyof typeof room.activities]?.total || 0;
    const actConsumed = room.activities[key as keyof typeof room.activities]?.consumed || 0;
    
    const logsSum = room.consumptions 
      ? room.consumptions.filter(c => c.activityKey === key).reduce((sum, c) => sum + c.count, 0)
      : 0;
      
    let unloggedConsumed = Math.max(0, actConsumed - logsSum);
    
    // Build dailyslots
    const dailySlots: { date: string, total: number, loggedConsumed: number }[] = [];
    days.forEach(d => {
      const tot = totalMap[d]?.[key] || 0;
      const con = consumedMap[d]?.[key] || 0;
      dailySlots.push({ date: d, total: tot, loggedConsumed: con });
    });
    
    if (unloggedConsumed > 0) {
      for (const slot of dailySlots) {
        if (slot.total > slot.loggedConsumed) {
          const avail = slot.total - slot.loggedConsumed;
          const fill = Math.min(avail, unloggedConsumed);
          slot.loggedConsumed += fill;
          unloggedConsumed -= fill;
          if (unloggedConsumed <= 0) break;
        }
      }
      if (unloggedConsumed > 0) {
        for (const slot of dailySlots) {
          slot.loggedConsumed += unloggedConsumed;
          break;
        }
      }
    }
    
    dailySlots.forEach(slot => {
      if (slot.total > 0 || slot.loggedConsumed > 0) {
        result.push({
          date: slot.date,
          activityKey: key,
          total: slot.total,
          consumed: slot.loggedConsumed
        });
      }
    });
  });
  
  return result;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Custom modal states to bypass standard browser alert/confirm iframe blockage
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel?: () => void;
  } | null>(null);

  const [alertModal, setAlertModal] = useState<{
    title: string;
    message: string;
  } | null>(null);

  const triggerConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({ title, message, onConfirm });
  };

  const triggerAlert = (title: string, message: string) => {
    setAlertModal({ title, message });
  };

  // Filter & tab states
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'individual' | 'group'>('individual');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [collapsedRooms, setCollapsedRooms] = useState<Record<string, boolean>>({});
  const [editingQuotaRooms, setEditingQuotaRooms] = useState<Record<string, boolean>>({});
  const [isBatchProcessing, setIsBatchProcessing] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const tzoffset = (new Date()).getTimezoneOffset() * 60000;
    return (new Date(Date.now() - tzoffset)).toISOString().slice(0, 10);
  });

  const DEPARTMENTS = React.useMemo(() => [
    {
      id: 'chinese',
      name: '中餐部 🧺',
      color: 'bg-emerald-50 text-emerald-800 border-emerald-100',
      progressColor: 'bg-emerald-600',
      keys: ['chineseBreakfast', 'chineseLunch', 'chineseLunchSecondDay', 'chineseDinner'],
    },
    {
      id: 'western',
      name: '西餐部 🍽️',
      color: 'bg-indigo-50 text-indigo-800 border-indigo-100',
      progressColor: 'bg-indigo-600',
      keys: ['westernLunch', 'westernDinner'],
    },
    {
      id: 'activity',
      name: '活動組 🎨',
      color: 'bg-amber-50 text-amber-800 border-amber-100',
      progressColor: 'bg-amber-600',
      keys: ['seasonalActivity', 'jamDiy', 'vinegarDiy'],
    },
    {
      id: 'cafe',
      name: '咖啡廳 ☕',
      color: 'bg-rose-50 text-rose-800 border-rose-100',
      progressColor: 'bg-rose-600',
      keys: ['afternoonTea'],
    },
  ], []);

  const dailySummary = React.useMemo(() => {
    const summary: Record<string, { total: number; consumed: number }> = {};
    
    // Initialize with zeros for all activities
    Object.keys(ACTIVITY_DICT).forEach(key => {
      summary[key] = { total: 0, consumed: 0 };
    });

    rooms.forEach(room => {
      try {
        const dailyStates = getRoomDailyActivitiesList(room);
        dailyStates.forEach(state => {
          if (state.date === selectedDate) {
            if (!summary[state.activityKey]) {
              summary[state.activityKey] = { total: 0, consumed: 0 };
            }
            summary[state.activityKey].total += state.total;
            summary[state.activityKey].consumed += state.consumed;
          }
        });
      } catch (err) {
        console.error("Error building daily states for room:", room.roomNumber, err);
      }
    });

    return summary;
  }, [rooms, selectedDate]);

  const deptSummary = React.useMemo(() => {
    let grandTotal = 0;
    let grandConsumed = 0;

    const list = DEPARTMENTS.map(dept => {
      let deptTotal = 0;
      let deptConsumed = 0;
      const items = dept.keys.map(key => {
        const stats = dailySummary[key] || { total: 0, consumed: 0 };
        deptTotal += stats.total;
        deptConsumed += stats.consumed;
        return {
          key,
          name: ACTIVITY_DICT[key] || key,
          total: stats.total,
          consumed: stats.consumed,
        };
      });

      grandTotal += deptTotal;
      grandConsumed += deptConsumed;

      return {
        ...dept,
        total: deptTotal,
        consumed: deptConsumed,
        items,
      };
    });

    return {
      departments: list,
      grandTotal,
      grandConsumed,
    };
  }, [DEPARTMENTS, dailySummary]);

  // 今日特定日期的成功核銷詳細明細
  const detailedConsumptions = React.useMemo(() => {
    const list: {
      id: string;
      roomId: string;
      roomNumber: string;
      guestName: string;
      activityKey: string;
      activityName: string;
      count: number;
      consumedAt: string;
      timeStr: string;
    }[] = [];

    rooms.forEach(room => {
      if (room.consumptions) {
        room.consumptions.forEach(c => {
          if (c.date === selectedDate) {
            let timeFormatted = "";
            try {
              if (c.consumedAt) {
                const d = new Date(c.consumedAt);
                timeFormatted = d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
              }
            } catch(e) {}

            list.push({
              id: c.id,
              roomId: room.id,
              roomNumber: room.roomNumber,
              guestName: room.guestName,
              activityKey: c.activityKey,
              activityName: ACTIVITY_DICT[c.activityKey] || c.activityKey,
              count: c.count,
              consumedAt: c.consumedAt,
              timeStr: timeFormatted || "核銷紀錄"
            });
          }
        });
      }
    });

    // 依核銷時間倒序排列（最新在最前）
    return list.sort((a, b) => b.consumedAt.localeCompare(a.consumedAt));
  }, [rooms, selectedDate]);

  // 今日素食需求統計
  const vegetarianSummary = React.useMemo(() => {
    let totalVegCount = 0;
    const vegRooms: string[] = [];
    rooms.forEach(room => {
      const nights = getNightsFromGuestName(room.guestName);
      const stayDates = getStayDaysList(room.checkInDate, nights);
      if (stayDates.includes(selectedDate) && (room.vegetarianCount || 0) > 0) {
        totalVegCount += room.vegetarianCount || 0;
        vegRooms.push(room.roomNumber);
      }
    });
    return { totalVegCount, vegRooms };
  }, [rooms, selectedDate]);

  // 今日含有客製特殊客製備註的房號列表
  const roomsWithNotes = React.useMemo(() => {
    return rooms.filter(room => {
      const nights = getNightsFromGuestName(room.guestName);
      const stayDates = getStayDaysList(room.checkInDate, nights);
      return stayDates.includes(selectedDate) && room.notes && room.notes.trim() !== "";
    });
  }, [rooms, selectedDate]);

  // 今日退房但仍有未核銷配額/餘額的警告提醒
  const checkoutWarnings = React.useMemo(() => {
    const warnings: { roomNumber: string; guestName: string; unusedCount: number; items: string[] }[] = [];
    rooms.forEach(room => {
      const nights = getNightsFromGuestName(room.guestName);
      const stayDates = getStayDaysList(room.checkInDate, nights);
      const checkOutDateStr = stayDates[stayDates.length - 1]; // 最後一天即退房日
      if (checkOutDateStr === selectedDate) {
        const unusedItems: string[] = [];
        let unusedCount = 0;
        Object.entries(room.activities).forEach(([key, value]) => {
          const stats = value as ActivityCounts;
          if (stats && stats.total > stats.consumed) {
            unusedCount += (stats.total - stats.consumed);
            unusedItems.push(`${ACTIVITY_DICT[key] || key}: 剩 ${stats.total - stats.consumed} 份`);
          }
        });
        if (unusedCount > 0) {
          warnings.push({
            roomNumber: room.roomNumber,
            guestName: room.guestName,
            unusedCount,
            items: unusedItems
          });
        }
      }
    });
    return warnings;
  }, [rooms, selectedDate]);

  // Front desk new room states
  const [isAdding, setIsAdding] = useState(false);
  const [newRoomNo, setNewRoomNo] = useState('');
  const [newGuestName, setNewGuestName] = useState('');
  const [peopleCount, setPeopleCount] = useState(2);
  const [vegetarianCount, setVegetarianCount] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');
  const [projectType, setProjectType] = useState<'custom' | 'one_night' | 'premium' | 'longstay' | 'lion' | 'yirong' | 'general_group'>('one_night');
  const [stayNights, setStayNights] = useState<number>(1);
  const [isSaturday, setIsSaturday] = useState(false);
  const [tourLeaderName, setTourLeaderName] = useState('');
  const [tourLeaderPhone, setTourLeaderPhone] = useState('');
  const [checkInDate, setCheckInDate] = useState<string>(() => {
    const tzoffset = (new Date()).getTimezoneOffset() * 60000;
    return (new Date(Date.now() - tzoffset)).toISOString().slice(0, 10);
  });
  
  const [groupRooms, setGroupRooms] = useState([{ id: Date.now(), roomNo: '', peopleCount: 2 }]);
  const isGroupMode = ['lion', 'yirong', 'general_group'].includes(projectType);

  const [newActivities, setNewActivities] = useState<Record<string, number>>({
    chineseBreakfast: 2,
    chineseLunch: 0,
    chineseLunchSecondDay: 0,
    chineseDinner: 0,
    westernLunch: 0,
    westernDinner: 0,
    seasonalActivity: 0,
    jamDiy: 0,
    vinegarDiy: 0,
    afternoonTea: 0,
  });

  // Automatically update newActivities when project parameters change
  useEffect(() => {
    if (projectType === 'custom' || ['lion', 'yirong', 'general_group'].includes(projectType)) return;

    const updated = {
      chineseBreakfast: peopleCount * stayNights, // All rooms get Chinese Breakfast!
      chineseLunch: 0,
      chineseLunchSecondDay: 0,
      chineseDinner: 0,
      westernLunch: 0,
      westernDinner: 0,
      seasonalActivity: 0,
      jamDiy: 0,
      vinegarDiy: 0,
      afternoonTea: 0,
    };

    if (projectType === 'one_night') {
      updated.seasonalActivity = peopleCount * stayNights;
      updated.chineseDinner = peopleCount * stayNights;
    } else if (projectType === 'premium') {
      updated.westernLunch = peopleCount * stayNights;
      updated.westernDinner = peopleCount * stayNights;
      updated.afternoonTea = peopleCount * stayNights;
      updated.vinegarDiy = peopleCount * stayNights;
    } else if (projectType === 'longstay') {
      updated.chineseDinner = peopleCount * stayNights;
    }
    setNewActivities(updated);
  }, [projectType, peopleCount, isSaturday, stayNights]);

  const calculateActivitiesForProject = (type: string, count: number, isSat: boolean, nights: number = 1) => {
    const acts = {
      chineseBreakfast: count * nights,
      chineseLunch: 0,
      chineseLunchSecondDay: 0,
      chineseDinner: 0,
      westernLunch: 0,
      westernDinner: 0,
      seasonalActivity: 0,
      jamDiy: 0,
      vinegarDiy: 0,
      afternoonTea: 0,
    };

    if (type === 'one_night') {
      acts.seasonalActivity = count * nights;
      acts.chineseDinner = count * nights;
    } else if (type === 'premium') {
      acts.westernLunch = count * nights;
      acts.westernDinner = count * nights;
      acts.afternoonTea = count * nights;
      acts.vinegarDiy = count * nights;
    } else if (type === 'longstay') {
      acts.chineseDinner = count * nights;
    } else if (type === 'lion') {
      acts.chineseLunch = count * nights;
      acts.westernDinner = count * nights;
      acts.westernLunch = count * nights;
      acts.jamDiy = count * nights;
      if (isSat) {
        acts.afternoonTea = count * nights;
      }
    } else if (type === 'yirong') {
      acts.chineseLunch = count * nights;
      acts.chineseDinner = count * nights;
      acts.chineseLunchSecondDay = count * nights;
      acts.afternoonTea = count * nights;
      acts.vinegarDiy = count * nights;
    } else if (type === 'general_group') {
      acts.chineseDinner = count * nights;
      acts.chineseLunchSecondDay = count * nights;
      acts.afternoonTea = count * nights;
    }

    const formatted: any = {};
    Object.keys(acts).forEach(k => {
      formatted[k] = { total: (acts as Record<string, number>)[k] || 0, consumed: 0 };
    });
    return formatted;
  };

  const loadRooms = async () => {
    try {
      const data = await fetchRooms();
      setRooms(data);
      setError('');
    } catch (err: any) {
      setError(err.message);
      console.error(err);
    }
  };

  useEffect(() => {
    if (user) {
      loadRooms();
      // Poll every 3 seconds to keep departments in sync
      const interval = setInterval(loadRooms, 3000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await apiLogin(password);
      if (res) {
        setUser(res.user);
        setPassword('');
      }
    } catch (err: any) {
      setLoginError(err.message);
    }
  };

  const handleLogout = () => {
    setUser(null);
  };

  const handleTriggerAddRoom = () => {
    const nextIsAdding = !isAdding;
    setIsAdding(nextIsAdding);
    if (nextIsAdding) {
      setProjectType('one_night');
      setStayNights(1);
      setPeopleCount(2);
      setNewRoomNo('');
      setNewGuestName('');
      setVegetarianCount(0);
      setNotes('');
      const tzoffset = (new Date()).getTimezoneOffset() * 60000;
      setCheckInDate((new Date(Date.now() - tzoffset)).toISOString().slice(0, 10));
      setNewActivities({
        chineseBreakfast: 2,
        chineseLunch: 0,
        chineseLunchSecondDay: 0,
        chineseDinner: 2,
        westernLunch: 0,
        westernDinner: 0,
        seasonalActivity: 2,
        jamDiy: 0,
        vinegarDiy: 0,
        afternoonTea: 0,
      });
    }
  };

  const handleConsume = async (roomId: string, activityKey: string, amount: number = 1, date?: string) => {
    try {
      await consumeActivity(roomId, activityKey, amount, date);
      loadRooms();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleBatchConsume = async (pendingRoomsAndAmounts: { roomId: string; amount: number }[], activityKey: string, date: string, actionType: 'consume' | 'reverse') => {
    const key = `${activityKey}-${date}`;
    setIsBatchProcessing(key);
    try {
      // Consume sequentially to be safe and avoid race conditions writing to data.json
      for (const item of pendingRoomsAndAmounts) {
        if (item.amount !== 0) {
          await consumeActivity(item.roomId, activityKey, item.amount, date);
        }
      }
      await loadRooms();
    } catch (err: any) {
      alert(`批次處理${actionType === 'consume' ? '核銷' : '撤銷'}失敗: ` + err.message);
    } finally {
      setIsBatchProcessing(null);
    }
  };

  const handleUpdateTotal = async (roomId: string, currentRoom: RoomRecord, activityKey: string, increment: number) => {
    const act = currentRoom.activities[activityKey as keyof typeof currentRoom.activities];
    const newTotal = Math.max(act.consumed, act.total + increment); // can't go below consumed amount
    
    try {
      await updateRoom(roomId, {
        activities: { 
          ...currentRoom.activities, 
          [activityKey]: { ...act, total: newTotal } 
        } 
      });
      loadRooms();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUpdateRoomMeta = async (roomId: string, fields: Partial<RoomRecord>) => {
    try {
      await updateRoom(roomId, fields);
      loadRooms();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isGroupMode) {
        if (!newGuestName.trim()) { alert("請輸入團體名稱"); return; }
        if (groupRooms.some(r => !r.roomNo.trim())) { alert("請填寫所有房號"); return; }
 
        // 驗證是否有重複房號 (團體本身是否有重複，或是否有重複已存在於資料庫)
        const allNewGroupRoomNos = groupRooms.map(r => r.roomNo.trim());
        const hasSelfDuplicate = new Set(allNewGroupRoomNos).size !== allNewGroupRoomNos.length;
        if (hasSelfDuplicate) {
          alert("⚠️ 錯誤：名單中填寫的房號有重複，請仔細檢查！");
          return;
        }

        for (const r of groupRooms) {
          const matched = rooms.find(ex => ex.roomNumber === r.roomNo.trim());
          if (matched) {
            alert(`⚠️ 房號 [${r.roomNo.trim()}] 重複！該房目前已登記給 [${matched.guestName || '其他客人'}]。請確認房號是否正確或是否已有人入住。`);
            return;
          }
        }

        const nameWithSuffix = newGuestName.replace(/\s*\(\d+天\d+夜\)/g, '') + getDurationSuffix(stayNights);
 
        for (let i = 0; i < groupRooms.length; i++) {
          const room = groupRooms[i];
          const formattedActivities = calculateActivitiesForProject(projectType, room.peopleCount, isSaturday, stayNights);
          await addRoom({ 
            roomNumber: room.roomNo, 
            guestName: nameWithSuffix, 
            checkInDate: checkInDate,
            groupType: projectType,
            tourLeaderName: projectType === 'general_group' ? tourLeaderName : undefined,
            tourLeaderPhone: projectType === 'general_group' ? tourLeaderPhone : undefined,
            isSaturday: projectType === 'lion' ? isSaturday : undefined,
            vegetarianCount: i === 0 ? vegetarianCount : 0,
            notes: i === 0 ? notes : "",
            activities: formattedActivities 
          });
        }
      } else {
        if (!newRoomNo.trim() || !newGuestName.trim()) { alert("請輸入房號及代表姓名"); return; }
        
        // 驗證是否重疊房號
        const matched = rooms.find(ex => ex.roomNumber === newRoomNo.trim());
        if (matched) {
          alert(`⚠️ 房號 [${newRoomNo.trim()}] 重複！該房目前已登記給 [${matched.guestName || '其他客人'}]。請確認房號是否正確或是否已有人入住。`);
          return;
        }

        const nameWithSuffix = newGuestName.replace(/\s*\(\d+天\d+夜\)/g, '') + getDurationSuffix(stayNights);
        const formattedActivities: any = {};
        Object.keys(newActivities).forEach(k => {
          formattedActivities[k] = { total: newActivities[k], consumed: 0 };
        });
 
        await addRoom({ 
          roomNumber: newRoomNo, 
          guestName: nameWithSuffix, 
          checkInDate: checkInDate,
          groupType: 'none',
          vegetarianCount: vegetarianCount,
          notes: notes,
          activities: formattedActivities 
        });
      }
 
      setIsAdding(false);
      setNewRoomNo('');
      setNewGuestName('');
      setGroupRooms([{ id: Date.now(), roomNo: '', peopleCount: 2 }]);
      setPeopleCount(2);
      setVegetarianCount(0);
      setNotes('');
      setProjectType('one_night');
      setStayNights(1);
      setIsSaturday(false);
      setTourLeaderName('');
      setTourLeaderPhone('');
      setNewActivities({
        chineseBreakfast: 2,
        chineseLunch: 0,
        chineseLunchSecondDay: 0,
        chineseDinner: 0,
        westernLunch: 0,
        westernDinner: 0,
        seasonalActivity: 0,
        jamDiy: 0,
        vinegarDiy: 0,
        afternoonTea: 0,
      });
      loadRooms();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteRoom = (roomId: string) => {
    triggerConfirm(
      '確認是否刪除該房間紀錄？',
      '確定要刪除此房間紀錄嗎？刪除後資訊將無法恢復。',
      async () => {
        try {
          await deleteRoom(roomId);
          loadRooms();
        } catch (err: any) {
          triggerAlert('刪除客房失敗', err.message);
        }
      }
    );
  };

  const handleDeleteGroup = (groupName: string, roomsInGroup: RoomRecord[]) => {
    triggerConfirm(
      '確認是否刪除整個團體？',
      `確定要刪除整個團體【${groupName}】嗎？\n這將會一次刪除本團體共 ${roomsInGroup.length} 間房：\n${roomsInGroup.map(r => r.roomNumber).join(', ')}`,
      async () => {
        try {
          setLoading(true);
          for (const r of roomsInGroup) {
            await deleteRoom(r.id);
          }
          loadRooms();
        } catch (err: any) {
          triggerAlert('刪除團體失敗', err.message);
        } finally {
          setLoading(false);
        }
      }
    );
  };

  const addGroupRoomRow = () => {
    setGroupRooms([...groupRooms, { id: Date.now(), roomNo: '', peopleCount: 2 }]);
  };

  const removeGroupRoomRow = (id: number) => {
    if (groupRooms.length > 1) {
      setGroupRooms(groupRooms.filter(r => r.id !== id));
    }
  };

  const updateGroupRoom = (id: number, field: string, value: any) => {
    setGroupRooms(groupRooms.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F9F7F2] flex items-center justify-center p-4 font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full border border-[#E5E1D8] border-t-8 border-t-[#1B3022]">
          <div className="flex justify-center mb-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-[#8B5E3C] text-3xl font-bold text-white shadow-sm">雪</div>
          </div>
          <h1 className="text-3xl font-bold text-center text-slate-800 mb-2 tracking-tight">雪霸農場</h1>
          <p className="text-center text-slate-500 mb-8 font-medium">雲端活動報到管理系統</p>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-slate-500 mb-2 tracking-wide">
                部門密碼 (PIN CODE)
              </label>
              <input
                type="password"
                className="w-full px-4 py-3 rounded-xl border border-[#E5E1D8] focus:ring-2 focus:ring-[#3A5A40]/20 focus:border-[#3A5A40] transition-all outline-none bg-slate-50 focus:bg-white"
                placeholder="請輸入密碼..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {loginError && <p className="text-red-500 text-sm font-medium">{loginError}</p>}
            <button
              type="submit"
              className="w-full bg-[#3A5A40] hover:bg-[#1B3022] text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-sm active:scale-[0.98]"
            >
              登入系統
            </button>
          </form>
          
          <div className="mt-8 text-xs text-slate-400 text-center bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
            <div>
              <p className="font-bold mb-1">測試帳號參考：</p>
              <p>櫃檯: 1111 | 中式: 2222 | 西式: 3333 </p>
              <p>活動組: 4444 | 咖啡廳: 5555 | 主管巡檢: 6666</p>
            </div>
            {getOfflineModeStatus() && (
              <div className="text-[11px] text-amber-700 font-bold bg-amber-50 p-2 rounded-lg border border-amber-200">
                ⚡️ 偵測到靜態網頁平台 (Vercel)，已開啟高可靠 LocalStorage 機制，密碼與核銷功能皆可完美離線運作！
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const allowedActivities = ROLE_ACTIVITIES[user.role];

  // 1. Filtered Rooms by Search Query (Room Number, Guest Name, Tour Leader)
  const filteredRooms = rooms.filter(room => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      room.roomNumber.toLowerCase().includes(query) ||
      room.guestName.toLowerCase().includes(query) ||
      (room.tourLeaderName && room.tourLeaderName.toLowerCase().includes(query)) ||
      (room.tourLeaderPhone && room.tourLeaderPhone.includes(query)) ||
      (room.checkInDate && room.checkInDate.includes(query))
    );
  });

  // 2. Separate Individual (散客) and Group (團體) rooms
  const individualRooms = filteredRooms.filter(room => !room.groupType || room.groupType === 'none');
  const groupRoomsList = filteredRooms.filter(room => room.groupType && room.groupType !== 'none');

  // Compute stats across all loaded rooms (not filtered) so tab numbers are stable
  const individualCount = rooms.filter(room => !room.groupType || room.groupType === 'none').length;
  const groupRoomsCount = rooms.filter(room => room.groupType && room.groupType !== 'none').length;
  
  // To get unique groups count:
  const uniqueGroupKeys = Array.from(new Set(
    rooms
      .filter(room => room.groupType && room.groupType !== 'none')
      .map(room => `${room.groupType}_${room.guestName}`)
  ));
  const groupCount = uniqueGroupKeys.length;

  // Let's group the filtered group rooms by groupType and guestName
  const groupedRoomsMap: Record<string, RoomRecord[]> = {};
  groupRoomsList.forEach(room => {
    const key = `${room.groupType}_${room.guestName}`;
    if (!groupedRoomsMap[key]) {
      groupedRoomsMap[key] = [];
    }
    groupedRoomsMap[key].push(room);
  });

  return (
    <div className="min-h-screen bg-[#F9F7F2] text-slate-800 font-sans flex flex-col">
      {/* Header */}
      <header className="flex h-20 items-center justify-between border-b border-[#E5E1D8] bg-[#1B3022] px-4 md:px-8 text-white relative z-10">
        <div className="max-w-7xl mx-auto w-full flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#8B5E3C] text-xl font-bold text-white shadow-sm">雪</div>
            <div>
              <h1 className="text-lg md:text-xl font-bold tracking-tight">雪霸農場 | 雲端活動報到管理系統</h1>
              <p className="text-xs text-white/70 mt-0.5 flex flex-wrap items-center gap-2">
                <span>當前管理者：{user.name}</span>
                {getOfflineModeStatus() && (
                  <span className="bg-amber-500/25 text-amber-200 border border-amber-500/30 text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md">
                    ⚡️ 離線儲存版 (LocalStorage)
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition-colors text-sm font-medium"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">登出</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Front Desk specific controls */}
        {(user.role === 'frontdesk' || user.role === 'manager') && (
          <div className="mb-8">
            <div className="rounded-2xl border border-[#E5E1D8] bg-white p-6 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-slate-800 flex items-center">
                  <div className="h-2 w-2 rounded-full bg-[#1B3022] mr-3"></div>
                  櫃檯管理面板
                </h2>
                <button
                  onClick={handleTriggerAddRoom}
                  className="flex items-center space-x-2 bg-[#3A5A40] hover:bg-[#1B3022] text-white px-4 py-2 rounded-lg transition-all font-medium text-sm shadow-sm active:scale-95"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>新增房客紀錄</span>
                </button>
              </div>

              {isAdding && (
                <form onSubmit={handleAddRoom} className="bg-[#F9F7F2] p-5 rounded-xl border border-[#E5E1D8] mt-4 shadow-inner">
                  <div className="flex flex-col sm:flex-row gap-5 mb-5">
                    <div className="w-full sm:w-1/4">
                      <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">專案類型</label>
                      <select
                        value={projectType}
                        onChange={(e: any) => {
                          const val = e.target.value;
                          setProjectType(val);
                          setNewRoomNo('');
                          setGroupRooms([{ id: Date.now(), roomNo: '', peopleCount: 2 }]);
                          if (val === 'longstay') {
                            setStayNights(4);
                          } else {
                            setStayNights(1);
                          }
                        }}
                        className="w-full px-4 py-2.5 bg-white border border-[#E5E1D8] rounded-xl focus:ring-2 focus:ring-[#3A5A40]/20 focus:border-[#3A5A40] outline-none shadow-sm transition-all text-sm font-medium"
                      >
                        <option value="one_night">一泊二食 (含活動卷D)</option>
                        <option value="premium">尊爵專案 (含西午西晚TW)</option>
                        <option value="longstay">Longstay 五天四夜專案 🌸</option>
                        <option value="custom">自訂 / 單獨購買</option>
                        <option value="lion">雄獅專案 (團體)</option>
                        <option value="yirong">怡容專案 (團體)</option>
                        <option value="general_group">一般團體 (團體)</option>
                      </select>
                    </div>

                    <div className="w-full sm:w-[15%]">
                      <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">入住日期 (實際日期)</label>
                      <input
                        type="date"
                        required
                        value={checkInDate}
                        onChange={(e) => setCheckInDate(e.target.value)}
                        className="w-full px-4 py-2.5 bg-white border border-[#E5E1D8] rounded-xl focus:ring-2 focus:ring-[#3A5A40]/20 focus:border-[#3A5A40] outline-none shadow-sm transition-all text-sm font-semibold text-slate-700"
                      />
                    </div>

                    <div className="w-full sm:w-[15%]">
                      <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">入住晚數 (一泊1晚)</label>
                      <select
                        value={stayNights}
                        onChange={(e) => setStayNights(parseInt(e.target.value) || 1)}
                        className="w-full px-4 py-2.5 bg-white border border-[#E5E1D8] rounded-xl focus:ring-2 focus:ring-[#3A5A40]/20 focus:border-[#3A5A40] outline-none shadow-sm transition-all text-sm font-medium"
                      >
                        <option value={1}>1 晚 (兩天一夜)</option>
                        <option value={2}>2 晚 (三天兩夜)</option>
                        <option value={3}>3 晚 (四天三夜)</option>
                        <option value={4}>4 晚 (五天四夜)</option>
                        <option value={5}>5 晚 (六天五夜)</option>
                        <option value={6}>6 晚 (七天六夜)</option>
                        <option value={7}>7 晚 (八天七夜)</option>
                      </select>
                    </div>

                    {!isGroupMode ? (
                      <>
                        <div className="w-full sm:w-1/6">
                          <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">房號</label>
                          <input 
                            required 
                            value={newRoomNo} 
                            onChange={e => setNewRoomNo(e.target.value)} 
                            className="w-full px-4 py-2.5 bg-white border border-[#E5E1D8] rounded-xl focus:ring-2 focus:ring-[#3A5A40]/20 focus:border-[#3A5A40] outline-none transition-all shadow-sm text-sm font-semibold" 
                            placeholder="例: 101" 
                          />
                        </div>
                        <div className="w-full sm:w-1/5">
                          <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">代表姓名</label>
                          <input 
                            required 
                            value={newGuestName} 
                            onChange={e => setNewGuestName(e.target.value)} 
                            className="w-full px-4 py-2.5 bg-white border border-[#E5E1D8] rounded-xl focus:ring-2 focus:ring-[#3A5A40]/20 focus:border-[#3A5A40] outline-none transition-all shadow-sm text-sm font-semibold" 
                            placeholder="例: 王大明" 
                          />
                        </div>
                        <div className="w-full sm:w-[90px]">
                          <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide text-center">人數</label>
                          <input 
                            type="number"
                            min="1"
                            required 
                            value={peopleCount} 
                            onChange={e => setPeopleCount(parseInt(e.target.value) || 1)} 
                            className="w-full px-4 py-2.5 bg-white border border-[#E5E1D8] rounded-xl focus:ring-2 focus:ring-[#3A5A40]/20 focus:border-[#3A5A40] outline-none transition-all shadow-sm text-center text-sm font-bold" 
                          />
                        </div>
                      </>
                    ) : (
                      <div className="w-full sm:w-2/5 flex-1">
                        <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">團體訂房名稱</label>
                        <input 
                          required 
                          value={newGuestName} 
                          onChange={e => setNewGuestName(e.target.value)} 
                          className="w-full px-4 py-2.5 bg-white border border-[#E5E1D8] rounded-xl focus:ring-2 focus:ring-[#3A5A40]/20 focus:border-[#3A5A40] outline-none transition-all shadow-sm text-sm font-bold" 
                          placeholder="例: 怡容台北3日團" 
                        />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-5 bg-white p-4 rounded-xl border border-[#E5E1D8] shadow-sm">
                    <div className="w-full">
                      <label className="block text-xs font-bold text-[#3A5A40] mb-2 uppercase tracking-wide">
                        {isGroupMode ? "🍏 團體素食總人數" : "🍏 素食用餐人數"}
                      </label>
                      <input 
                        type="number"
                        min="0"
                        required 
                        value={vegetarianCount} 
                        onChange={e => setVegetarianCount(Math.max(0, parseInt(e.target.value) || 0))} 
                        className="w-full px-4 py-2 bg-slate-50 border border-[#E5E1D8] rounded-xl focus:ring-2 focus:ring-[#3A5A40]/20 focus:border-[#3A5A40] outline-none transition-all shadow-sm text-sm font-semibold text-center" 
                        placeholder="無則填 0"
                      />
                    </div>
                    <div className="w-full sm:col-span-2">
                      <label className="block text-xs font-bold text-[#3A5A40] mb-2 uppercase tracking-wide">
                        {isGroupMode ? "📝 團體特別與餐飲備註事項 (跨部門全體可見)" : "📝 房客餐飲與特別需求備註 (本房 & 全體跨部門可見)"}
                      </label>
                      <input 
                        value={notes} 
                        onChange={e => setNotes(e.target.value)} 
                        className="w-full px-4 py-2 bg-slate-50 border border-[#E5E1D8] rounded-xl focus:ring-2 focus:ring-[#3A5A40]/20 focus:border-[#3A5A40] outline-none transition-all shadow-sm text-sm font-semibold" 
                        placeholder={isGroupMode ? "例：團體有 3 人吃素、無特定過敏、或者需嬰兒床、安排遊覽車停車等..." : "例：1 人吃素、無特定過敏、或者需嬰兒床等..."} 
                      />
                    </div>
                  </div>

                  {/* Lion specific Saturday input */}
                  {projectType === 'lion' && (
                    <div className="mb-5 flex items-center bg-white p-3 rounded-xl border border-[#E5E1D8] shadow-sm max-w-md">
                      <input
                        type="checkbox"
                        id="isSaturday"
                        checked={isSaturday}
                        onChange={(e) => setIsSaturday(e.target.checked)}
                        className="h-4 w-4 text-[#3A5A40] focus:ring-[#3A5A40] border-gray-300 rounded cursor-pointer"
                      />
                      <label htmlFor="isSaturday" className="ml-2 text-sm font-semibold text-slate-700 cursor-pointer select-none">
                        週六入住 (週六專屬附下午茶卷T)
                      </label>
                    </div>
                  )}

                  {/* General Group specific inputs */}
                  {projectType === 'general_group' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5 bg-white p-4 rounded-xl border border-[#E5E1D8] shadow-sm">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">領隊姓名 (中餐廳午餐備查)</label>
                        <input
                          type="text"
                          required
                          value={tourLeaderName}
                          onChange={e => setTourLeaderName(e.target.value)}
                          placeholder="請輸入領隊姓名..."
                          className="w-full px-4 py-2 bg-slate-50 border border-[#E5E1D8] rounded-xl focus:ring-2 focus:ring-[#3A5A40]/20 focus:border-[#3A5A40] outline-none text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">領隊電話 (中餐廳午餐備查)</label>
                        <input
                          type="text"
                          required
                          value={tourLeaderPhone}
                          onChange={e => setTourLeaderPhone(e.target.value)}
                          placeholder="請輸入領隊聯絡電話..."
                          className="w-full px-4 py-2 bg-slate-50 border border-[#E5E1D8] rounded-xl focus:ring-2 focus:ring-[#3A5A40]/20 focus:border-[#3A5A40] outline-none text-sm"
                        />
                      </div>
                    </div>
                  )}

                  {/* Group Rooms Allocation Editor */}
                  {isGroupMode && (
                    <div className="mb-6">
                      <label className="block text-xs font-bold text-slate-500 mb-3 uppercase tracking-wide">分配房間與每房人數</label>
                      <div className="bg-white border border-[#E5E1D8] rounded-xl p-4 shadow-sm space-y-3">
                        {/* Header guides */}
                        <div className="hidden sm:flex gap-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1 pb-1 border-b border-slate-100">
                          <div className="w-48 shrink-0">房號</div>
                          <div className="flex-1">每房入住人數 (套用活動核銷額度)</div>
                          <div className="w-8 shrink-0"></div>
                        </div>

                        {groupRooms.map((r) => (
                          <div key={r.id} className="flex gap-4 items-center">
                            <div className="w-48 shrink-0">
                              <input 
                                required
                                value={r.roomNo} 
                                onChange={e => updateGroupRoom(r.id, 'roomNo', e.target.value)} 
                                className="w-full px-3 py-2 bg-slate-50 border border-[#E5E1D8] rounded-lg focus:ring-2 focus:ring-[#3A5A40]/20 focus:border-[#3A5A40] outline-none transition-all text-sm font-semibold" 
                                placeholder="例: 101" 
                              />
                            </div>
                            <div className="flex-1">
                              <input 
                                type="number" 
                                min="1" 
                                required
                                value={r.peopleCount} 
                                onChange={e => updateGroupRoom(r.id, 'peopleCount', parseInt(e.target.value) || 1)} 
                                className="w-28 px-3 py-2 bg-slate-50 border border-[#E5E1D8] rounded-lg focus:ring-2 focus:ring-[#3A5A40]/20 focus:border-[#3A5A40] outline-none transition-all text-sm text-center font-bold text-slate-700" 
                                placeholder="人數"
                              />
                            </div>
                            <button 
                              type="button"
                              onClick={() => removeGroupRoomRow(r.id)} 
                              disabled={groupRooms.length === 1}
                              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                        <button 
                          type="button"
                          onClick={addGroupRoomRow}
                          className="mt-3 flex items-center justify-center w-full py-2 border-2 border-dashed border-[#E5E1D8] text-[#3A5A40] font-bold text-sm rounded-lg hover:bg-[#3A5A40]/5 transition-colors"
                        >
                          加入一間房
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Manual activities adjustment for non-groups only */}
                  {!isGroupMode && (
                    <div className="mb-5 bg-white border border-[#E5E1D8] p-4 rounded-xl shadow-xs">
                      <label className="block text-xs font-bold text-[#3A5A40] mb-3 uppercase tracking-wide">💡 專案活動票卷原始總額設定 (自訂調整會自動設為自訂專案型態)</label>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
                        {Object.keys(ACTIVITY_DICT).map(key => (
                          <div key={key} className="flex flex-col items-center bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-center transition-all hover:border-[#3A5A40]/30 shadow-3xs">
                            <span className="text-[11px] font-extrabold text-[#1B3022] truncate max-w-full mb-2">{ACTIVITY_DICT[key]}</span>
                            <div className="flex items-center border border-[#E5E1D8] bg-white rounded-lg overflow-hidden shrink-0 mt-auto">
                              <button 
                                type="button" 
                                onClick={() => {
                                  setProjectType('custom');
                                  setNewActivities(prev => ({ ...prev, [key]: Math.max(0, (prev[key] || 0) - 1) }));
                                }} 
                                className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-500 font-extrabold text-xs border-r border-[#E5E1D8] transition-colors"
                              >
                                -
                              </button>
                              <span className="text-xs font-mono font-black w-7 text-center text-slate-800">{newActivities[key] || 0}</span>
                              <button 
                                type="button" 
                                onClick={() => {
                                  setProjectType('custom');
                                  setNewActivities(prev => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
                                }} 
                                className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-500 font-extrabold text-xs border-l border-[#E5E1D8] transition-colors"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <button type="button" onClick={() => setIsAdding(false)} className="px-5 py-2.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700 rounded-xl transition-all mr-3 text-sm font-bold">取消</button>
                    <button type="submit" className="bg-[#3A5A40] hover:bg-[#1B3022] text-white px-6 py-2.5 rounded-xl font-bold transition-all text-sm shadow-sm active:scale-95">
                      {isGroupMode ? '批量建立房客' : '建立新房客'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Search & Tabs Controls */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Tabs */}
          <div className="flex bg-slate-200/60 p-1 rounded-xl w-fit shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('individual')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                activeTab === 'individual'
                  ? 'bg-white text-[#1B3022] shadow font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-4 h-4 text-[#8B5E3C]" />
              <span>散客 / 自訂名單</span>
              <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono font-bold">
                {individualCount} 房
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('group')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                activeTab === 'group'
                  ? 'bg-white text-[#1B3022] shadow font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MountainSnow className="w-4 h-4 text-[#3A5A40]" />
              <span>團體專案名單</span>
              <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono font-bold">
                {groupCount} 團 / {groupRoomsCount} 房
              </span>
            </button>
          </div>

          {/* Search bar */}
          <div className="relative max-w-sm w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              placeholder="搜尋房號、團體、房客或領隊..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 bg-white border border-[#E5E1D8] rounded-xl focus:ring-2 focus:ring-[#3A5A40]/20 focus:border-[#3A5A40] outline-none text-sm transition-all shadow-sm font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-slate-400 hover:text-slate-600"
              >
                清除
              </button>
            )}
          </div>
        </div>

        {/* Main responsive column split layout */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
          
          {/* 左側：現有的核銷與名單介面 */}
          <div className={`${user.role === 'manager' ? 'xl:col-span-8' : 'xl:col-span-12'} space-y-6`}>
            
            {/* ⚡️ 各部門快速搜尋房號一鍵核銷快捷面板 */}
            {searchQuery.trim() !== "" && (
              <div className="bg-amber-50/50 border-2 border-amber-300 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4 text-left animate-fade-in">
                <div className="flex items-center justify-between border-b border-amber-200 pb-2.5">
                  <span className="font-extrabold text-amber-955 flex items-center gap-2 text-sm uppercase tracking-wide">
                    <span className="text-lg animate-bounce">⚡️</span>
                    <span>房號「{searchQuery}」快速核銷特快通道</span>
                  </span>
                  <span className="text-[10px] font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-200 uppercase tracking-widest animate-pulse">
                    即時核對與沖銷
                  </span>
                </div>

                {(() => {
                  const cleanedQuery = searchQuery.trim().toLowerCase();
                  // 篩選出房號部分或完全符合搜尋詞
                  const matchedRooms = rooms.filter(r => r.roomNumber.toLowerCase().includes(cleanedQuery));

                  if (matchedRooms.length === 0) {
                    return (
                      <div className="py-4 text-center text-slate-400 text-xs font-semibold">
                        找不到符合房號「{searchQuery}」的客房記錄，請再次確認。
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-3">
                      {matchedRooms.map(room => {
                        const dailyStates = getRoomDailyActivitiesList(room);
                        const allowedActivities = ROLE_ACTIVITIES[user.role] || [];
                        
                        // 只拉出該部門有權限核銷＆並且在此日期有配額總量 > 0 的項目
                        const todayDeptActivities = dailyStates.filter(ds => 
                          ds.date === selectedDate && 
                          ds.total > 0 && 
                          allowedActivities.includes(ds.activityKey)
                        );

                        if (todayDeptActivities.length === 0) {
                          return (
                            <div key={room.id} className="p-3 bg-white border border-stone-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 opacity-65">
                              <div>
                                <span className="font-mono text-xs font-bold bg-slate-100 px-2 py-0.5 rounded mr-2 text-slate-600">
                                  {room.roomNumber} 房
                                </span>
                                <span className="text-xs font-bold text-slate-700">{room.guestName}</span>
                              </div>
                              <span className="text-[10px] text-slate-400 font-bold bg-slate-50 border border-slate-100 px-2 py-0.5 rounded">
                                本日無此部門可核銷之額度項目
                              </span>
                            </div>
                          );
                        }

                        return (
                          <div key={room.id} className="p-4 bg-white border-2 border-[#3A5A40]/30 hover:border-[#3A5A40] rounded-xl shadow-xs transition-colors space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                              <div>
                                <span className="font-mono text-sm font-black bg-[#3A5A40] text-white px-2.5 py-1 rounded-lg mr-2 shadow-2xs">
                                  {room.roomNumber} 房
                                </span>
                                <span className="text-sm font-extrabold text-slate-800">{room.guestName}</span>
                              </div>
                              <span className="text-[11px] text-slate-400 font-bold">
                                入住日: {room.checkInDate}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                              {todayDeptActivities.map(act => {
                                const remaining = act.total - act.consumed;
                                const isFullyUsed = remaining <= 0;
                                const actName = ACTIVITY_DICT[act.activityKey] || act.activityKey;

                                return (
                                  <div key={act.activityKey} className="bg-slate-55 border border-slate-200 rounded-lg p-2.5 flex flex-col justify-between hover:bg-slate-100/50 transition-colors">
                                    <div className="flex justify-between items-start mb-2">
                                      <div className="flex flex-col">
                                        <span className="text-xs font-black text-slate-700">{actName}</span>
                                        <span className="text-[10.5px] text-slate-400 font-bold mt-0.5">
                                          本日額度: <strong className="text-slate-700">{act.total}</strong> 份 ｜ 已核: <strong className={isFullyUsed ? "text-emerald-700 font-extrabold" : "text-[#3A5A40]"}>{act.consumed}</strong> 份
                                        </span>
                                      </div>
                                      <span className={`text-[10px] px-2 py-0.5 rounded font-black ${isFullyUsed ? 'bg-emerald-50 text-emerald-800 border border-emerald-110' : 'bg-amber-50 text-amber-850 border border-amber-110'}`}>
                                        {isFullyUsed ? '已核完 ✓' : `剩餘 ${remaining} 份`}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1.5 self-end w-full sm:w-auto mt-1 shrink-0">
                                      {/* Quick consume +1 button */}
                                      <button
                                        type="button"
                                        disabled={isFullyUsed}
                                        onClick={() => handleConsume(room.id, act.activityKey, 1, selectedDate)}
                                        className="flex-1 sm:flex-none justify-center rounded-lg bg-[#3A5A40] text-white py-1.5 px-3.5 text-xs font-black hover:bg-[#1B3022] transition-colors disabled:opacity-30 disabled:hover:bg-[#3A5A40] flex items-center gap-1 shadow-3xs active:scale-[0.98]"
                                      >
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        <span>確認核銷 +1 份</span>
                                      </button>

                                      {/* Quick consume ALL button */}
                                      {!isFullyUsed && remaining > 1 && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            triggerConfirm(
                                              '確認是否一次核銷全部剩餘額度？',
                                              `確定要將 ${room.roomNumber} 房的「${actName}」剩餘 ${remaining} 份全部一次核銷扣除嗎？`,
                                              () => {
                                                handleConsume(room.id, act.activityKey, remaining, selectedDate);
                                              }
                                            );
                                          }}
                                          className="flex-1 sm:flex-none justify-center rounded-lg bg-amber-500 text-white py-1.5 px-3 text-xs font-black hover:bg-amber-600 transition-colors flex items-center gap-1 shadow-3xs active:scale-[0.98]"
                                        >
                                          <span>全扣 ({remaining} 份)</span>
                                        </button>
                                      )}

                                      {/* Reversal / undo button */}
                                      {act.consumed > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            triggerConfirm(
                                              '確認是否撤銷部分核銷？',
                                              `確定要還原 1 份房號 ${room.roomNumber} 在今日已核銷的「${actName}」嗎？`,
                                              () => {
                                                handleConsume(room.id, act.activityKey, -1, selectedDate);
                                              }
                                            );
                                          }}
                                          className="text-slate-400 hover:text-red-650 hover:bg-red-50 p-1.5 rounded-lg border border-transparent hover:border-red-100 transition-all"
                                          title="減少/撤銷 1 份核銷"
                                        >
                                          <Undo2 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Room List grid */}
            {activeTab === 'individual' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {individualRooms.map((room) => {
              const isRoomCollapsed = collapsedRooms[room.id] ?? true; // 默認是合起來的
              return (
                <div key={room.id} className="rounded-2xl border border-[#E5E1D8] bg-white shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col">
                  <div 
                    onClick={() => setCollapsedRooms(prev => ({ ...prev, [room.id]: !isRoomCollapsed }))}
                    className="border-b border-[#E5E1D8] bg-slate-50/50 px-6 py-5 flex justify-between items-center cursor-pointer select-none hover:bg-slate-100/65 transition-colors"
                  >
                    <div className="flex flex-col">
                      <div className="flex items-baseline space-x-3">
                        <span className="text-2xl font-bold tracking-tight text-[#1B3022]">
                          {room.roomNumber}
                        </span>
                        <span className="font-semibold text-slate-700">{room.guestName}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {(() => {
                          const hasCd = (room.activities.chineseDinner?.total || 0) > 0;
                          const hasCb = (room.activities.chineseBreakfast?.total || 0) > 0;
                          const hasWd = (room.activities.westernDinner?.total || 0) > 0;
                          const hasWa = (room.activities.afternoonTea?.total || 0) > 0;
                          const hasD = (room.activities.seasonalActivity?.total || 0) > 0;

                          if (hasWd || hasWa) {
                            return (
                              <span className="inline-flex items-center text-[10px] font-extrabold px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 uppercase tracking-wider w-fit">
                                👑 尊爵一泊二食專案
                              </span>
                            );
                          }
                          if (hasD) {
                            return (
                              <span className="inline-flex items-center text-[10px] font-extrabold px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 uppercase tracking-wider w-fit">
                                🎫 散客一泊二食專案
                              </span>
                            );
                          }
                          if (hasCd && hasCb && !hasWd) {
                            return (
                              <span className="inline-flex items-center text-[10px] font-extrabold px-2 py-0.5 rounded bg-teal-50 border border-[#E5E1D8] text-teal-700 uppercase tracking-wider w-fit">
                                🌸 Longstay 5天4夜專案
                              </span>
                            );
                          }
                          return (
                            <span className="inline-flex items-center text-[10px] font-extrabold px-2 py-0.5 rounded bg-slate-150 border border-slate-250 text-slate-600 uppercase tracking-wider w-fit">
                              👤 自訂票卷房客
                            </span>
                          );
                        })()}
                        {room.checkInDate && (
                          <span className="inline-flex items-center text-[10px] font-extrabold px-2 py-0.5 rounded bg-stone-100 border border-stone-200 text-stone-700 uppercase tracking-wider w-fit">
                            📅 {room.checkInDate}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-1.5 shrink-0">
                      {(user.role === 'frontdesk' || user.role === 'manager') && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteRoom(room.id);
                          }} 
                          className="text-slate-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                      <div>
                        {isRoomCollapsed ? (
                          <ChevronDown className="w-5 h-5 text-slate-400" />
                        ) : (
                          <ChevronUp className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
                    </div>
                  </div>
                  {!isRoomCollapsed && (
                    <div className="p-6 flex-1 bg-white space-y-6">
                  {/* Vegetarian & Remarks Section */}
                  {(user.role === 'frontdesk' || user.role === 'manager') ? (
                    <div className="bg-[#FAF9F5] border border-[#E5E1D8] rounded-xl p-3.5 space-y-3 shadow-3xs">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">房客備註與素食設定</div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-bold text-slate-650 flex items-center gap-1">
                          <span>🍏 素食餐點人數:</span>
                        </span>
                        <div className="flex items-center border border-[#E5E1D8] bg-white rounded-lg overflow-hidden shrink-0">
                          <button 
                            type="button" 
                            onClick={() => handleUpdateRoomMeta(room.id, { vegetarianCount: Math.max(0, (room.vegetarianCount || 0) - 1) })} 
                            className="px-2 py-0.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border-r border-[#E5E1D8] transition-colors"
                          >
                            -
                          </button>
                          <span className="text-xs font-extrabold w-7 text-center text-emerald-800 bg-slate-50/50">{room.vegetarianCount || 0}</span>
                          <button 
                            type="button" 
                            onClick={() => handleUpdateRoomMeta(room.id, { vegetarianCount: (room.vegetarianCount || 0) + 1 })} 
                            className="px-2 py-0.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border-l border-[#E5E1D8] transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div>
                        <textarea
                          placeholder="點擊輸入客製化餐飲/特殊需求備註..."
                          key={room.id + '_notes'}
                          defaultValue={room.notes || ""}
                          onBlur={(e) => {
                            if (e.target.value !== (room.notes || "")) {
                              handleUpdateRoomMeta(room.id, { notes: e.target.value });
                            }
                          }}
                          className="w-full text-xs font-semibold p-2 bg-white border border-[#E5E1D8] rounded-lg focus:ring-1 focus:ring-[#3A5A40] focus:border-[#3A5A40] outline-none text-slate-750 resize-none h-14 transition-all"
                        />
                        <div className="text-[9px] text-[#3A5A40] text-right font-semibold mt-0.5">離焦 (點擊輸入框外任意處) 自動儲存</div>
                      </div>
                    </div>
                  ) : (
                    /* Display only for other departments */
                    ((room.vegetarianCount || 0) > 0 || room.notes) && (
                      <div className="bg-[#FAFDF9] border border-emerald-100 rounded-xl p-3.5 space-y-2 text-xs shadow-3xs">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-[#1B3022] flex items-center gap-1.5 uppercase tracking-wide">
                            <span className="font-bold text-base">🍏</span>
                            房客特別備註
                          </span>
                          {(room.vegetarianCount || 0) > 0 && (
                            <span className="bg-emerald-100 text-emerald-850 px-2 rounded-full font-black text-[10px] uppercase border border-emerald-250 shrink-0">
                              素食：{room.vegetarianCount} 人
                            </span>
                          )}
                        </div>
                        {room.notes ? (
                          <p className="text-slate-650 bg-white border border-slate-100 p-2 text-xs font-bold break-all leading-relaxed whitespace-pre-wrap">
                            {room.notes}
                          </p>
                        ) : (
                          <p className="text-slate-400 italic text-[11px]">無文字備註</p>
                        )}
                      </div>
                    )
                  )}

                   {/* For frontline desk, show master controllers */}
                   {(user.role === 'frontdesk' || user.role === 'manager') ? (
                     <div className="space-y-2">
                       <div className="flex items-center justify-between border-b border-stone-150 pb-1.5">
                         <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">專案套裝額度明細</h4>
                         <button
                           type="button"
                           onClick={() => setEditingQuotaRooms(prev => ({ ...prev, [room.id]: !prev[room.id] }))}
                           className="text-[10px] font-bold text-[#3A5A40] hover:text-[#1B3022] bg-emerald-50 hover:bg-emerald-100 border border-emerald-150 px-2 py-0.5 rounded transition-all select-none"
                         >
                           {editingQuotaRooms[room.id] ? "隱藏面板 ✕" : "✏️ 修正原始票卷額度"}
                         </button>
                       </div>
                       
                       {editingQuotaRooms[room.id] && (
                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 bg-slate-50/50 rounded-xl border border-slate-100">
                           {allowedActivities.map(actKey => {
                             const stats = room.activities[actKey as keyof typeof room.activities] as ActivityCounts;
                             if (!stats) return null;
                             const isZero = stats.total === 0;
                             return (
                               <div key={actKey} className={`flex items-center justify-between p-2 bg-white border border-slate-150 rounded-lg text-xs ${isZero ? 'opacity-35' : ''}`}>
                                 <div className="flex flex-col text-left">
                                   <span className="font-extrabold text-[#1B3022] leading-tight shrink-0 truncate max-w-[110px]">{ACTIVITY_DICT[actKey]}</span>
                                   <span className="text-[9px] text-slate-400">已核: {stats.consumed}</span>
                                 </div>
                                 <div className="flex items-center border border-[#E5E1D8] bg-white rounded-lg overflow-hidden shrink-0">
                                   <button type="button" onClick={() => handleUpdateTotal(room.id, room, actKey, -1)} className="px-1.5 py-0.5 bg-white hover:bg-slate-50 text-slate-700 text-xs transition-colors font-bold border-r border-[#E5E1D8]">-</button>
                                   <span className="text-xs font-mono font-bold w-6 text-center text-slate-800">{stats.total}</span>
                                   <button type="button" onClick={() => handleUpdateTotal(room.id, room, actKey, 1)} className="px-1.5 py-0.5 bg-white hover:bg-slate-50 text-slate-700 text-xs transition-colors font-bold border-l border-[#E5E1D8]">+</button>
                                 </div>
                               </div>
                             );
                           })}
                         </div>
                       )}
                     </div>
                   ) : null}

                  {/* Date specific Day-by-day consumption (Timeline) */}
                  <div>
                    <h4 className="text-xs font-bold text-[#3A5A40] uppercase tracking-wider mb-3">按住宿天數核銷明細</h4>
                    {(() => {
                      const nights = getNightsFromGuestName(room.guestName);
                      const dates = getStayDaysList(room.checkInDate, nights);
                      const dailyStates = getRoomDailyActivitiesList(room);
                      const allowedDailyStates = dailyStates.filter(ds => allowedActivities.includes(ds.activityKey));
                      const todayStr = new Date().toLocaleDateString('sv'); // yyyy-mm-dd local

                      const activeDates = dates.filter(date => {
                        return allowedDailyStates.some(ds => ds.date === date && ds.total > 0);
                      });

                      if (activeDates.length === 0) {
                        return <div className="text-xs text-slate-400 py-2">本日無任何需核銷項目</div>;
                      }

                      return (
                        <div className="space-y-3.5">
                          {activeDates.map((date) => {
                            const dateActivities = allowedDailyStates.filter(ds => ds.date === date && ds.total > 0);
                            const isToday = date === todayStr;
                            
                            return (
                              <div 
                                key={date} 
                                className={`p-3 rounded-xl border transition-all ${
                                  isToday 
                                    ? 'border-amber-300 bg-amber-50/15 shadow-2xs' 
                                    : 'border-[#E5E1D8]/50 bg-slate-50/30'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                                    <span className={`h-1.5 w-1.5 rounded-full ${isToday ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'}`}></span>
                                    {formatDateWithDayOfWeek(date)}
                                  </span>
                                  {isToday && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-amber-100 text-amber-800 border border-amber-250 animate-pulse tracking-wide font-sans">
                                      🎯 今日
                                    </span>
                                  )}
                                </div>
                                
                                <div className="space-y-1.5">
                                  {dateActivities.map(ds => {
                                    const isDone = ds.consumed >= ds.total;
                                    return (
                                      <div key={ds.activityKey} className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-100/60 shadow-3xs hover:border-slate-300 transition-colors">
                                        <span className="text-xs font-extrabold text-slate-700">
                                          {ACTIVITY_DICT[ds.activityKey]}
                                        </span>
                                        
                                        <div className="flex items-center space-x-1.5">
                                          <span className="text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-100/40 px-1.5 py-0.5 rounded flex items-baseline gap-0.5 scale-95 origin-right">
                                            <span className="text-xs font-extrabold text-[#1B3022]">{ds.consumed}</span>
                                            <span>/</span>
                                            <span>{ds.total}</span>
                                          </span>
                                          
                                          {user.role !== 'frontdesk' && (
                                            <div className="flex items-center gap-1">
                                              {!isDone && (
                                                <button
                                                  onClick={() => handleConsume(room.id, ds.activityKey, 1, date)}
                                                  className="rounded bg-[#3A5A40] hover:bg-[#1B3022] text-white px-2 py-0.5 text-xs font-bold transition-all active:scale-95 shadow-3xs"
                                                >
                                                  核銷
                                                </button>
                                              )}
                                              {ds.consumed > 0 && (
                                                <button
                                                  onClick={() => handleConsume(room.id, ds.activityKey, -1, date)}
                                                  className="rounded bg-red-50 border border-red-100 text-red-650 px-1.5 py-0.5 text-xs font-bold hover:bg-red-100 transition-all active:scale-95 shadow-3xs"
                                                  title="撤銷一筆"
                                                >
                                                  撤銷
                                                </button>
                                              )}
                                              {isDone && (
                                                <span className="text-[10px] font-extrabold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
                                                  已結清
                                                </span>
                                              )}
                                            </div>
                                          )}
                                          
                                          {(user.role === 'frontdesk' || user.role === 'manager') && (
                                            <div className="text-[10px] text-slate-400 font-bold">
                                              {isDone ? '✓ 已核銷' : `${ds.total - ds.consumed} 份待用`}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          );
        })}
            {individualRooms.length === 0 && (
              <div className="col-span-full py-16 text-center text-slate-400 bg-white rounded-2xl border-2 border-dashed border-[#E5E1D8]">
                目前沒有任何符合條件的散客紀錄
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {Object.keys(groupedRoomsMap).map((groupKey) => {
              const roomsInGroup = groupedRoomsMap[groupKey];
              if (roomsInGroup.length === 0) return null;
              
              const firstRoom = roomsInGroup[0];
              const groupName = firstRoom.guestName;
              const groupType = firstRoom.groupType || 'general_group';
              const isSaturday = firstRoom.isSaturday;
              const tourLeaderName = firstRoom.tourLeaderName;
              const tourLeaderPhone = firstRoom.tourLeaderPhone;
              
              const totalRooms = roomsInGroup.length;
              const totalPeople = roomsInGroup.reduce((sum, r) => sum + getNightsAndPeople(r).people, 0);
              const groupNights = roomsInGroup.length > 0 ? getNightsFromGuestName(roomsInGroup[0].guestName) : 1;
              
              const isCollapsed = collapsedGroups[groupKey] ?? false;
              
              // Find the primary stable room of this group to sync vegetarian/notes at group-level
              const sortedRoomsInGroup = [...roomsInGroup].sort((a,b) => a.roomNumber.localeCompare(b.roomNumber));
              const mainRoom = sortedRoomsInGroup[0] || firstRoom;
              const totalVegetarian = mainRoom.vegetarianCount || 0;
              const groupNotes = mainRoom.notes || "";
              
              return (
                <div key={groupKey} className="rounded-2xl border border-[#E5E1D8] bg-white shadow-sm overflow-hidden transition-all hover:shadow-md">
                  {/* Group Header */}
                  <div className="bg-[#FAF9F5] border-b border-[#E5E1D8] px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-1">
                        <span className={`inline-flex items-center text-xs font-extrabold px-3 py-1 rounded-lg text-white uppercase tracking-wider shadow-sm ${
                          groupType === 'lion' ? 'bg-[#8B5E3C]' : groupType === 'yirong' ? 'bg-[#D4A373]' : 'bg-[#3A5A40]'
                        }`}>
                          {groupType === 'lion' ? '雄獅專案 🦁' : groupType === 'yirong' ? '怡容專案 🌸' : '一般團體 👥'}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="text-xl font-extrabold tracking-tight text-[#1B3022]">
                            {groupName.replace(/\s*\(\d+天\d+夜\)/g, '')}
                          </span>
                          <span className="inline-flex items-center text-xs font-bold px-2 py-0.5 rounded bg-teal-50 border border-teal-200 text-teal-800">
                            {groupNights} 晚
                          </span>
                          {isSaturday && (
                            <span className="inline-flex items-center text-xs font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                              週六入住
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 font-medium mt-1 flex flex-wrap gap-x-4 gap-y-1 items-center">
                          <span>房間數：<strong className="text-[#3A5A40] font-bold">{totalRooms}</strong> 間 ({roomsInGroup.map(r => r.roomNumber).sort().join(', ')})</span>
                          <span>總人數：<strong className="text-[#3A5A40] font-bold">{totalPeople}</strong> 人</span>
                          {roomsInGroup.reduce((sum, r) => sum + (r.vegetarianCount || 0), 0) > 0 && (
                            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-850 font-black border border-emerald-300 shadow-3xs">
                              🍏 素食總計：{roomsInGroup.reduce((sum, r) => sum + (r.vegetarianCount || 0), 0)} 人
                            </span>
                          )}
                          {roomsInGroup[0]?.checkInDate && (
                            <span>入住日期：<strong className="text-[#3A5A40] font-bold">{roomsInGroup[0].checkInDate}</strong></span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 self-end md:self-auto">
                      {(user.role === 'frontdesk' || user.role === 'manager') && (
                        <button
                          type="button"
                          onClick={() => handleDeleteGroup(groupName, roomsInGroup)}
                          className="text-xs font-bold text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>整團刪除</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setCollapsedGroups(prev => ({ ...prev, [groupKey]: !isCollapsed }))}
                        className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                      >
                        {isCollapsed ? (
                          <>
                            <ChevronDown className="w-4 h-4" />
                            <span>展開 ({totalRooms} 房)</span>
                          </>
                        ) : (
                          <>
                            <ChevronUp className="w-4 h-4" />
                            <span>收闔明細</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  
                  {/* Expanded block content */}
                  {!isCollapsed && (
                    <div className="p-6 bg-slate-50/50">
                      
                      {/* Tour Leader Info warning for General Group */}
                      {groupType === 'general_group' && (tourLeaderName || tourLeaderPhone) && (
                        <div className="mb-4 bg-amber-50/80 p-4 rounded-xl text-xs text-amber-900 border border-amber-105 flex flex-col md:flex-row md:items-center justify-between gap-2 max-w-2xl shadow-sm">
                          <div className="flex items-center space-x-2">
                            <span className="h-2 w-2 bg-amber-500 rounded-full inline-block"></span>
                            <span className="font-extrabold text-amber-800">一般團體領隊資訊 (中餐核銷參考) :</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <div>領隊姓名：<span className="font-semibold text-stone-900">{tourLeaderName || '未提供'}</span></div>
                            <div>聯絡電話：<span className="font-semibold text-stone-900">{tourLeaderPhone || '未提供'}</span></div>
                          </div>
                        </div>
                      )}
                      
                      {/* Unified Group Vegetarian & Remarks Section */}
                      <div className="mb-5 bg-[#FAF9F5] border border-[#E5E1D8] p-4.5 rounded-xl text-xs space-y-3 shadow-3xs max-w-2xl bg-gradient-to-r from-emerald-50/10 via-amber-50/10 to-teal-50/5 text-left">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-[#1B3022] flex items-center gap-1.5 uppercase tracking-wide">
                            <span className="text-sm">🍏</span>
                            <span>整團餐飲備註 & 素食總人數</span>
                          </span>
                        </div>
                        
                        {(user.role === 'frontdesk' || user.role === 'manager') ? (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between gap-3 bg-white p-2.5 rounded-xl border border-[#E5E1D8]">
                              <span className="font-bold text-slate-600">整團素食小計總人數 (全團合併計):</span>
                              <div className="flex items-center border border-[#E5E1D8] bg-white rounded-lg overflow-hidden shrink-0">
                                <button 
                                  type="button" 
                                  onClick={() => handleUpdateRoomMeta(mainRoom.id, { vegetarianCount: Math.max(0, totalVegetarian - 1) })} 
                                  className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 text-sm font-bold border-r border-[#E5E1D8] transition-colors"
                                >
                                  -
                                </button>
                                <span className="text-xs font-black w-8 text-center text-emerald-800 bg-slate-50/50">{totalVegetarian}</span>
                                <button 
                                  type="button" 
                                  onClick={() => handleUpdateRoomMeta(mainRoom.id, { vegetarianCount: totalVegetarian + 1 })} 
                                  className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 text-sm font-bold border-l border-[#E5E1D8] transition-colors"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                            
                            <div className="space-y-1.5">
                              <span className="block font-bold text-slate-600">整團特別跨部門備註事項 (不限於素食，如：需求嬰兒床、合併排桌、不吃牛肉等):</span>
                              <textarea
                                placeholder="點擊編輯此團體的客製化/特別備註內容..."
                                key={mainRoom.id + '_group_remarks_textarea'}
                                defaultValue={groupNotes}
                                onBlur={(e) => {
                                  if (e.target.value !== groupNotes) {
                                    handleUpdateRoomMeta(mainRoom.id, { notes: e.target.value });
                                  }
                                }}
                                className="w-full text-xs font-semibold p-2.5 bg-white border border-[#E5E1D8] rounded-xl focus:ring-1 focus:ring-[#3A5A40] focus:border-[#3A5A40] outline-none text-slate-700 resize-none h-16 transition-all shadow-3xs"
                              />
                              <div className="text-[10px] text-emerald-800 text-right font-medium">點擊輸入框外任意處自動儲存變更</div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3 bg-white border border-[#E5E1D8]/50 p-3 rounded-lg shadow-3xs">
                            <div className="flex items-center justify-between text-slate-700 font-bold border-b border-dashed border-stone-100 pb-2">
                              <span>素食人數總計 (全團):</span>
                              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 text-xs font-extrabold border border-emerald-100/80">
                                {totalVegetarian > 0 ? `${totalVegetarian} 人` : '無'}
                              </span>
                            </div>
                            <div className="space-y-1">
                              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">整團對外聯絡 / 特別備註事項:</div>
                              {groupNotes ? (
                                <p className="text-slate-750 bg-[#FAFDF9]/50 p-2.5 rounded border border-stone-100 text-xs font-bold leading-relaxed whitespace-pre-wrap break-all">
                                  {groupNotes}
                                </p>
                              ) : (
                                <p className="text-slate-400 italic text-[11px]">本團無特別備註事項</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {(() => {
                        const nights = groupNights;
                        const dates = getStayDaysList(roomsInGroup[0]?.checkInDate, nights);
                        const allowedActivities = ROLE_ACTIVITIES[user.role];

                        const groupDailySummary = dates.map(date => {
                          const activityAggregates: Record<string, { total: number; consumed: number; pendingRoomsAndAmounts: { roomId: string; amount: number }[]; consumedRoomsAndAmounts: { roomId: string; amount: number }[] }> = {};
                          
                          roomsInGroup.forEach(room => {
                            const dailyStates = getRoomDailyActivitiesList(room);
                            dailyStates.forEach(ds => {
                              if (ds.date === date && ds.total > 0 && allowedActivities.includes(ds.activityKey)) {
                                if (!activityAggregates[ds.activityKey]) {
                                  activityAggregates[ds.activityKey] = { 
                                    total: 0, 
                                    consumed: 0, 
                                    pendingRoomsAndAmounts: [], 
                                    consumedRoomsAndAmounts: [] 
                                  };
                                }
                                activityAggregates[ds.activityKey].total += ds.total;
                                activityAggregates[ds.activityKey].consumed += ds.consumed;
                                
                                const remaining = ds.total - ds.consumed;
                                if (remaining > 0) {
                                  activityAggregates[ds.activityKey].pendingRoomsAndAmounts.push({
                                    roomId: room.id,
                                    amount: remaining
                                  });
                                }
                                if (ds.consumed > 0) {
                                  activityAggregates[ds.activityKey].consumedRoomsAndAmounts.push({
                                    roomId: room.id,
                                    amount: -ds.consumed
                                  });
                                }
                              }
                            });
                          });

                          return {
                            date,
                            activities: Object.entries(activityAggregates).map(([activityKey, agg]) => ({
                              activityKey,
                              activityName: ACTIVITY_DICT[activityKey] || activityKey,
                              ...agg
                            }))
                          };
                        }).filter(d => d.activities.length > 0);

                        if (groupDailySummary.length === 0) return null;

                        return (
                          <div className="mb-5 bg-[#FAF9F5] border border-[#3A5A40]/30 rounded-2xl p-4.5 space-y-3.5 shadow-3xs max-w-2xl text-left bg-gradient-to-r from-[#3A5A40]/5 via-[#3A5A40]/3 to-transparent">
                            <div className="flex items-center justify-between border-b border-[#E5E1D8] pb-2">
                              <span className="font-extrabold text-[#1B3022] flex items-center gap-1.5 uppercase tracking-wide">
                                <span className="text-sm">🎯</span>
                                <span>團體一鍵同時核銷 (批次快速核銷)</span>
                              </span>
                              <span className="text-[10px] font-black text-[#3A5A40] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 uppercase tracking-wider">
                                同時段出發專用
                              </span>
                            </div>

                            <p className="text-[11px] text-slate-500 font-semibold">
                              由於團體客大多是同進同出、同時用餐或體驗活動，您可在此依日期直接「一鍵全團核銷」或「一鍵全團撤銷」，免去一間間房點擊的麻煩。
                            </p>

                            <div className="space-y-3 pt-1">
                              {groupDailySummary.map(({ date, activities }) => {
                                const todayStr = new Date().toLocaleDateString('sv');
                                const isToday = date === todayStr;

                                return (
                                  <div 
                                    key={date} 
                                    className={`p-3 rounded-xl border transition-all ${
                                      isToday 
                                        ? 'border-amber-300 bg-amber-50/10 shadow-2xs' 
                                        : 'border-slate-250/60 bg-white'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs font-extrabold text-[#1B3022] flex items-center gap-1.5">
                                        <span className={`h-1.5 w-1.5 rounded-full ${isToday ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'}`}></span>
                                        {formatDateWithDayOfWeek(date)}
                                      </span>
                                      {isToday && (
                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-amber-100 text-amber-800 border border-amber-250 animate-pulse tracking-wide font-sans">
                                          🎯 今日出發
                                        </span>
                                      )}
                                    </div>

                                    <div className="space-y-2">
                                      {activities.map(act => {
                                        const isDone = act.consumed >= act.total;
                                        const processingKey = `${act.activityKey}-${date}`;
                                        const isL = isBatchProcessing === processingKey;

                                        return (
                                          <div key={act.activityKey} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/75 p-2 rounded-lg border border-slate-100 hover:border-slate-200 transition-all">
                                            <div className="flex flex-col">
                                              <span className="text-xs font-extrabold text-slate-750">
                                                {act.activityName}
                                              </span>
                                              <span className="text-[10px] text-slate-400 font-semibold mt-0.5">
                                                全團進度: <strong className="text-[#3A5A40]">{act.consumed}</strong> / {act.total} 份 ({Math.round(act.consumed / act.total * 100)}%)
                                              </span>
                                            </div>

                                            <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                                              {user.role === 'frontdesk' ? (
                                                <span className="text-[10px] text-slate-400 font-bold bg-white px-2 py-1 rounded border border-slate-100">
                                                  {isDone ? '✓ 全團已核' : `剩餘 ${act.total - act.consumed} 份`}
                                                </span>
                                              ) : (
                                                <>
                                                  {/* Bulk Consume Button */}
                                                  {act.pendingRoomsAndAmounts.length > 0 ? (
                                                    <button
                                                      type="button"
                                                      disabled={isL || !!isBatchProcessing}
                                                      onClick={() => handleBatchConsume(act.pendingRoomsAndAmounts, act.activityKey, date, 'consume')}
                                                      className="rounded-lg bg-[#3A5A40] hover:bg-[#1B3022] text-white px-2.5 py-1 text-xs font-bold transition-all active:scale-95 disabled:opacity-40 flex items-center gap-1 shadow-3xs"
                                                    >
                                                      {isL ? (
                                                        <span className="h-2 w-2 border-2 border-white rounded-full animate-spin border-t-transparent"></span>
                                                      ) : (
                                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                                      )}
                                                      <span>整團核銷 ({act.pendingRoomsAndAmounts.length} 房)</span>
                                                    </button>
                                                  ) : (
                                                    <span className="text-[10px] font-extrabold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-md flex items-center gap-1">
                                                      ✓ 全團已結清
                                                    </span>
                                                  )}

                                                  {/* Bulk Reversal Button */}
                                                  {act.consumedRoomsAndAmounts.length > 0 && (
                                                    <button
                                                      type="button"
                                                      disabled={isL || !!isBatchProcessing}
                                                      onClick={() => handleBatchConsume(act.consumedRoomsAndAmounts, act.activityKey, date, 'reverse')}
                                                      className="rounded-lg bg-red-50 border border-red-200 text-red-650 hover:bg-red-100 hover:text-red-700 px-2.5 py-1 text-xs font-bold transition-all active:scale-95 disabled:opacity-40 flex items-center gap-1 shadow-3xs"
                                                      title="撤銷本日期內全團所有已核銷本項目"
                                                    >
                                                      <span>撤銷 ({act.consumedRoomsAndAmounts.length} 房)</span>
                                                    </button>
                                                  )}
                                                </>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Rooms inside the group */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                        {roomsInGroup.sort((a,b) => a.roomNumber.localeCompare(b.roomNumber)).map((room) => (
                          <div key={room.id} className="border border-[#E5E1D8] bg-white rounded-xl shadow-xs overflow-hidden flex flex-col">
                            {/* Inner room header */}
                            <div className="border-b border-stone-100 bg-stone-50/40 px-4 py-2.5 flex justify-between items-center text-sm font-semibold">
                              <div className="flex items-baseline space-x-2">
                                <span className="text-lg font-extrabold text-[#3A5A40]">
                                  房號 {room.roomNumber}
                                </span>
                                <span className="text-xs text-slate-550 font-bold">
                                  ({getNightsAndPeople(room).people} 人, {getNightsAndPeople(room).nights} 晚)
                                </span>
                              </div>
                              {(user.role === 'frontdesk' || user.role === 'manager') && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRoom(room.id)}
                                  className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded transition-all"
                                  title="僅刪除此房間"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                            
                            {/* Inner room activities */}
                            <div className="p-4 flex-1 space-y-4">
                              {/* For frontline desk, show master controllers optionally */}
                              {(user.role === 'frontdesk' || user.role === 'manager') ? (
                                <div className="space-y-1.5 pb-2 border-b border-stone-100">
                                  <div className="flex items-center justify-between">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">票卷原始總量</div>
                                    <button
                                      type="button"
                                      onClick={() => setEditingQuotaRooms(prev => ({ ...prev, [room.id]: !prev[room.id] }))}
                                      className="text-[9px] font-bold text-[#3A5A40] hover:text-[#1B3022] hover:underline transition-all"
                                    >
                                      {editingQuotaRooms[room.id] ? "隱藏面板 ✕" : "✏️ 修正額度"}
                                    </button>
                                  </div>
                                  
                                  {editingQuotaRooms[room.id] && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                                      {allowedActivities.map(actKey => {
                                        const stats = room.activities[actKey as keyof typeof room.activities] as ActivityCounts;
                                        if (!stats) return null;
                                        const isZero = stats.total === 0;
                                        return (
                                          <div key={actKey} className={`flex items-center justify-between p-1 bg-slate-50 border border-slate-100 rounded text-[10px] ${isZero ? 'opacity-35' : ''}`}>
                                            <div className="flex flex-col text-left">
                                              <span className="font-extrabold text-[#1B3022] leading-tight truncate max-w-[90px]">{ACTIVITY_DICT[actKey]}</span>
                                              <span className="text-[8px] text-slate-400">已核: {stats.consumed}</span>
                                            </div>
                                            <div className="flex items-center border border-[#E5E1D8] bg-white rounded overflow-hidden shrink-0">
                                              <button type="button" onClick={() => handleUpdateTotal(room.id, room, actKey, -1)} className="px-1 py-0.5 hover:bg-slate-50 text-slate-700 text-[9px] font-bold border-r border-[#E5E1D8]">-</button>
                                              <span className="text-[10px] font-mono font-bold w-5 text-center bg-slate-50">{stats.total}</span>
                                              <button type="button" onClick={() => handleUpdateTotal(room.id, room, actKey, 1)} className="px-1 py-0.5 hover:bg-slate-50 text-slate-700 text-[9px] font-bold border-l border-[#E5E1D8]">+</button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              ) : null}

                              {/* Date-specific Timeline */}
                              <div className="space-y-3">
                                <div className="text-[10px] font-bold text-[#3A5A40] uppercase tracking-wider">天數核銷明細</div>
                                {(() => {
                                  const nights = getNightsFromGuestName(room.guestName);
                                  const dates = getStayDaysList(room.checkInDate, nights);
                                  const dailyStates = getRoomDailyActivitiesList(room);
                                  const allowedDailyStates = dailyStates.filter(ds => allowedActivities.includes(ds.activityKey));
                                  const todayStr = new Date().toLocaleDateString('sv'); // yyyy-mm-dd local

                                  const activeDates = dates.filter(date => {
                                    return allowedDailyStates.some(ds => ds.date === date && ds.total > 0);
                                  });

                                  if (activeDates.length === 0) {
                                    return <div className="text-[10px] text-slate-400">當日無項目</div>;
                                  }

                                  return (
                                    <div className="space-y-2.5">
                                      {activeDates.map((date) => {
                                        const dateActivities = allowedDailyStates.filter(ds => ds.date === date && ds.total > 0);
                                        const isToday = date === todayStr;
                                        
                                        return (
                                          <div 
                                            key={date} 
                                            className={`p-2 rounded-lg border text-[11px] ${
                                              isToday 
                                                ? 'border-amber-250 bg-amber-50/10' 
                                                : 'border-slate-100 bg-slate-50/20'
                                            }`}
                                          >
                                            <div className="flex items-center justify-between mb-1.5">
                                              <span className="font-extrabold text-slate-700 flex items-center gap-1">
                                                <span className={`h-1 w-1 rounded-full ${isToday ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'}`}></span>
                                                {formatDateWithDayOfWeek(date)}
                                              </span>
                                              {isToday && (
                                                <span className="px-1 py-0.1 rounded text-[8px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200 animate-pulse">
                                                  今日
                                                </span>
                                              )}
                                            </div>
                                            
                                            <div className="space-y-1">
                                              {dateActivities.map(ds => {
                                                const isDone = ds.consumed >= ds.total;
                                                return (
                                                  <div key={ds.activityKey} className="flex items-center justify-between bg-white p-1.5 rounded border border-slate-100 shadow-3xs">
                                                    <span className="text-[10px] font-bold text-slate-600">
                                                      {ACTIVITY_DICT[ds.activityKey]}
                                                    </span>
                                                    
                                                    <div className="flex items-center space-x-1">
                                                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-50 border border-slate-100 px-1 py-0.1 rounded flex items-baseline gap-0.5 scale-90 origin-right">
                                                        <span className="font-extrabold text-[#1B3022]">{ds.consumed}</span>
                                                        <span>/</span>
                                                        <span>{ds.total}</span>
                                                      </span>
                                                      
                                                      {user.role !== 'frontdesk' && (
                                                        <div className="flex items-center gap-0.5">
                                                          {!isDone && (
                                                            <button
                                                              type="button"
                                                              onClick={() => handleConsume(room.id, ds.activityKey, 1, date)}
                                                              className="rounded bg-[#3A5A40] hover:bg-[#1B3022] text-white px-1.5 py-0.2 text-[10px] font-bold transition-all active:scale-95"
                                                            >
                                                              核銷
                                                            </button>
                                                          )}
                                                          {ds.consumed > 0 && (
                                                            <button
                                                              type="button"
                                                              onClick={() => handleConsume(room.id, ds.activityKey, -1, date)}
                                                              className="rounded bg-red-50 border border-red-100 text-red-650 px-1 py-0.2 text-[10px] font-bold hover:bg-red-100 transition-all active:scale-95"
                                                              title="撤銷"
                                                            >
                                                              撤銷
                                                            </button>
                                                          )}
                                                          {isDone && (
                                                            <span className="text-[9px] font-extrabold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1 py-0.2 rounded">
                                                              已結
                                                            </span>
                                                          )}
                                                        </div>
                                                      )}
                                                      
                                                      {(user.role === 'frontdesk' || user.role === 'manager') && (
                                                        <div className="text-[9px] text-slate-400 font-bold">
                                                          {isDone ? '✓' : `${ds.total - ds.consumed} 份`}
                                                        </div>
                                                      )}
                                                    </div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {Object.keys(groupedRoomsMap).length === 0 && (
              <div className="col-span-full py-16 text-center text-slate-400 bg-white rounded-2xl border-2 border-dashed border-[#E5E1D8]">
                目前沒有任何符合條件的團體紀錄
              </div>
            )}
          </div>
        )}
          </div>

          {/* 右側：今日核銷總覽與詳細名細主管主控台（僅主管巡檢「6666」看見） */}
          {user.role === 'manager' && (
            <div className="xl:col-span-4 bg-white border border-[#E5E1D8] rounded-2xl p-5 shadow-sm space-y-6 sticky top-6">
              <div className="flex items-center justify-between border-b border-stone-150 pb-3">
                <div className="flex items-center space-x-2.5">
                  <div className="bg-[#1B3022] text-white p-2 rounded-xl shadow-xs">
                    <MountainSnow className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-[#1B3022] uppercase tracking-wide">📊 每日核銷進度與明細總覽</h3>
                </div>
              </div>

              {/* Date selection controls */}
              <div className="space-y-3 bg-[#FAF9F5] border border-[#E5E1D8] p-3.5 rounded-xl">
                <div className="flex items-center justify-between gap-1 bg-slate-200/50 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date(selectedDate);
                      d.setDate(d.getDate() - 1);
                      setSelectedDate(d.toLocaleDateString('sv'));
                    }}
                    className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-[#1B3022] rounded text-xs py-1 font-bold transition-all shadow-3xs select-none"
                  >
                    ◀ 前一日
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const tzoffset = (new Date()).getTimezoneOffset() * 60000;
                      setSelectedDate(new Date(Date.now() - tzoffset).toISOString().slice(0, 10));
                    }}
                    className="px-3 py-1 bg-[#1B3022] text-white rounded text-xs font-black transition-all shadow-3xs select-none hover:bg-[#3A5A40]"
                  >
                    今天
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date(selectedDate);
                      d.setDate(d.getDate() + 1);
                      setSelectedDate(d.toLocaleDateString('sv'));
                    }}
                    className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-[#1B3022] rounded text-xs py-1 font-bold transition-all shadow-3xs select-none"
                  >
                    後一日 ▶
                  </button>
                </div>
                
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] font-extrabold text-[#3A5A40] flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>指定核銷日期:</span>
                  </span>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="text-xs font-mono font-bold bg-white border border-[#E5E1D8] rounded-lg px-2.5 py-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#3A5A40]"
                  />
                </div>
              </div>

              {/* Overall progress summary */}
              {(() => {
                const total = deptSummary.grandTotal;
                const consumed = deptSummary.grandConsumed;
                const pct = total > 0 ? Math.round((consumed / total) * 100) : 0;
                return (
                  <div className="bg-[#1B3022]/4 border border-[#1B3022]/10 rounded-xl p-4 space-y-3 shadow-3xs">
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs font-extrabold text-[#1B3022]">本日累計總核銷率</span>
                      <span className="text-xs font-mono font-black text-[#1B3022] bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-100">{pct}%</span>
                    </div>
                    
                    <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                      <div 
                        className="bg-[#3A5A40] h-2.5 rounded-full transition-all duration-500" 
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-1 text-center pt-2 border-t border-slate-200/60">
                      <div className="text-left font-sans">
                        <div className="text-[10px] text-slate-400 font-extrabold">原總配額</div>
                        <div className="text-xs font-mono font-bold text-slate-700">{total} 份</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#3A5A40] font-extrabold">累計核銷</div>
                        <div className="text-xs font-mono font-bold text-[#3A5A40]">{consumed} 份</div>
                      </div>
                      <div className="text-right border-l border-slate-200">
                        <div className="text-[10px] text-amber-600 font-extrabold">尚待核銷</div>
                        <div className="text-xs font-mono font-bold text-amber-700">{total - consumed} 份</div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 各部門分流核銷數據 */}
              <div className="space-y-3 pt-1">
                <span className="text-[11px] font-extrabold text-[#1B3022] uppercase tracking-wider block">🏢 各部門核銷統計</span>
                
                <div className="grid grid-cols-2 gap-2">
                  {deptSummary.departments.map(dept => {
                    const hasActivities = dept.total > 0;
                    const deptPct = dept.total > 0 ? Math.round((dept.consumed / dept.total) * 100) : 0;
                    
                    return (
                      <div key={dept.id} className={`p-2.5 rounded-xl border transition-all text-left flex flex-col justify-between ${
                        hasActivities ? 'bg-white border-[#E5E1D8] shadow-3xs' : 'bg-slate-50 opacity-55'
                      }`}>
                        <div className="flex flex-col mb-1.5">
                          <span className="text-[11px] font-extrabold text-[#1B3022] truncate">{dept.name}</span>
                          <div className="text-xs font-mono font-bold text-slate-650 mt-0.5">
                            {hasActivities ? `${dept.consumed} / ${dept.total}` : '無項目'}
                          </div>
                        </div>
                        
                        {hasActivities && (
                          <div className="space-y-1">
                            <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                              <div 
                                className={`${dept.progressColor} h-1 rounded-full`}
                                style={{ width: `${deptPct}%` }}
                              ></div>
                            </div>
                            <span className="text-[9px] font-extrabold text-[#3A5A40] block text-right mt-0.5">{deptPct}%</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 今日核銷詳細名單明細 */}
              <div className="space-y-2.5 pt-2 border-t border-slate-150">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-[#1B3022] uppercase tracking-wider block">📝 本日已核銷詳細明細 ({detailedConsumptions.length} 筆)</span>
                  {detailedConsumptions.length > 0 && (
                    <span className="text-[9px] font-black text-[#3A5A40] bg-emerald-50 border border-emerald-100 px-1.5 py-0.2 rounded">
                      即時校對中
                    </span>
                  )}
                </div>

                <div className="bg-[#FAF9F5] border border-[#E5E1D8] rounded-xl p-2.5 space-y-2 max-h-[280px] overflow-y-auto">
                  {detailedConsumptions.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 text-xs">
                      <p className="font-semibold text-slate-500">本日尚無任何核銷紀錄</p>
                      <p className="text-[10px] text-slate-400 mt-1">房客前往各部門核銷時將即時顯示於此</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {detailedConsumptions.map((log) => (
                        <div key={log.id} className="flex items-center justify-between text-[11px] bg-white border border-slate-150 rounded-lg p-2 shadow-2xs">
                          <div className="flex flex-col text-left space-y-0.5">
                            <div className="flex items-center space-x-1.5">
                              <span className="font-black text-slate-850 bg-[#3A5A40]/10 border border-[#3A5A40]/25 text-[#1B3022] px-1.5 py-0.2 rounded font-mono text-center">
                                {log.roomNumber} 房
                              </span>
                              <span className="text-[9px] text-slate-400 font-bold whitespace-nowrap">{log.timeStr}</span>
                            </div>
                            <div className="text-[10px] text-slate-500 font-semibold truncate max-w-[130px]">
                              房客: {log.guestName}
                            </div>
                            <div className="text-xs font-extrabold text-slate-750 flex items-center space-x-1 mt-0.5">
                              <span className="text-[#3A5A40]">●</span>
                              <span className="truncate max-w-[135px]">{log.activityName}</span>
                              <span className="text-[#3A5A40] ml-1 font-black bg-emerald-50 text-emerald-800 px-1 rounded">+{log.count}</span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              triggerConfirm(
                                '確認是否撤銷此筆核銷紀錄？',
                                `確定要取消房號 ${log.roomNumber} 在本日核銷的「${log.activityName}」共 ${log.count} 份嗎？`,
                                () => {
                                  handleConsume(log.roomId, log.activityKey, -log.count, selectedDate);
                                }
                              );
                            }}
                            className="hover:bg-red-50 hover:text-red-600 text-slate-400 p-1.5 rounded-md transition-colors border border-transparent hover:border-red-100 mt-auto"
                            title="點擊撤銷此筆核銷嗎？"
                          >
                            <Undo2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 異常警告與貼心營運提醒 */}
              <div className="space-y-2.5 pt-2 border-t border-slate-150">
                <span className="text-[11px] font-extrabold text-amber-800 uppercase tracking-wider block">⚠️ 本日營運提醒與警告通知</span>
                
                <div className="space-y-2">
                  {/* 1. Vegetarian Meals Today stats */}
                  {vegetarianSummary.totalVegCount > 0 && (
                    <div className="bg-emerald-50/50 border border-emerald-150 rounded-xl p-2.5 flex items-start gap-2 text-[11px]">
                      <span className="text-emerald-700 text-xs shrink-0 font-bold">🍏</span>
                      <div className="text-left">
                        <p className="font-extrabold text-emerald-850">今日素食統計（重要餐點）：</p>
                        <p className="text-slate-600 mt-0.5 font-medium leading-relaxed">
                          今日預計供應素食共 <strong className="text-emerald-800 font-black">{vegetarianSummary.totalVegCount} 份</strong>。
                          包含房號：<span className="p-0.5 font-mono font-bold bg-white border border-slate-150 rounded text-[10px]">{vegetarianSummary.vegRooms.join(', ')}</span>，請廚房提早備料。
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 2. Custom Remarks list */}
                  {roomsWithNotes.length > 0 && (
                    <div className="bg-amber-50/40 border border-amber-200 rounded-xl p-2.5 flex items-start gap-2 text-[11px]">
                      <span className="text-amber-600 text-xs shrink-0 font-bold">✏️</span>
                      <div className="text-left">
                        <p className="font-extrabold text-amber-850">房客特殊備註彙整 ({roomsWithNotes.length} 房)：</p>
                        <div className="space-y-1.5 mt-1">
                          {roomsWithNotes.map(r => (
                            <div key={r.id} className="text-[10px] text-stone-705 bg-white border border-stone-200/50 p-1 rounded">
                              <span className="font-bold text-slate-850 border-r border-[#E5E1D8] pr-1.5 mr-1.5">{r.roomNumber}房</span>
                              <span className="italic font-bold text-stone-600">{r.notes}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 3. Checkout unused warning (Abnormalities/Warnings) */}
                  {checkoutWarnings.length > 0 ? (
                    <div className="bg-red-50/50 border border-red-200/80 rounded-xl p-2.5 flex items-start gap-2 text-[11px]">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                      <div className="text-left">
                        <p className="font-extrabold text-red-800">今日退房未用畢活動提醒 ({checkoutWarnings.length} 房)：</p>
                        <p className="text-[10px] text-slate-500 font-semibold mb-1">
                          以下客房今日退房，但仍有配額尚未經任何部門核銷完畢，櫃檯可於結帳退房時提醒與確認：
                        </p>
                        <div className="space-y-1 bg-white border border-red-100 p-1.5 rounded-lg max-h-[140px] overflow-y-auto w-full">
                          {checkoutWarnings.map(c => (
                            <div key={c.roomNumber} className="text-[10px] text-slate-700 border-b border-stone-100 last:border-b-0 pb-1 mb-1 last:mb-0 last:pb-0">
                              <div className="font-black text-red-700 flex justify-between items-baseline">
                                <span>🚪 {c.roomNumber} 房 ({c.guestName.split(' ')[0]})</span>
                                <span className="text-[9px] bg-red-100 px-1 py-0.2 rounded font-extrabold text-red-650">剩 {c.unusedCount} 份</span>
                              </div>
                              <div className="text-[9px] text-slate-400 font-semibold mt-0.5 leading-tight">
                                {c.items.join(' / ')}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-55 border border-slate-150 rounded-xl p-2 flex items-center justify-center gap-1.5 py-3 text-[10px] text-slate-400 font-black">
                      <span>✓ 本日退房房客之活動進度皆已結清</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Custom Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-2xs">
          <div className="bg-white border-2 border-stone-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center space-x-3 text-amber-600">
              <div className="bg-amber-100 p-2.5 rounded-full shrink-0">
                <AlertTriangle className="w-6 h-6 text-amber-700" />
              </div>
              <h3 className="text-base font-black text-slate-850">{confirmModal.title || '系統確認'}</h3>
            </div>
            
            <p className="text-sm font-semibold text-slate-600 whitespace-pre-wrap leading-relaxed text-left">
              {confirmModal.message}
            </p>
            
            <div className="flex justify-end items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  if (confirmModal.onCancel) confirmModal.onCancel();
                  setConfirmModal(null);
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmModal.onConfirm();
                  setConfirmModal(null);
                }}
                className="px-4 py-2 bg-red-650 hover:bg-red-750 text-white font-black rounded-xl text-xs transition-all cursor-pointer shadow-3xs"
              >
                確認執行
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Alert Modal */}
      {alertModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/65 p-4 backdrop-blur-2xs">
          <div className="bg-white border-2 border-red-250 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center space-x-3 text-red-600">
              <div className="bg-red-50 p-2.5 rounded-full shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600 animate-pulse" />
              </div>
              <h3 className="text-sm font-black text-red-800">{alertModal.title || '系統提示'}</h3>
            </div>
            
            <p className="text-xs font-bold text-slate-600 leading-relaxed whitespace-pre-wrap text-left">
              {alertModal.message}
            </p>
            
            <div className="flex justify-end items-center pt-2">
              <button
                type="button"
                onClick={() => setAlertModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-black rounded-xl text-xs transition-all cursor-pointer"
              >
                確 定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Status Bar */}
      <footer className="flex h-10 items-center justify-between bg-white px-8 text-[10px] uppercase tracking-tighter text-slate-400 border-t border-[#E5E1D8] mt-auto">
        <div className="flex gap-4">
          <span>資料庫狀態：連線中</span>
        </div>
        <div>© {new Date().getFullYear()} 雪霸農場活動管理系統</div>
      </footer>
    </div>
  );
}

