const express = require('express');
const router = express.Router();
const { createProduct, getProducts, getProductById, updateProduct, deleteProduct, addStarRating } = require('../controllers/productController');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');

console.log('✅ Registering product routes');
console.log('Imported handlers:', { createProduct, getProducts, getProductById, updateProduct, deleteProduct, addStarRating });

// Public routes
router.get('/', getProducts);
router.get('/:id', getProductById);

// Authenticated routes
router.post('/', auth, upload.array('images', 5), createProduct);
router.put('/:id', auth, upload.array('images', 5), updateProduct);
router.delete('/:id', auth, deleteProduct);
router.post('/:id/reviews', auth, addStarRating);

module.exports = router;