const asyncErrorHandler = require("../middlewares/helpers/asyncErrorHandler");
const ErrorHandler = require("../utils/errorHandler");
const ledger = require("../services/tokenLedger.service");

// POST /api/ledger/mint — create units and credit `to`.
// Body: { to: "0x...", amount: "1000" } (`amount` in base units).
exports.mintTokens = asyncErrorHandler(async (req, res, next) => {
  const { to, amount } = req.body || {};

  if (!to || amount === undefined) {
    return next(new ErrorHandler("`to` and `amount` are required", 400));
  }

  try {
    const receipt = ledger.mint({ to, amount });
    return res.status(201).json({ success: true, ...receipt });
  } catch (err) {
    return next(new ErrorHandler(err.message, err.statusCode || 400));
  }
});

// POST /api/ledger/transfer — move units between accounts.
// Body: { from: "0x...", to: "0x...", amount: "250" }.
// NOTE: `from` is explicit so the flow can be demoed without wallet
// signatures. In production this would be derived from the authenticated
// user's bound wallet (req.user) instead of trusting the body.
exports.transferTokens = asyncErrorHandler(async (req, res, next) => {
  const { from, to, amount } = req.body || {};

  if (!from || !to || amount === undefined) {
    return next(new ErrorHandler("`from`, `to` and `amount` are required", 400));
  }

  try {
    const receipt = ledger.transfer({ from, to, amount });
    return res.status(200).json({ success: true, ...receipt });
  } catch (err) {
    return next(new ErrorHandler(err.message, err.statusCode || 400));
  }
});

// GET /api/ledger/balance/:address — balance lookup.
exports.getBalance = asyncErrorHandler(async (req, res, next) => {
  try {
    const result = ledger.balanceOf(req.params.address);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return next(new ErrorHandler(err.message, err.statusCode || 400));
  }
});

// GET /api/ledger/total-supply — total minted supply.
exports.getTotalSupply = asyncErrorHandler(async (req, res) => {
  return res.status(200).json({ success: true, ...ledger.getTotalSupply() });
});
