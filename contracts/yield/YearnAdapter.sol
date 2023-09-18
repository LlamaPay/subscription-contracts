pragma solidity ^0.8.19;

import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/src/utils/SafeTransferLib.sol";
import {FixedPointMathLib} from "solmate/src/utils/FixedPointMathLib.sol";
import {Owned} from "solmate/src/auth/Owned.sol";

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

contract YearnAdapter is Owned {
    using SafeTransferLib for ERC20;
    using FixedPointMathLib for uint256;

    ERC20 public immutable asset;
    Yearn public immutable vault;
    address public rewardRecipient;
    StakingRewards public immutable stakingRewards;
    ERC20 public immutable rewardsToken;
    uint public immutable DIVISOR; // This is just a constant to query convertToShares and then divide result, vault.convertToShares(DIVISOR) must never revert
    uint public totalSupply;

    constructor(
        address vault_,
        address rewardRecipient_,
        address stakingRewards_
    ) Owned(msg.sender) {
        vault = Yearn(vault_);
        asset = ERC20(vault.token());
        rewardRecipient = rewardRecipient_;
        stakingRewards = StakingRewards(stakingRewards_);
        rewardsToken = ERC20(stakingRewards.rewardsToken());
        DIVISOR = 10**asset.decimals(); // Even if decimals() changes later this will still work fine
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

    function setRewardRecipient(address _rewardRecipient) external onlyOwner() {
        rewardRecipient = _rewardRecipient;
    }

    function deposit(uint256 assets) internal returns (uint) {
        uint ourShares = convertToShares(assets);
        totalSupply += ourShares;
        uint shares = vault.deposit(assets);
        stakingRewards.stake(shares); // this can revert if contract is sunset, but if it does its not a huge deal because users can still withdraw
        return ourShares;
    }

    function redeem(uint256 shares, address receiver) internal {
        uint assets = convertToAssets(shares);
        uint yearnShares = assets.mulDivDown(DIVISOR,vault.pricePerShare());
        stakingRewards.withdraw(yearnShares);
        vault.withdraw(yearnShares, receiver);
    }

    function totalAssets() public view returns (uint256) {
        return (stakingRewards.balanceOf(address(this)) * vault.pricePerShare())/DIVISOR;
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        uint256 supply = totalSupply; // Saves an extra SLOAD if totalSupply is non-zero.

        return supply == 0 ? assets : assets.mulDivDown(supply, totalAssets());
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        uint256 supply = totalSupply; // Saves an extra SLOAD if totalSupply is non-zero.

        return supply == 0 ? shares : shares.mulDivDown(totalAssets(), supply);
    }

    function refreshApproval() external {
        asset.approve(address(vault), 0);
        asset.approve(address(vault), type(uint256).max);
        vault.approve(address(stakingRewards), 0);
        vault.approve(address(stakingRewards), type(uint256).max);
    }
}