// routes/bankRoutes.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

router.get('/bank-details', auth, (req, res) => {
  try {
    const bankDetails = {
      bank: process.env.BANK_NAME || 'Example Bank',
      accountName: process.env.ACCOUNT_NAME || '10kVendor',
      accountNumber: process.env.ACCOUNT_NUMBER || '0123456789'
    };
    console.log('Returning bank details:', bankDetails);
    res.json(bankDetails);
  } catch (error) {
    console.error('Error fetching bank details:', error.message);
    res.status(500).json({ message: 'Server error while fetching bank details' });
  }
});

module.exports = router;