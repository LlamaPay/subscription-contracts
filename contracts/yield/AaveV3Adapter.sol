pragma solidity ^0.8.19;

import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/src/utils/SafeTransferLib.sol";
import {FixedPointMathLib} from "solmate/src/utils/FixedPointMathLib.sol";
import {BaseAdapter} from "./BaseAdapter.sol";

interface IPool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

interface IRewardsController {
    function claimAllRewards(address[] calldata assets, address to) external
        returns (address[] memory rewardsList, uint256[] memory claimedAmounts);
}

contract AaveV3Adapter is BaseAdapter {
    ERC20 public immutable aToken;
    IPool public immutable lendingPool;
    IRewardsController public immutable rewardsController;

    constructor(
        address lendingPool_,
        address rewardRecipient_,
        address aToken_,
        address rewardsController_,
        address asset_,
        uint minBalanceToTriggerDeposit_
    ) BaseAdapter(asset_, rewardRecipient_, minBalanceToTriggerDeposit_) {
        lendingPool = IPool(lendingPool_);
        aToken = ERC20(aToken_);
        rewardsController = IRewardsController(rewardsController_);
        asset.approve(address(lendingPool), type(uint256).max);
    }

    // If the rewards are donated back to the vault, this mechanism is vulnerable to an attack where someone joins the pool, rewards are distributed, and then he leaves
    // this would allow that attacker to steal a part of the yield from everyone else
    // We solve this by donating to the pool at random times and keeping the txs private so its impossible to predict when a donation will happen and deposit right before
    function claimRewards() external {
        address[] memory assets = new address[](1);
        assets[0] = address(aToken);
        rewardsController.claimAllRewards(assets, rewardRecipient);
    }

    function forceDeposit(uint assets) internal override {
        lendingPool.supply(address(asset), assets, address(this), 0);
    }

    function forceRedeem(uint assets, address receiver) internal override {
        lendingPool.withdraw(address(asset), assets, receiver);
    }

    function totalAssets() public view override returns (uint256) {
        return aToken.balanceOf(address(this)) + asset.balanceOf(address(this));
    }

    function refreshApproval() external override {
        asset.approve(address(lendingPool), 0);
        asset.approve(address(lendingPool), type(uint256).max);
    }
}