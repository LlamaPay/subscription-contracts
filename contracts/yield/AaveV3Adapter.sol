pragma solidity ^0.8.19;

import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/src/utils/SafeTransferLib.sol";
import {FixedPointMathLib} from "solmate/src/utils/FixedPointMathLib.sol";
import {Owned} from "solmate/src/auth/Owned.sol";

interface IPool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

interface IRewardsController {
    function claimAllRewards(address[] calldata assets, address to) external
        returns (address[] memory rewardsList, uint256[] memory claimedAmounts);
}

contract YearnAdapter is Owned {
    using SafeTransferLib for ERC20;
    using FixedPointMathLib for uint256;

    ERC20 public immutable asset;
    ERC20 public immutable aToken;
    IPool public immutable lendingPool;
    IRewardsController public immutable rewardsController;
    address public rewardRecipient;
    uint public immutable DIVISOR; // This is just a constant to query convertToShares and then divide result, vault.convertToShares(DIVISOR) must never revert
    uint public totalSupply;
    uint public minBalanceToTriggerDeposit;

    constructor(
        address lendingPool_,
        address rewardRecipient_,
        address aToken_,
        address rewardsController_,
        address asset_,
        uint minBalanceToTriggerDeposit_
    ) Owned(msg.sender) {
        lendingPool = IPool(lendingPool_);
        rewardRecipient = rewardRecipient_;
        aToken = ERC20(aToken_);
        rewardsController = IRewardsController(rewardsController_);
        asset = ERC20(asset_);
        DIVISOR = 10**asset.decimals(); // Even if decimals() changes later this will still work fine
        minBalanceToTriggerDeposit = minBalanceToTriggerDeposit_;
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

    function setRewardRecipient(address _rewardRecipient) external onlyOwner() {
        rewardRecipient = _rewardRecipient;
    }

    function setMinBalanceToTriggerDeposit(uint _minBalanceToTriggerDeposit) external onlyOwner() {
        minBalanceToTriggerDeposit = _minBalanceToTriggerDeposit;
    }

    // Can be triggered anyway by making a deposit higher than minBalanceToTriggerDeposit
    function triggerDeposit() external {
        forceDeposit(asset.balanceOf(address(this)));
    }

    function forceDeposit(uint assets) internal {
        lendingPool.supply(address(asset), assets, address(this), 0);
    }

    function deposit(uint256 assets) internal returns (uint) {
        uint ourShares = totalSupply == 0 ? assets : assets.mulDivDown(totalSupply, totalAssets() - assets);
        totalSupply += ourShares;
        uint assetBalance = asset.balanceOf(address(this));
        if(assetBalance > minBalanceToTriggerDeposit){
            forceDeposit(assetBalance);
        }
        return ourShares;
    }

    function redeem(uint256 shares, address receiver) internal {
        uint assets = convertToAssets(shares);
        totalSupply -= shares;
        if(assets <= asset.balanceOf(address(this))){
            asset.safeTransfer(receiver, assets);
        } else {
            lendingPool.withdraw(address(asset), assets, receiver);
        }
    }

    function totalAssets() public view returns (uint256) {
        return aToken.balanceOf(address(this)) + asset.balanceOf(address(this));
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
        asset.approve(address(lendingPool), 0);
        asset.approve(address(lendingPool), type(uint256).max);
    }
}