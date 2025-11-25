const Order = require('../models/Order');
const User = require('../models/User');
const Cart = require('../models/Cart'); // Assuming a Cart model exists
const { Parser } = require('json2csv');
const cloudinary = require('../utils/cloudinary.js');

// Upload payment proof
exports.uploadPaymentProof = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: 'payment-proofs', resource_type: 'auto' },
        (error, result) => {
          if (error) reject(new Error(`Cloudinary upload failed: ${error.message}`));
          else resolve(result);
        }
      ).end(req.file.buffer);
    });

    res.status(200).json({ url: result.secure_url });
  } catch (error) {
    console.error('Error uploading payment proof:', error);
    res.status(400).json({ message: error.message });
  }
};

// Create order
exports.createOrder = async (req, res) => {
  try {
    const { addressId, paymentMethod, orderNotes, paymentProof } = req.body;
    const user = req.user;

    if (paymentMethod !== 'Bank Transfer') {
      return res.status(400).json({ message: 'Only Bank Transfer is supported' });
    }

    const cart = await Cart.findOne({ user: user._id }).populate('items.product');
    if (!cart || cart.items.length === 0) return res.status(400).json({ message: 'Cart is empty' });

    const items = cart.items.map(item => ({
      product: item.product._id,
      quantity: item.quantity,
      price: item.product.price,
    }));

    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const deliveryFee = 5000;
    const total = subtotal + deliveryFee;

    const order = new Order({
      user: user._id,
      addressId,
      items,
      subtotal,
      deliveryFee,
      total,
      paymentMethod,
      paymentProof,
      orderNotes,
      tracking: [{ status: 'Placed' }],
      paymentStatus: 'pending',
    });

    await order.save();
    await Cart.deleteOne({ user: user._id });

    // Emit events
    const io = req.app.get('io');
    io.to('adminRoom').emit('newOrder', { _id: order._id, orderNumber: order.orderNumber, user: { name: user.name }, total: order.total, status: order.status, paymentProof: order.paymentProof, createdAt: order.createdAt });
    io.to(`user_${user._id}`).emit('orderStatusUpdate', order);

    res.status(201).json(order);
  } catch (error) {
    console.error('Error in createOrder:', error);
    res.status(400).json({ message: error.message });
  }
};

// Get orders
exports.getOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 10, count, period } = req.query;
    const query = req.user.isAdmin ? {} : { user: req.user._id };

    if (status) query.status = status;
    if (period) {
      const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      query.createdAt = { $gte: startDate };
    }

    if (count) {
      const totalOrders = await Order.countDocuments(query);
      return res.json({ count: totalOrders });
    }

    const orders = await Order.find(query)
      .populate('items.product user')
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (error) {
    console.error('Error in getOrders:', error);
    res.status(400).json({ message: error.message });
  }
};

// Get single order by ID
exports.getOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('items.product user');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!req.user.isAdmin && order.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    res.json(order);
  } catch (error) {
    console.error('Error in getOrder:', error);
    res.status(400).json({ message: error.message });
  }
};

// Update order status
exports.updateOrderStatus = async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });

    const { status } = req.body;
    const order = await Order.findById(req.params.id).populate('user');
    if (!order) return res.status(404).json({ message: 'Order not found' });

    order.status = status;
    order.tracking.push({ status });
    await order.save();

    const io = req.app.get('io');
    io.to('adminRoom').emit('orderStatusUpdate', order);
    io.to(`user_${order.user._id}`).emit('orderStatusUpdate', order);

    res.json(order);
  } catch (error) {
    console.error('Error in updateOrderStatus:', error);
    res.status(400).json({ message: error.message });
  }
};

// Verify payment proof
exports.verifyPaymentProof = async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });
    const { orderId, paymentStatus } = req.body;

    const order = await Order.findById(orderId).populate('user');
    if (!order) return res.status(404).json({ message: 'Order not found' });

    order.paymentStatus = paymentStatus;
    await order.save();

    const io = req.app.get('io');
    io.to('adminRoom').emit('orderStatusUpdate', order);
    io.to(`user_${order.user._id}`).emit('orderStatusUpdate', order);

    res.json(order);
  } catch (error) {
    console.error('Error verifying payment proof:', error);
    res.status(400).json({ message: error.message });
  }
};

// Sales metrics
exports.getSalesMetrics = async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });

    const orders = await Order.find({}).select('total');
    const totalSales = orders.reduce((sum, order) => sum + order.total, 0);
    const avgOrderValue = orders.length ? Math.round(totalSales / orders.length) : 0;

    res.json({ totalSales, avgOrderValue });
  } catch (error) {
    console.error('Error in getSalesMetrics:', error);
    res.status(400).json({ message: error.message });
  }
};

// Export orders as CSV
exports.exportOrders = async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });

    const { status } = req.query;
    const query = {};
    if (status) query.status = status;

    const orders = await Order.find(query)
      .populate('user', 'name email')
      .lean();

    const fields = [
      { label: 'Order Number', value: 'orderNumber' },
      { label: 'Customer Name', value: 'user.name' },
      { label: 'Customer Email', value: 'user.email' },
      { label: 'Total', value: 'total' },
      { label: 'Status', value: 'status' },
      { label: 'Payment Status', value: 'paymentStatus' },
      { label: 'Payment Proof', value: 'paymentProof' },
      { label: 'Date', value: 'createdAt' },
    ];

    const json2csv = new Parser({ fields });
    const csv = json2csv.parse(orders.map(order => ({ ...order, createdAt: new Date(order.createdAt).toLocaleDateString() })));

    res.header('Content-Type', 'text/csv');
    res.attachment('orders_data.csv');
    res.send(csv);
  } catch (error) {
    console.error('Error in exportOrders:', error);
    res.status(400).json({ message: error.message });
  }
};

// Track order by orderNumber
exports.trackOrder = async (req, res) => {
  try {
    const { orderNumber } = req.query;
    const order = await Order.findOne({ orderNumber }).populate('items.product user');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!req.user.isAdmin && order.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    res.json(order);
  } catch (error) {
    console.error('Error in trackOrder:', error);
    res.status(400).json({ message: error.message });
  }
};

// Get bank details
exports.getBankDetails = async (req, res) => {
  try {
    res.json({
      bankName: 'Pulse Parcel Bank',
      accountNumber: '1234567890',
      accountName: 'Pulse Parcel Ltd',
      swiftCode: 'PPBN123',
    });
  } catch (error) {
    console.error('Error fetching bank details:', error);
    res.status(500).json({ message: error.message });
  }
};
