pragma solidity ^0.8.19;

import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/src/utils/SafeTransferLib.sol";
import {FixedPointMathLib} from "solmate/src/utils/FixedPointMathLib.sol";
import {BaseAdapter} from "./BaseAdapter.sol";

interface Yearn {
    function pricePerShare() external view returns (uint256);
    function deposit(uint256 assets) external returns (uint256 shares);
    function withdraw(uint256 assets, address receiver) external returns (uint256 shares);
    function balanceOf(address owner) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function token() external view returns (address);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface StakingRewards {
    function stake(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function getReward() external;
    function rewardsToken() external returns (address);
    function rewards(address owner) external view returns (uint256);
    function balanceOf(address owner) external view returns (uint256);
}

contract YearnAdapter is BaseAdapter {
    Yearn public immutable vault;
    StakingRewards public immutable stakingRewards;
    ERC20 public immutable rewardsToken;

    constructor(
        address vault_,
        address rewardRecipient_,
        address stakingRewards_,
        uint minBalanceToTriggerDeposit_
    ) BaseAdapter(Yearn(vault_).token(), rewardRecipient_, minBalanceToTriggerDeposit_) {
        vault = Yearn(vault_);
        stakingRewards = StakingRewards(stakingRewards_);
        rewardsToken = ERC20(stakingRewards.rewardsToken());
        asset.approve(vault_, type(uint256).max);
        vault.approve(address(stakingRewards), type(uint256).max);
    }

    function claimRewards() external {
        stakingRewards.getReward();
    }

    // If the rewards are donated back to the vault, this mechanism is vulnerable to an attack where someone joins the pool, rewards are distributed, and then he leaves
    // this would allow that attacker to steal a part of the yield from everyone else
    // We solve this by donating to the pool at random times and keeping the txs private so its impossible to predict when a donation will happen and deposit right before
    function sendRewards(uint amount) external {
        rewardsToken.transfer(rewardRecipient, amount);
    }

    function forceDeposit(uint assets) internal override {
        uint shares = vault.deposit(assets);
        stakingRewards.stake(shares); // this can revert if contract is sunset, but if it does its not a huge deal because users can still withdraw
    }

    function forceRedeem(uint assets, address receiver) internal override {
        uint yearnShares = (assets * DIVISOR) / vault.pricePerShare(); // TODO: reduce 1 call to pricePerShare()
        stakingRewards.withdraw(yearnShares);
        vault.withdraw(yearnShares, receiver);
    }

    function totalAssets() public view override returns (uint256) {
        return (stakingRewards.balanceOf(address(this)) * vault.pricePerShare())/DIVISOR + asset.balanceOf(address(this));
    }

    function refreshApproval() external override {
        asset.approve(address(vault), 0);
        asset.approve(address(vault), type(uint256).max);
        vault.approve(address(stakingRewards), 0);
        vault.approve(address(stakingRewards), type(uint256).max);
    }
}