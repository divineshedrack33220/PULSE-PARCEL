// routes/bankRoutes.js
const express = require('express');
const router = express.Router();

// This route responds to GET /api/bank-details
router.get('/', (req, res) => {
  res.json({
    bank: 'UNION BANK NIGERIA',
    accountName: 'PULSE PARCEL LIMITED',
    accountNumber: '0236868956'
  });
});

module.exports = router;