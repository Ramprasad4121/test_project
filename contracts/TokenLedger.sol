// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title TokenLedger
/// @author Ramprasad
/// @notice A minimal, dependency-free ledger that simulates minting,
///         transferring and balance lookups for the RentVerse API layer.
/// @dev Intentionally self-contained: no OpenZeppelin imports, no oracles,
///      no external protocol calls. The offchain API in
///      `server/services/tokenLedger.service.js` mirrors this logic
///      one-to-one so the backend runs without an RPC endpoint or node.
///
///      Accounting is kept in raw base units (decimals = 18, like ether).
///      All state-changing functions follow Checks-Effects-Interactions and
///      emit events first-class so indexers can rebuild history from logs.
contract TokenLedger {
    /*//////////////////////////////////////////////////////////////
                                 STATE
    //////////////////////////////////////////////////////////////*/

    /// @notice Human-readable token name.
    string public name;

    /// @notice Compact token symbol.
    string public symbol;

    /// @notice Fixed decimal precision. Kept at 18 to match ether convention.
    uint8 public immutable decimals;

    /// @notice Total units ever minted minus burned. Monotonic except via burn.
    uint256 public totalSupply;

    /// @notice Contract deployer. Holds exclusive minting rights.
    address public owner;

    /// @dev Balance per account in base units.
    mapping(address => uint256) private _balances;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted on every mint.
    /// @param to Recipient of the newly created units.
    /// @param amount Units created, in base units.
    event Mint(address indexed to, uint256 amount);

    /// @notice Emitted on every transfer, including burns (to == address(0)).
    /// @param from Sender (or owner on mint path, documented separately).
    /// @param to Recipient (address(0) on burn).
    /// @param amount Units moved, in base units.
    event Transfer(address indexed from, address indexed to, uint256 amount);

    /// @notice Emitted when ownership changes.
    /// @param previousOwner The outgoing owner.
    /// @param newOwner The incoming owner.
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @dev Caller is not the owner.
    error OnlyOwner();

    /// @dev Address argument is the zero address.
    error ZeroAddress();

    /// @dev Amount argument is zero where a positive value is required.
    error ZeroAmount();

    /// @dev Sender balance is insufficient for the requested debit.
    error InsufficientBalance(uint256 available, uint256 required);

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @notice Deploys the ledger and assigns ownership to the deployer.
    /// @param _name Human-readable name, e.g. "RentVerse Ledger".
    /// @param _symbol Compact symbol, e.g. "RVL".
    constructor(string memory _name, string memory _symbol) {
        if (bytes(_name).length == 0) revert ZeroAmount(); // empty name is a deploy mistake
        if (bytes(_symbol).length == 0) revert ZeroAmount();

        name = _name;
        symbol = _symbol;
        decimals = 18;
        owner = msg.sender;

        emit OwnershipTransferred(address(0), msg.sender);
    }

    /*//////////////////////////////////////////////////////////////
                               MODIFIERS
    //////////////////////////////////////////////////////////////*/

    /// @dev Reverts unless called by {owner}.
    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    /*//////////////////////////////////////////////////////////////
                              CORE LEDGER
    //////////////////////////////////////////////////////////////*/

    /// @notice Creates `amount` units and credits them to `to`.
    /// @dev Only {owner} can mint. Reverts on zero address / zero amount.
    /// @param to Recipient of the new units.
    /// @param amount Units to create, in base units.
    /// @return newTotalSupply Updated {totalSupply} after the mint.
    function mint(address to, uint256 amount) external onlyOwner returns (uint256 newTotalSupply) {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        // Effects before interactions (no external calls here, but kept explicit).
        totalSupply += amount;
        _balances[to] += amount;

        emit Mint(to, amount);
        emit Transfer(address(0), to, amount);

        return totalSupply;
    }

    /// @notice Moves `amount` units from the caller to `to`.
    /// @dev Reverts on zero address, zero amount, or insufficient balance.
    /// @param to Recipient address.
    /// @param amount Units to move, in base units.
    /// @return success Always true on success (ERC-20 style return).
    function transfer(address to, uint256 amount) external returns (bool success) {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        uint256 senderBalance = _balances[msg.sender];
        if (senderBalance < amount) revert InsufficientBalance(senderBalance, amount);

        unchecked {
            // Safe: `senderBalance >= amount` checked above.
            _balances[msg.sender] = senderBalance - amount;
            _balances[to] += amount;
        }

        emit Transfer(msg.sender, to, amount);

        return true;
    }

    /// @notice Returns the balance of `account` in base units.
    /// @param account The address to query.
    /// @return balance Current balance, 0 for never-seen addresses.
    function balanceOf(address account) external view returns (uint256 balance) {
        return _balances[account];
    }

    /// @notice Transfers ownership to `newOwner`.
    /// @dev Only {owner}. Reverts on zero address.
    /// @param newOwner The incoming owner.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();

        address previousOwner = owner;
        owner = newOwner;

        emit OwnershipTransferred(previousOwner, newOwner);
    }
}
