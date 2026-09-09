/**
 * TokenLedger service — offchain mirror of `contracts/TokenLedger.sol`.
 *
 * Why this exists: the assessment asks for a ledger API with *no direct
 * blockchain dependency* (no RPC, no node, no private key on the server).
 * This module re-implements the contract's accounting (mint / transfer /
 * balanceOf / totalSupply) in-process with the same validation rules, so
 * the REST layer can be developed, tested and demoed without a chain.
 *
 * Swap-in path: replace the method bodies with `ethers` calls against a
 * deployed TokenLedger (same function names / argument order) and the
 * controller + routes below keep working unchanged.
 *
 * Amounts are handled as BigInt internally and exposed as decimal strings
 * in JSON, because JSON cannot serialise BigInt and Number loses precision
 * past 2^53-1. This matches the contract's base-unit (uint256) accounting.
 */

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// In-memory state. Single-process only — a real deployment would back this
// with MongoDB (see existing `server/models/`) or with the onchain contract.
const balances = new Map();
let totalSupply = 0n;

/**
 * Minimal address sanity check (format only, no checksum validation).
 * Mirrors the contract's `ZeroAddress` revert for empty/zero inputs.
 *
 * @param {unknown} value Candidate address.
 * @returns {boolean} True when `value` looks like a 20-byte hex address.
 */
function isAddress(value) {
  return (
    typeof value === "string" &&
    /^0x[0-9a-fA-F]{40}$/.test(value) &&
    value.toLowerCase() !== ZERO_ADDRESS
  );
}

/**
 * Coerces a user-supplied amount to BigInt.
 *
 * @param {unknown} value Amount as a decimal string or safe integer.
 * @returns {bigint|null} Parsed positive BigInt, or null when invalid.
 */
function toAmount(value) {
  try {
    if (typeof value === "number") {
      if (!Number.isInteger(value) || value <= 0) return null;
      return BigInt(value);
    }
    if (typeof value === "string" && /^\d+$/.test(value.trim())) {
      const parsed = BigInt(value.trim());
      return parsed > 0n ? parsed : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Normalises an address to lowercase for map keying.
 *
 * @param {string} address Validated address.
 * @returns {string} Lowercased address.
 */
function key(address) {
  return address.toLowerCase();
}

module.exports = {
  ZERO_ADDRESS,

  /**
   * Credits `amount` base units to `to`, increasing total supply.
   * Mirrors `TokenLedger.mint` (minus the onchain `onlyOwner` gate — see
   * route file for the production auth wiring).
   *
   * @param {{to: string, amount: string|number}} params Mint inputs.
   * @returns {{to: string, amount: string, totalSupply: string}} Receipt.
   * @throws {Error} With `statusCode` 400 on invalid address / amount.
   */
  mint({ to, amount }) {
    if (!isAddress(to)) {
      const err = new Error("Invalid `to` address");
      err.statusCode = 400;
      throw err;
    }
    const value = toAmount(amount);
    if (value === null) {
      const err = new Error("`amount` must be a positive integer (base units)");
      err.statusCode = 400;
      throw err;
    }

    const k = key(to);
    balances.set(k, (balances.get(k) || 0n) + value);
    totalSupply += value;

    return { to: k, amount: value.toString(), totalSupply: totalSupply.toString() };
  },

  /**
   * Moves `amount` base units from `from` to `to`.
   * Mirrors `TokenLedger.transfer` including the insufficient-balance revert.
   *
   * @param {{from: string, to: string, amount: string|number}} params Transfer inputs.
   * @returns {{from: string, to: string, amount: string}} Receipt.
   * @throws {Error} With `statusCode` 400/404 on bad input or funds.
   */
  transfer({ from, to, amount }) {
    if (!isAddress(from)) {
      const err = new Error("Invalid `from` address");
      err.statusCode = 400;
      throw err;
    }
    if (!isAddress(to)) {
      const err = new Error("Invalid `to` address");
      err.statusCode = 400;
      throw err;
    }
    const value = toAmount(amount);
    if (value === null) {
      const err = new Error("`amount` must be a positive integer (base units)");
      err.statusCode = 400;
      throw err;
    }

    const fromKey = key(from);
    const toKey = key(to);
    const available = balances.get(fromKey) || 0n;
    if (available < value) {
      const err = new Error(
        `Insufficient balance: ${available.toString()} available, ${value.toString()} required`
      );
      err.statusCode = 400;
      throw err;
    }

    balances.set(fromKey, available - value);
    balances.set(toKey, (balances.get(toKey) || 0n) + value);

    return { from: fromKey, to: toKey, amount: value.toString() };
  },

  /**
   * Returns the balance of `account`, "0" when never seen.
   * Mirrors `TokenLedger.balanceOf`.
   *
   * @param {string} account Address to query.
   * @returns {{account: string, balance: string}} Balance in base units.
   * @throws {Error} With `statusCode` 400 on invalid address.
   */
  balanceOf(account) {
    if (!isAddress(account)) {
      const err = new Error("Invalid address");
      err.statusCode = 400;
      throw err;
    }
    const k = key(account);
    return { account: k, balance: (balances.get(k) || 0n).toString() };
  },

  /**
   * Returns total minted supply in base units.
   *
   * @returns {{totalSupply: string}} Total supply.
   */
  getTotalSupply() {
    return { totalSupply: totalSupply.toString() };
  },

  /** @internal Resets in-memory state. Used by tests / server restarts. */
  __reset() {
    balances.clear();
    totalSupply = 0n;
  },
};
