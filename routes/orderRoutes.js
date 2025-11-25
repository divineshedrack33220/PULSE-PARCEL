const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const auth = require('../middleware/auth');
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and PDFs are allowed.'));
    }
  },
});

// Upload payment proof
router.post('/upload-proof', auth, upload.single('proof'), orderController.uploadPaymentProof);

// Create order
router.post('/', auth, orderController.createOrder);

// Get all orders
router.get('/', auth, orderController.getOrders);

// Sales metrics
router.get('/sales', auth, orderController.getSalesMetrics);

// Export orders CSV
router.get('/export', auth, orderController.exportOrders);

// Track order by orderNumber
router.get('/track', auth, orderController.trackOrder);

// --- SPECIAL ROUTES ---
// e.g., bank-details endpoint
router.get('/bank-details', auth, orderController.getBankDetails);

// Update order status
router.patch('/:id', auth, orderController.updateOrderStatus);

// Get order by ID (after special routes!)
router.get('/:id', auth, orderController.getOrder);

module.exports = router;
