const express = require("express");
const {
  mintTokens,
  transferTokens,
  getBalance,
  getTotalSupply,
} = require("../controllers/tokenLedgerController");

// NOTE (production hardening): the contract gates `mint` behind `onlyOwner`.
// The equivalent here is the existing auth stack — uncomment to restrict:
//   const { isAuthenticatedUser, authorizeRoles } =
//     require("../middlewares/user_actions/auth");
//   router.route("/mint").post(isAuthenticatedUser, authorizeRoles("admin"), mintTokens);
// Left public so the assessment flow (curl / Postman / video) works without
// a JWT. `transfer` stays public by design — like any ERC-20 transfer — with
// `from` supplied explicitly for the demo (production would bind it to
// req.user's wallet instead).

const router = express.Router();

router.route("/mint").post(mintTokens);
router.route("/transfer").post(transferTokens);
router.route("/balance/:address").get(getBalance);
router.route("/total-supply").get(getTotalSupply);

module.exports = router;
