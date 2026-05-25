import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs/promises";

// Define the shape of our data
interface ActivityCounts {
  total: number;
  consumed: number;
}

interface ConsumptionLog {
  id: string;
  activityKey: string;
  date: string;
  count: number;
  consumedAt: string;
}

interface RoomRecord {
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

const DATA_FILE = path.join(process.cwd(), 'data.json');

// Initial prototype data fallback
const defaultRooms: RoomRecord[] = [
  {
    id: "1",
    roomNumber: "A101",
    guestName: "王大明",
    groupType: "none",
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
  },
  {
    id: "2",
    roomNumber: "B205",
    guestName: "陳小華",
    groupType: "none",
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
  },
];

let rooms: RoomRecord[] = [];

async function loadData() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf-8');
    rooms = JSON.parse(data);
    // Migration: make sure older records in data.json get the new activity placeholders
    let updated = false;
    rooms.forEach(r => {
      if (!r.activities.chineseBreakfast) { r.activities.chineseBreakfast = { total: 0, consumed: 0 }; updated = true; }
      if (!r.activities.chineseLunchSecondDay) { r.activities.chineseLunchSecondDay = { total: 0, consumed: 0 }; updated = true; }
      if (!r.activities.chineseDinner) { r.activities.chineseDinner = { total: 0, consumed: 0 }; updated = true; }
      if (!r.groupType) { r.groupType = 'none'; updated = true; }
    });
    if (updated) {
      await saveData();
    }
  } catch (err) {
    rooms = defaultRooms;
    await saveData();
  }
}

async function saveData() {
  await fs.writeFile(DATA_FILE, JSON.stringify(rooms, null, 2), 'utf-8');
}

async function startServer() {
  await loadData();
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Get all rooms
  app.get("/api/rooms", (req, res) => {
    res.json(rooms);
  });

  // Add a new room (Front desk only)
  app.post("/api/rooms", async (req, res) => {
    const { roomNumber, guestName, groupType, tourLeaderName, tourLeaderPhone, isSaturday, checkInDate, notes, vegetarianCount, activities } = req.body;
    const newRoom: RoomRecord = {
      id: Date.now().toString(),
      roomNumber,
      guestName: guestName || "無名氏",
      checkInDate,
      groupType: groupType || "none",
      tourLeaderName,
      tourLeaderPhone,
      isSaturday,
      vegetarianCount: typeof vegetarianCount === 'number' ? vegetarianCount : 0,
      notes: notes || "",
      activities: activities || {
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
    await saveData();
    res.json(newRoom);
  });

  // Consume (write-off) or reverse an activity on a specific date
  app.put("/api/rooms/:id/consume", async (req, res) => {
    const { id } = req.params;
    const { activityKey, amount, date } = req.body;

    const roomIndex = rooms.findIndex((r) => r.id === id);
    if (roomIndex === -1) {
      return res.status(404).json({ error: "Room not found" });
    }

    const room = rooms[roomIndex];
    if (!room.consumptions) {
      room.consumptions = [];
    }

    if (room.activities[activityKey as keyof typeof room.activities]) {
      const act = room.activities[activityKey as keyof typeof room.activities];
      const targetDate = date || new Date().toISOString().slice(0, 10);
      
      if (amount > 0) {
        // Checking total limit
        if (act.consumed + amount <= act.total) {
          act.consumed += amount;
          room.consumptions.push({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
            activityKey,
            date: targetDate,
            count: amount,
            consumedAt: new Date().toISOString()
          });
        } else {
          return res.status(400).json({ error: "超過可核銷總額數量 (Exceeds total)" });
        }
      } else if (amount < 0) {
        // Reversal/Cancellation
        if (act.consumed > 0) {
          act.consumed = Math.max(0, act.consumed + amount);
          
          // Find the latest consumption log for this activity on this date
          const logIndex = room.consumptions.reduce((lastIdx, c, idx) => {
            return (c.activityKey === activityKey && c.date === targetDate) ? idx : lastIdx;
          }, -1);
          
          if (logIndex !== -1) {
            room.consumptions.splice(logIndex, 1);
          }
        } else {
          return res.status(400).json({ error: "無已核銷項目可取消" });
        }
      }
    }

    await saveData();
    res.json(room);
  });

  // Edit room details (Front desk only)
  app.put("/api/rooms/:id", async (req, res) => {
    const { id } = req.params;
    const updateData = req.body; // Full partial updates including activity counts

    const roomIndex = rooms.findIndex((r) => r.id === id);
    if (roomIndex === -1) {
      return res.status(404).json({ error: "Room not found" });
    }

    rooms[roomIndex] = { ...rooms[roomIndex], ...updateData };
    await saveData();
    res.json(rooms[roomIndex]);
  });

  // Delete a room if needed
  app.delete("/api/rooms/:id", async (req, res) => {
    const { id } = req.params;
    rooms = rooms.filter((r) => r.id !== id);
    await saveData();
    res.json({ success: true });
  });

  // Auth/Login pseudo-endpoint
  app.post("/api/auth/login", (req, res) => {
    const { password } = req.body;
    let role = "";
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
        return res.status(401).json({ error: "密碼錯誤 (Invalid password)" });
    }

    res.json({ token: role, user: { role, name } });
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
