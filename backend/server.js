const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Ensure data files and folders exist
const UPLOADS_DIR = path.join(__dirname, '../public/uploads');
const USERS_FILE = path.join(__dirname, 'users.json');
const ATTENDANCE_FILE = path.join(__dirname, 'attendance.json');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([]));
if (!fs.existsSync(ATTENDANCE_FILE)) fs.writeFileSync(ATTENDANCE_FILE, JSON.stringify([]));

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Helper functions
const readUsers = () => JSON.parse(fs.readFileSync(USERS_FILE));
const writeUsers = (data) => fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
const readAttendance = () => JSON.parse(fs.readFileSync(ATTENDANCE_FILE));
const writeAttendance = (data) => fs.writeFileSync(ATTENDANCE_FILE, JSON.stringify(data, null, 2));

// ─── ROUTES ───────────────────────────────────────────────

// Register user
app.post('/api/register', upload.single('image'), (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !req.file) return res.status(400).json({ error: 'Name and image required' });

    const users = readUsers();
    const existing = users.find(u => u.name.toLowerCase() === name.toLowerCase());
    if (existing) return res.status(409).json({ error: 'User already registered' });

    const newUser = {
      id: Date.now().toString(),
      name: name.trim(),
      image: `/uploads/${req.file.filename}`,
registeredAt: new Date().toLocaleString('en-IN', {
  timeZone: 'Asia/Kolkata'
})
    };

    users.push(newUser);
    writeUsers(users);

    console.log(`✅ Registered: ${name}`);
    res.json({ success: true, user: newUser });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Get all users
app.get('/api/users', (req, res) => {
  try {
    const users = readUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Delete user
app.delete('/api/users/:id', (req, res) => {
  try {
    let users = readUsers();
    const user = users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Delete image file
    const imgPath = path.join(__dirname, '../public', user.image);
    if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);

    users = users.filter(u => u.id !== req.params.id);
    writeUsers(users);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// Mark attendance
app.post('/api/attendance', (req, res) => {
  try {
    const { name, matchType } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    const attendance = readAttendance();
const now = new Date();

const today = now.toLocaleDateString('en-CA', {
  timeZone: 'Asia/Kolkata'
});

const time = now.toLocaleTimeString('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour12: false
});

    // Check if already marked today
    const alreadyMarked = attendance.find(a => a.name === name && a.date === today);
    if (alreadyMarked) {
      return res.json({ success: false, message: 'Already marked today', duplicate: true });
    }

    const record = {
      id: Date.now().toString(),
      name,
      date: today,
      time,
      matchType: matchType || 'Exact Match',
      timestamp: now.toISOString()
    };

    attendance.push(record);
    writeAttendance(attendance);

    console.log(`📋 Attendance: ${name} at ${time}`);
    res.json({ success: true, record });
  } catch (err) {
    console.error('Attendance error:', err);
    res.status(500).json({ error: 'Attendance marking failed' });
  }
});

// Get attendance
app.get('/api/attendance', (req, res) => {
  try {
    const attendance = readAttendance();
    const { date, name } = req.query;

    let filtered = attendance;
    if (date) filtered = filtered.filter(a => a.date === date);
    if (name) filtered = filtered.filter(a => a.name.toLowerCase().includes(name.toLowerCase()));

    res.json(filtered.reverse());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

// Clear attendance
app.delete('/api/attendance/clear', (req, res) => {
  try {
    writeAttendance([]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear attendance' });
  }
});

// Dashboard stats
app.get('/api/dashboard', (req, res) => {
  try {
    const users = readUsers();
    const attendance = readAttendance();
    const today = new Date().toISOString().split('T')[0];
    const todayAttendance = attendance.filter(a => a.date === today);

    // Weekly stats
    const weekStats = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const count = attendance.filter(a => a.date === dateStr).length;
      weekStats.push({ date: dateStr, count });
    }

    res.json({
      totalUsers: users.length,
      todayCount: todayAttendance.length,
      totalRecords: attendance.length,
      weekStats,
      recentAttendance: attendance.slice(-10).reverse()
    });
  } catch (err) {
    res.status(500).json({ error: 'Dashboard failed' });
  }
});

// Export attendance as CSV
app.get('/api/export', (req, res) => {
  try {
    const attendance = readAttendance();
    let csv = 'Name,Date,Time,Match Type\n';
    attendance.forEach(a => {
      csv += `"${a.name}","${a.date}","${a.time}","${a.matchType}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=attendance.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Export failed' });
  }
});

// LOGIN API

app.post("/login", (req, res) => {

const { username, password } = req.body;

if (
username === "Admin" &&
password === "sanz@2026"
) {

res.json({
success: true
});

} else {

res.json({
success: false
});

}

});

// Serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Sanz SecureFace AI running at http://localhost:${PORT}`);
});
