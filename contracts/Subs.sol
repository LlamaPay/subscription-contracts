// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/src/utils/SafeTransferLib.sol";
import {BoringBatchable} from "./fork/BoringBatchable.sol";

interface IERC4626 {
    function convertToShares(uint256 assets) external view returns (uint256);
    function convertToAssets(uint256 shares) external view returns (uint256);
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares);
    function balanceOf(address owner) external view returns (uint256);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);
    function transfer(address to, uint256 value) external returns (bool);
    function asset() external view returns (address);
}

contract Subs is BoringBatchable {
    using SafeTransferLib for ERC20;

    uint public immutable periodDuration;
    ERC20 public immutable token;
    IERC4626 public immutable vault;
    address public immutable feeCollector;
    uint public immutable DIVISOR; // This is just a constant to query convertToShares and then divide result, vault.convertToShares(DIVISOR) must never revert
    uint public currentPeriod; // Invariant: currentPeriod <= block.timestamp
    uint public sharesAccumulator;
    mapping(address => mapping(uint256 => uint256)) public receiverAmountToExpire;
    struct ReceiverBalance {
        uint256 balance;
        uint256 amountPerPeriod;
        uint256 lastUpdate; // Invariant: lastUpdate <= currentPeriod
    }
    mapping(address => ReceiverBalance) public receiverBalances;
    mapping(uint256 => uint256) public sharesPerPeriod;
    mapping(bytes32 => bool) public subs;

    event NewSubscription(address owner, uint initialPeriod, uint expirationDate, uint amountPerCycle, address receiver, uint256 accumulator, uint256 initialShares);

    constructor(uint _periodDuration, address _vault, address _feeCollector, uint _currentPeriod){
        // periodDuration MUST NOT be a very small number, otherwise loops could end growing bigger than block limit
        // At 500-600 cycles you start running into ethereum's gas limit per block, which would make it impossible to call the contract
        // so by enforcing a minimum of 1 week for periodDuration we ensure that this wont be a problem unless nobody interacts with contract in >10 years
        // This can be solved by adding a method that lets users update state partially, so you can split a 20 years update into 4 calls that update 5 years each
        // however the extra complexity and risk introduced by this is imo not worth handling the edge case where there are ZERO interactions in >10 years
        require(_periodDuration >= 7 days, "periodDuration too smol");
        periodDuration = _periodDuration;
        currentPeriod = _currentPeriod;
        vault = IERC4626(_vault);
        token = ERC20(vault.asset());
        feeCollector = _feeCollector;
        DIVISOR = 10**token.decimals(); // Even if decimals() changes later this will still work fine
        token.approve(_vault, type(uint256).max);
    }

    function refreshApproval() external {
        token.approve(address(vault), 0);
        token.approve(address(vault), type(uint256).max);
    }

    function _updateGlobal() private {
        if(block.timestamp > currentPeriod + periodDuration){
            uint shares = vault.convertToShares(DIVISOR);
            sharesAccumulator += ((block.timestamp - currentPeriod)/periodDuration)*shares; // Loss of precision here is a wanted effect
            do {
                sharesPerPeriod[currentPeriod] = shares;
                currentPeriod += periodDuration;
            } while(block.timestamp > currentPeriod + periodDuration);
        }
    }

    function _updateReceiver(address receiver) private {
        ReceiverBalance storage bal = receiverBalances[receiver];
        uint lastUpdate = bal.lastUpdate;
        if(lastUpdate + periodDuration < block.timestamp){
            _updateGlobal(); // if lastUpdate is up to date then currentPeriod must be up to date since lastUpdate is only updated after calling _updateGlobal()
            if(lastUpdate == 0){
                lastUpdate = currentPeriod;
            } else {
                // This optimization can increase costs a little on subscribe() but decreases costs a lot when _updateReceiver() hasnt been called in a long time
                uint balance = bal.balance;
                uint amountPerPeriod = bal.amountPerPeriod;
                do {
                    amountPerPeriod -= receiverAmountToExpire[receiver][lastUpdate];
                    balance += (amountPerPeriod * sharesPerPeriod[lastUpdate]) / DIVISOR;
                    lastUpdate += periodDuration;
                } while (lastUpdate < currentPeriod);
                bal.balance = balance;
                bal.amountPerPeriod = amountPerPeriod;
            }
            bal.lastUpdate = lastUpdate;
        }
    }

    function getSubId(address owner, uint initialPeriod, uint expirationDate,
        uint amountPerCycle, address receiver, uint256 accumulator, uint256 initialShares) public pure returns (bytes32 id){
        id = keccak256(
            abi.encode(
                owner,
                initialPeriod,
                expirationDate, // needed to undo receiverAmountToExpire
                amountPerCycle,
                receiver,
                accumulator,
                initialShares
            )
        );
    }

    function subscribe(address receiver, uint amountPerCycle, uint256 cycles) external {
        _updateReceiver(receiver);
        // block.timestamp <= currentPeriod + periodDuration is enforced in _updateGlobal()
        // so (currentPeriod + periodDuration - block.timestamp) will never underflow
        uint claimableThisPeriod = (amountPerCycle * (currentPeriod + periodDuration - block.timestamp)) / periodDuration;
        uint amountForFuture = amountPerCycle * cycles;
        uint amount = amountForFuture + claimableThisPeriod;
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint shares = vault.deposit(amount, address(this));
        uint expiration = currentPeriod + periodDuration*cycles;
        receiverAmountToExpire[receiver][expiration] += amountPerCycle;
        receiverBalances[receiver].amountPerPeriod += amountPerCycle;
        receiverBalances[receiver].balance += (shares * claimableThisPeriod) / amount;
        uint sharesLeft = (amountForFuture * shares) / amount;
        bytes32 subId = getSubId(msg.sender, currentPeriod, expiration, amountPerCycle, receiver, sharesAccumulator, sharesLeft);
        require(subs[subId] == false, "duplicated sub");
        subs[subId] = true;
        emit NewSubscription(msg.sender, currentPeriod, expiration, amountPerCycle, receiver, sharesAccumulator, sharesLeft);
    }

    function unsubscribe(uint initialPeriod, uint expirationDate, uint amountPerCycle, address receiver, uint256 accumulator, uint256 initialShares) external {
        _updateGlobal();
        bytes32 subId = getSubId(msg.sender, initialPeriod, expirationDate, amountPerCycle, receiver, accumulator, initialShares);
        require(subs[subId] == true, "sub doesn't exist");
        delete subs[subId];
        if(expirationDate > block.timestamp){
            // Most common case, solved in O(1)
            uint sharesPaid = ((sharesAccumulator - accumulator) * amountPerCycle) / DIVISOR;
            uint sharesLeft = initialShares - sharesPaid;
            vault.redeem(sharesLeft, msg.sender, address(this));
            receiverAmountToExpire[receiver][expirationDate] -= amountPerCycle;
            receiverAmountToExpire[receiver][currentPeriod] += amountPerCycle;
        } else {
            // Uncommon case, its just claiming yield generated after sub expired
            uint subsetAccumulator = 0;
            while(initialPeriod < expirationDate){
                subsetAccumulator += sharesPerPeriod[initialPeriod];
                initialPeriod += periodDuration;
            }
            vault.redeem(initialShares - ((subsetAccumulator * amountPerCycle) / DIVISOR), msg.sender, address(this));
        }
    }

    function claim(uint256 amount) external {
        _updateReceiver(msg.sender);
        receiverBalances[msg.sender].balance -= amount;
        vault.redeem((amount * 99) / 100, msg.sender, address(this));
        vault.transfer(feeCollector, amount / 100);
    }
}