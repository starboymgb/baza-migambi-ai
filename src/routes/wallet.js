const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');

// POST /api/wallet/deposit
router.post('/deposit', walletController.deposit);

// POST /api/wallet/withdraw
router.post('/withdraw', walletController.withdraw);

module.exports = router;