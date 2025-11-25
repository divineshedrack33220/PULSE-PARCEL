require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs').promises;
const jwt = require('jsonwebtoken');
const multer = require('multer');

// CLOUDINARY
require('./config/cloudinary');

// WEB-PUSH
const webpush = require('web-push');

// DB & Models
const connectDB = require('./config/db');
let User, Chat;

const errorHandler = require('./middleware/errorHandler');
const auth = require('./middleware/auth');

// Routes
const userRoutes = require('./routes/userRoutes');
const productRoutes = require('./routes/productRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const orderRoutes = require('./routes/orderRoutes');
const chatRoutes = require('./routes/chatRoutes');
const publicRoutes = require('./routes/publicRoutes');
const cartRoutes = require('./routes/cartRoutes');
const authRoutes = require('./routes/authRoutes');
const addressRoutes = require('./routes/addressRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const checkoutRoutes = require('./routes/checkoutRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const visitorRoutes = require('./routes/visitorRoutes');
const adRoutes = require('./routes/adRoutes');
const locationRoutes = require('./routes/locationRoutes');
const customerRoutes = require('./routes/customerRoutes');
const uploadRoutes = require('./routes/uploadRoutes');

// Multer config
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 5, fields: 10 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  },
});

// Create folders
Promise.all([
  fs.mkdir(path.join(__dirname, 'Uploads'), { recursive: true }).catch(() => {}),
  fs.mkdir(path.join(__dirname, 'public', 'images'), { recursive: true }).catch(() => {}),
]);

const app = express();
const server = http.createServer(app);

// --- Socket.IO ---
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5000', 'https://pulse-parcel.onrender.com'],
    credentials: true,
  },
});
app.set('io', io);

// Online users map
const onlineUsers = new Map();
app.set('onlineUsers', onlineUsers);

// CORS & logging
app.use(cors({ origin: ['http://localhost:5000', 'https://pulse-parcel.onrender.com'], credentials: true }));
app.use((req, _, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Static folders
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use('/Uploads', express.static(path.join(__dirname, 'Uploads')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/admin/static', express.static(path.join(__dirname, 'admin/static')));
app.use(express.static(path.join(__dirname, 'public')));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API routes
app.use('/api/users', auth, userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders', auth, orderRoutes);
app.use('/api/chats', auth, chatRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/carts', auth, cartRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/addresses', auth, addressRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/checkout', auth, checkoutRoutes);
app.use('/api/wishlist', auth, wishlistRoutes);
app.use('/api/visitors', auth, visitorRoutes);
app.use('/api/ads', adRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/customers', auth, customerRoutes);
app.use('/api/upload', auth, uploadRoutes);

// Connect to DB and load models
connectDB()
  .then(async () => {
    User = require('./models/User');
    const chatModels = require('./models/Chat');
    Chat = chatModels.Chat;

    webpush.setVapidDetails(
      'mailto:support@bazukastore.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    console.log('Web-push configured');
  })
  .catch(err => {
    console.error('DB connection failed:', err);
    process.exit(1);
  });

// --- Socket.IO authentication ---
io.use((socket, next) => {
  const token = socket.handshake.auth.token?.replace('Bearer ', '');
  if (!token) return next(new Error('No token'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = { id: decoded.id, name: decoded.name || 'User' };
    next();
  } catch (e) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log(`[SOCKET] Connected ${socket.id} | User ${socket.user.id}`);
  onlineUsers.set(socket.user.id, socket.id);

  socket.on('disconnect', () => {
    onlineUsers.forEach((sid, userId) => {
      if (sid === socket.id) onlineUsers.delete(userId);
    });
    console.log(`[SOCKET] Disconnected ${socket.id}`);
  });
});

// Visitor location notifications
app.use(async (req, res, next) => {
  if (req.originalUrl.startsWith('/api/locations')) return next();
  next();
  try {
    const VisitorLocation = require('./models/VisitorLocation');
    const latest = await VisitorLocation.findOne().sort({ timestamp: -1 }).lean();
    if (latest && io) io.to('adminRoom').emit('newVisitor', latest);
  } catch {}
});

// Fallback routes
app.get('/service-worker.js', (_, res) => res.status(404).send('Not found'));
app.get('/images/:filename', async (req, res) => {
  const filePath = path.join(__dirname, 'public', 'images', req.params.filename);
  try { await fs.access(filePath); res.sendFile(filePath); }
  catch { res.redirect('https://placehold.co/600x400?text=No+Image'); }
});

const serve = file => (_, res) => res.sendFile(path.join(__dirname, 'public', file));
app.get('/', serve('index.html'));
app.get('/categories.html', serve('categories.html'));
app.get('/track-order.html', auth, serve('track-order.html'));
app.get('/request.html', serve('request.html'));
app.get('/request-details.html', serve('request-details.html'));
app.get('/orders.html', auth, (req, res) => {
  if (!req.user?.isAdmin) return res.status(403).json({ message: 'Admin only' });
  res.sendFile(path.join(__dirname, 'public', 'orders.html'));
});
app.get('/admin', auth, (req, res) => {
  if (!req.user?.isAdmin) return res.status(403).json({ message: 'Admin only' });
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});
['sales-orders.html', 'products.html', 'customers.html'].forEach(f =>
  app.get(`/admin/${f}`, auth, (req, res) => {
    if (!req.user?.isAdmin) return res.status(403).json({ message: 'Admin only' });
    res.sendFile(path.join(__dirname, 'admin', f));
  })
);

// Error handling
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on :${PORT}`);
  console.log(`Visit: http://localhost:${PORT}`);
});
