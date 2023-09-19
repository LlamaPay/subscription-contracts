pragma solidity ^0.8.19;

import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/src/utils/SafeTransferLib.sol";
import {BoringBatchable} from "./fork/BoringBatchable.sol";
import {YearnAdapter} from "./yield/YearnAdapter.sol";
import {FixedPointMathLib} from "solmate/src/utils/FixedPointMathLib.sol";

contract Subs is BoringBatchable, YearnAdapter {
    using SafeTransferLib for ERC20;
    using FixedPointMathLib for uint256;

    uint public immutable periodDuration;
    address public immutable feeCollector;
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
    event Unsubscribe(bytes32 subId);

    constructor(uint _periodDuration, address _vault, address _feeCollector, uint _currentPeriod, address rewardRecipient_,
        address stakingRewards_, uint minBalanceToTriggerDeposit_) YearnAdapter(_vault, rewardRecipient_, stakingRewards_, minBalanceToTriggerDeposit_){
        // periodDuration MUST NOT be a very small number, otherwise loops could end growing bigger than block limit
        // At 500-600 cycles you start running into ethereum's gas limit per block, which would make it impossible to call the contract
        // so by enforcing a minimum of 1 week for periodDuration we ensure that this wont be a problem unless nobody interacts with contract in >10 years
        // This can be solved by adding a method that lets users update state partially, so you can split a 20 years update into 4 calls that update 5 years each
        // however the extra complexity and risk introduced by this is imo not worth handling the edge case where there are ZERO interactions in >10 years
        require(_periodDuration >= 7 days, "periodDuration too smol");
        periodDuration = _periodDuration;
        currentPeriod = _currentPeriod;
        require(currentPeriod <= block.timestamp);
        feeCollector = _feeCollector;
    }

    function _updateGlobal() private {
        if(block.timestamp > currentPeriod + periodDuration){
            uint shares = convertToShares(DIVISOR);
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
                    // here lastUpdate < currentPeriod is always true
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
        // block.timestamp <= currentPeriod + periodDuration is enforced in _updateGlobal() and currentPeriod <= block.timestamp
        // so 0 <= (currentPeriod + periodDuration - block.timestamp) <= periodDuration
        // thus this will never underflow and claimableThisPeriod <= amountPerCycle
        uint claimableThisPeriod = (amountPerCycle * (currentPeriod + periodDuration - block.timestamp)) / periodDuration;
        uint amountForFuture = amountPerCycle * cycles;
        uint amount = amountForFuture + claimableThisPeriod;
        asset.safeTransferFrom(msg.sender, address(this), amount);
        // If subscribed when timestamp == currentPeriod with cycles == 0, this will revert, which is fine since such subscription is for 0 seconds
        uint shares = deposit(amount);
        uint expiration = currentPeriod + periodDuration*cycles;
        // Setting receiverAmountToExpire here makes the implicit assumption than all calls to convertToShares(DIVISOR) within _updateGlobal() in the future will return a lower number than the one returned right now,
        // in other words, that the underlying vault will never lose money and its pricePerShare() will not go down
        // If vault were to lose money, contract will keep working, but it will have bad debt, so the last users to withdraw won't be able to
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
        if(expirationDate >= block.timestamp){
            // Most common case, solved in O(1)
            uint sharesPaid = (sharesAccumulator - accumulator).mulDivUp(amountPerCycle, DIVISOR);
            // sharesLeft can underflow if either share price goes down or because of rounding
            // however that's fine because in those cases there's nothing left to withdraw
            uint sharesLeft = initialShares - sharesPaid;
            redeem(sharesLeft, msg.sender);
            receiverAmountToExpire[receiver][expirationDate] -= amountPerCycle;
            receiverAmountToExpire[receiver][currentPeriod] += amountPerCycle;
        } else {
            // Uncommon case, its just claiming yield generated after sub expired
            uint subsetAccumulator = 0;
            while(initialPeriod < expirationDate){
                subsetAccumulator += sharesPerPeriod[initialPeriod];
                initialPeriod += periodDuration;
            }
            redeem(initialShares - subsetAccumulator.mulDivUp(amountPerCycle, DIVISOR), msg.sender);
        }
        emit Unsubscribe(subId);
    }

    function claim(uint256 amount) external {
        _updateReceiver(msg.sender);
        receiverBalances[msg.sender].balance -= amount;
        redeem((amount * 99) / 100, msg.sender);
        receiverBalances[feeCollector].balance += amount / 100;
    }
}