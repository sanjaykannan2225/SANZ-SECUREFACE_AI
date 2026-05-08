// ============================================================
// Sanz SecureFace AI — Main Server
// Node.js + Express | JSON Storage | Role-Based Auth
// ============================================================

const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const app = express();
const PORT = 3000;

// ── Middleware ──────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../public')));
app.use('/models', express.static(path.join(__dirname, '../models')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use(session({
  secret: 'sanz-secureface-ai-2024-ultra-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// ── File Upload Config ──────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
const dir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '_' + file.originalname);
  }
});
const upload = multer({ storage });

// ── DB Helpers ──────────────────────────────────────────────
const DB = {
USERS: path.join(__dirname, '../users.json'),
ATTENDANCE: path.join(__dirname, '../attendance.json'),
ALERTS: path.join(__dirname, '../alerts.json'),

  read(file) {
    try {
      if (!fs.existsSync(file)) return [];
      const data = fs.readFileSync(file, 'utf8');
      return JSON.parse(data || '[]');
    } catch { return []; }
  },

  write(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }
};

// ── Seed default admin if no users exist ───────────────────
(function seedDefaults() {
  const users = DB.read(DB.USERS);
  if (!users.length) {
    DB.write(DB.USERS, [
      {
        id: 'admin001',
        name: 'System Admin',
        email: 'admin@sanz.ai',
        password: 'admin123',
        role: 'admin',
        department: 'Administration',
        avatar: null,
        faceDescriptor: null,
        createdAt: new Date().toISOString()
      },
      {
        id: 'mentor001',
        name: 'Dr. Ramesh Kumar',
        email: 'mentor@sanz.ai',
        password: 'mentor123',
        role: 'mentor',
        department: 'Computer Science',
        avatar: null,
        faceDescriptor: null,
        assignedStudents: [],
        createdAt: new Date().toISOString()
      },
      {
        id: 'student001',
        name: 'Arjun Sharma',
        email: 'student@sanz.ai',
        password: 'student123',
        role: 'student',
        department: 'Computer Science',
        rollNo: 'CS2024001',
        avatar: null,
        faceDescriptor: null,
        mentorId: 'mentor001',
        createdAt: new Date().toISOString()
      }
    ]);
  }
  if (!fs.existsSync(DB.ATTENDANCE)) DB.write(DB.ATTENDANCE, []);
  if (!fs.existsSync(DB.ALERTS)) DB.write(DB.ALERTS, []);
})();

// ── Auth Middleware ─────────────────────────────────────────
function requireAuth(role) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (role && req.session.user.role !== role && req.session.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    next();
  };
}

// ══════════════════════════════════════════════════════════════
// AUTH ROUTES
// ══════════════════════════════════════════════════════════════

// POST /api/auth/login
app.post('/api/auth/login', (req, res) => {
  const { email, password, role } = req.body;
  const users = DB.read(DB.USERS);
  const user = users.find(u =>
    u.email === email && u.password === password && u.role === role
  );
  if (!user) {
    return res.json({ success: false, message: 'Invalid credentials or role mismatch' });
  }
  const { password: _, faceDescriptor, ...safeUser } = user;
  req.session.user = safeUser;
  res.json({ success: true, user: safeUser });
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// GET /api/auth/me
app.get('/api/auth/me', (req, res) => {
  if (!req.session.user) return res.json({ success: false });
  res.json({ success: true, user: req.session.user });
});

// ══════════════════════════════════════════════════════════════
// USER ROUTES
// ══════════════════════════════════════════════════════════════

// GET all users (admin)
app.get('/api/users', requireAuth('admin'), (req, res) => {
  const users = DB.read(DB.USERS).map(u => {
    const { password, faceDescriptor, ...safe } = u;
    return safe;
  });
  res.json({ success: true, users });
});

// GET students only
app.get('/api/users/students', requireAuth(), (req, res) => {
  const users = DB.read(DB.USERS);
  let students = users.filter(u => u.role === 'student');
  // Mentors only see assigned students
  if (req.session.user.role === 'mentor') {
    const mentor = users.find(u => u.id === req.session.user.id);
    students = students.filter(u => mentor?.assignedStudents?.includes(u.id));
  }
  res.json({ success: true, students: students.map(s => { const {password,faceDescriptor,...safe}=s; return safe; }) });
});

// GET mentors only
app.get('/api/users/mentors', requireAuth('admin'), (req, res) => {
  const users = DB.read(DB.USERS);
  const mentors = users.filter(u => u.role === 'mentor').map(m => { const {password,faceDescriptor,...safe}=m; return safe; });
  res.json({ success: true, mentors });
});

// POST create user
app.post('/api/users', upload.single('photo'), (req, res) => {
  const users = DB.read(DB.USERS);
  const { name, email, password, role, department, rollNo, mentorId } = req.body;
  if (users.find(u => u.email === email)) {
    return res.json({ success: false, message: 'Email already exists' });
  }
  const newUser = {
    id: role.charAt(0) + Date.now(),
    name, email, password, role, department,
    rollNo: rollNo || null,
    mentorId: mentorId || null,
    avatar: req.file ? '/uploads/' + req.file.filename : null,
    faceDescriptor: null,
    assignedStudents: role === 'mentor' ? [] : undefined,
    createdAt: new Date().toISOString()
  };
  users.push(newUser);
  DB.write(DB.USERS, users);
  // If student, add to mentor's list
  if (role === 'student' && mentorId) {
    const mIdx = users.findIndex(u => u.id === mentorId);
    if (mIdx > -1) {
      users[mIdx].assignedStudents = users[mIdx].assignedStudents || [];
      users[mIdx].assignedStudents.push(newUser.id);
      DB.write(DB.USERS, users);
    }
  }
  const {password:_, faceDescriptor, ...safe} = newUser;
  res.json({ success: true, user: safe });
});

// PUT update user
app.put('/api/users/:id', requireAuth('admin'), (req, res) => {
  const users = DB.read(DB.USERS);
  const idx = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.json({ success: false, message: 'User not found' });
  const { password, faceDescriptor, ...updates } = req.body;
  users[idx] = { ...users[idx], ...updates };
  if (password) users[idx].password = password;
  DB.write(DB.USERS, users);
  res.json({ success: true });
});

// DELETE user
app.delete('/api/users/:id', requireAuth('admin'), (req, res) => {
  let users = DB.read(DB.USERS);
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.json({ success: false, message: 'User not found' });
  if (user.role === 'admin') return res.json({ success: false, message: 'Cannot delete admin' });
  users = users.filter(u => u.id !== req.params.id);
  DB.write(DB.USERS, users);
  res.json({ success: true });
});

// POST save face descriptor
app.post('/api/users/:id/face', (req, res) => {
  const users = DB.read(DB.USERS);
  const idx = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.json({ success: false });
  users[idx].faceDescriptor = req.body.descriptor;
  DB.write(DB.USERS, users);
  res.json({ success: true });
});

// GET face descriptors for recognition
app.get('/api/faces', (req, res) => {
  const users = DB.read(DB.USERS);
  const faces = users
    .filter(u => u.faceDescriptor)
    .map(u => ({ id: u.id, name: u.name, role: u.role, descriptor: u.faceDescriptor }));
  res.json({ success: true, faces });
});

// ══════════════════════════════════════════════════════════════
// ATTENDANCE ROUTES
// ══════════════════════════════════════════════════════════════

// GET attendance records
app.get('/api/attendance', requireAuth(), (req, res) => {
  let records = DB.read(DB.ATTENDANCE);
  const { date, userId, role } = req.query;
  if (date) records = records.filter(r => r.date === date);
  if (userId) records = records.filter(r => r.userId === userId);
  // Students only see their own
  if (req.session.user.role === 'student') {
    records = records.filter(r => r.userId === req.session.user.id);
  }
  // Mentors see only their students
  if (req.session.user.role === 'mentor') {
    const users = DB.read(DB.USERS);
    const mentor = users.find(u => u.id === req.session.user.id);
    const assigned = mentor?.assignedStudents || [];
    records = records.filter(r => assigned.includes(r.userId));
  }
  res.json({ success: true, records });
});

// POST mark attendance (from face scan)
app.post('/api/attendance', (req, res) => {
  const { userId, name, confidence, method } = req.body;
  const records = DB.read(DB.ATTENDANCE);
  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toLocaleTimeString('en-IN', { hour12: false });

  // Prevent duplicate attendance same day
  const existing = records.find(r => r.userId === userId && r.date === today);
  if (existing) {
    return res.json({ success: false, message: 'Attendance already marked today', existing });
  }

  const record = {
    id: 'att' + Date.now(),
    userId,
    name,
    date: today,
    time: now,
    confidence: confidence || 100,
    method: method || 'face-scan',
    status: 'present',
    markedAt: new Date().toISOString()
  };
  records.push(record);
  DB.write(DB.ATTENDANCE, records);
  res.json({ success: true, record });
});

// GET attendance stats
app.get('/api/attendance/stats', requireAuth(), (req, res) => {
  const records = DB.read(DB.ATTENDANCE);
  const users = DB.read(DB.USERS);
  const today = new Date().toISOString().split('T')[0];
  const students = users.filter(u => u.role === 'student');
  const todayRecords = records.filter(r => r.date === today);

  res.json({
    success: true,
    stats: {
      totalStudents: students.length,
      totalMentors: users.filter(u => u.role === 'mentor').length,
      presentToday: todayRecords.length,
      absentToday: students.length - todayRecords.length,
      totalRecords: records.length,
      avgConfidence: todayRecords.length
        ? Math.round(todayRecords.reduce((a, b) => a + (b.confidence || 0), 0) / todayRecords.length)
        : 0
    }
  });
});

// GET weekly attendance data for chart
app.get('/api/attendance/weekly', requireAuth(), (req, res) => {
  const records = DB.read(DB.ATTENDANCE);
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    days.push({
      date: dateStr,
      label: d.toLocaleDateString('en-IN', { weekday: 'short' }),
      count: records.filter(r => r.date === dateStr).length
    });
  }
  res.json({ success: true, weekly: days });
});

// ══════════════════════════════════════════════════════════════
// ALERT ROUTES (Unknown Faces)
// ══════════════════════════════════════════════════════════════

app.post('/api/alerts', (req, res) => {
  const alerts = DB.read(DB.ALERTS);
  const alert = {
    id: 'alert' + Date.now(),
    type: 'unknown_face',
    timestamp: new Date().toISOString(),
    snapshot: req.body.snapshot || null,
    confidence: req.body.confidence || 0
  };
  alerts.unshift(alert);
  // Keep only last 50
  if (alerts.length > 50) alerts.length = 50;
  DB.write(DB.ALERTS, alerts);
  res.json({ success: true, alert });
});

app.get('/api/alerts', requireAuth('admin'), (req, res) => {
  const alerts = DB.read(DB.ALERTS);
  res.json({ success: true, alerts: alerts.slice(0, 20) });
});

// ══════════════════════════════════════════════════════════════
// EXPORT ROUTES
// ══════════════════════════════════════════════════════════════

app.get('/api/export/attendance', requireAuth(), (req, res) => {
  let records = DB.read(DB.ATTENDANCE);
  const users = DB.read(DB.USERS);
  if (req.session.user.role === 'student') {
    records = records.filter(r => r.userId === req.session.user.id);
  }
  const csv = [
    'Name,Date,Time,Confidence,Method,Status',
    ...records.map(r => `${r.name},${r.date},${r.time},${r.confidence}%,${r.method},${r.status}`)
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="attendance_report.csv"');
  res.send(csv);
});

// ── Serve HTML Pages ────────────────────────────────────────
app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, '../public/index.html'))
);
app.get('/index.html', (req, res) =>
  res.sendFile(path.join(__dirname, '../public/index.html'))
);
app.get('/login', (req, res) =>
  res.sendFile(path.join(__dirname, '../public/login.html'))
);

app.get('/register', (req, res) =>
  res.sendFile(path.join(__dirname, '../public/register.html'))
);

app.get('/dashboard', (req, res) =>
  res.sendFile(path.join(__dirname, '../public/dashboard.html'))
);

app.get('/scan', (req, res) =>
  res.sendFile(path.join(__dirname, '../public/scan.html'))
);

app.get('/about.html', (req, res) =>
  res.sendFile(path.join(__dirname, '../public/about.html'))
);

app.get('/features.html', (req, res) =>
  res.sendFile(path.join(__dirname, '../public/features.html'))
);

app.get('/user-guide.html', (req, res) =>
  res.sendFile(path.join(__dirname, '../public/user-guide.html'))
);

app.post('/api/attendance/clear', (req, res) => {

  fs.writeFileSync(
    path.join(__dirname, '../attendance.json'),
    JSON.stringify([], null, 2)
  );

  res.json({
    success: true,
    message: 'Attendance cleared successfully'
  });

});
// ── Start ───────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Sanz SecureFace AI running at http://localhost:${PORT}`);
  console.log(`   Admin:   admin@sanz.ai   / admin123`);
  console.log(`   Mentor:  mentor@sanz.ai  / mentor123`);
  console.log(`   Student: student@sanz.ai / student123\n`);
});