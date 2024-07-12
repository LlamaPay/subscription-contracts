pragma solidity ^0.8.0;

import {Subs} from "./Subs.sol";
import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/src/utils/SafeTransferLib.sol";
import {Owned} from "solmate/src/auth/Owned.sol";

contract SubsFactory is Owned {
    using SafeTransferLib for ERC20;

    uint256 public getContractCount;
    address[1000000000] public getContractByIndex;

    event SubsCreated(address subsContract, address token, uint periodDuration, address vault, address feeCollector, uint currentPeriod, address rewardRecipient, address stakingRewards, address owner);

    constructor() Owned(msg.sender) {}

    function createContract(uint _periodDuration, address _vault, address _feeCollector, uint _currentPeriod,
      address rewardRecipient_, address stakingRewards_, address owner_, uint256 unit) onlyOwner() external returns (Subs subsContract) {
        subsContract = new Subs(_periodDuration, _vault, _feeCollector, _currentPeriod, rewardRecipient_, stakingRewards_, owner_);
        ERC20 token = subsContract.asset();

        /*
        BaseAdapter is vulnerable to ERC4626 inflation attacks
        See https://docs.openzeppelin.com/contracts/5.x/erc4626

        To mitigate this we deposit some coins and burn the shares by assigning them to this contract, from which they can't be retrieved.
        */
        token.safeTransferFrom(msg.sender, address(this), unit); // unit needs to be high enough (eg ~1$ is enough)
        token.approve(address(subsContract), unit);
        subsContract.subscribeForNextPeriod(address(this), unit, unit, 0, "");

        // Append the new contract address to the array of deployed contracts
        uint256 index = getContractCount;
        getContractByIndex[index] = address(subsContract);
        unchecked{
            getContractCount = index + 1;
        }

        emit SubsCreated(address(subsContract), address(token), _periodDuration, _vault, _feeCollector, _currentPeriod, rewardRecipient_, stakingRewards_, owner_);
    }
}