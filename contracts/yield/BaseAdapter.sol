pragma solidity ^0.8.19;

import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/src/utils/SafeTransferLib.sol";
import {FixedPointMathLib} from "solmate/src/utils/FixedPointMathLib.sol";
import {Owned} from "solmate/src/auth/Owned.sol";

/*
This is vulnerable to ERC4626 inflation attacks!
See https://docs.openzeppelin.com/contracts/5.x/erc4626 and https://blog.openzeppelin.com/a-novel-defense-against-erc4626-inflation-attacks

This is solved through SubsFactory, which creates some shares upon deployment and burns them.
*/

abstract contract BaseAdapter is Owned {
    using SafeTransferLib for ERC20;
    using FixedPointMathLib for uint256;

    ERC20 public immutable asset;
    address public rewardRecipient;
    uint public immutable DIVISOR; // This is just a constant to query convertToShares and then divide result, vault.convertToShares(DIVISOR) must never revert
    uint public totalSupply;

    constructor(
        address asset_,
        address rewardRecipient_,
        address owner_
    ) Owned(owner_) {
        asset = ERC20(asset_);
        rewardRecipient = rewardRecipient_;
        DIVISOR = 10**asset.decimals(); // Even if decimals() changes later this will still work fine
    }

    function setRewardRecipient(address _rewardRecipient) external onlyOwner() {
        rewardRecipient = _rewardRecipient;
    }

    // There's an argument for not caller-restricting this:
    //   redeem() doesn't support withdrawing money from both asset and vault, so in the case where the last user wants to withdraw
    //    and only 50% of money is in the vault, owner could increase minBalanceToTriggerDeposit to max to prevent new vault deposits
    //    and prevent the user from getting the money, asking for a ransom.
    //    If this method was not caller-restricted, user could simply call it to solve that situation
    // However the danger seems too high for now since this makes it possible for an attacker to withdraw and deposit into vault at will
    // so in the first version it will be caller-restricted
    function triggerDeposit(uint amount, uint maxToPull) external onlyOwner() {
        forceDepositAndCheck(amount, msg.sender, maxToPull);
    }

    // In some cases totalAssets() after coins are deposited into the yield vault, this could be used in an attack so this function ensures this never happens
    function forceDepositAndCheck(uint amount, address receiver, uint maxToPull) internal {
        uint oldTotalAssets = totalAssets();
        forceDeposit(amount);
        uint newTotalAssets = totalAssets();
        if(newTotalAssets < oldTotalAssets){
            uint pullAmount = oldTotalAssets - newTotalAssets;
            require(pullAmount < maxToPull, ">maxToPull");
            asset.transferFrom(receiver, address(this), pullAmount);
        }
    }

    function forceDeposit(uint assets) internal virtual;

    // Yield buffer
    //   Most of the gas cost in calls to subscribe() comes moving the coins into the yield-generating vault
    //   For small subscriptions this means that users might end up paying more in gas costs than the yield they generate,
    //   so to greatly reduce gas costs and amortize them among all users we've implemented a yield buffer.
    //   When new coins are deposited they'll be simply stored in the contract, with no extra gas costs,
    //   then, when we trigger it, all coins will be moved to the yield vault, thus aggregating all these user deposits
    //   into a single large deposit for which we pay O(1) gas, thus amortizing costs.
    //   This means that some money will sit idle and not earn any yield, but thats ok.
    //   This also applies for withdrawals, if we have enough money in the buffer we'll just use that so we don't have to pull money from vault
    function deposit(uint256 assets) internal returns (uint shares) {
        shares = totalSupply == 0 ? assets : assets.mulDivDown(totalSupply, totalAssets());
        totalSupply += shares;
    }

    function forceRedeem(uint assets, address receiver) internal virtual;

    function redeem(uint256 shares, address receiver) internal {
        uint assets = convertToAssets(shares);
        totalSupply -= shares;
        if(assets <= asset.balanceOf(address(this))){
            asset.safeTransfer(receiver, assets);
        } else {
            forceRedeem(assets, receiver);
        }
    }

    function totalAssets() public view virtual returns (uint256);

    function convertToShares(uint256 assets) public view returns (uint256) {
        uint256 supply = totalSupply; // Saves an extra SLOAD if totalSupply is non-zero.

        return supply == 0 ? assets : assets.mulDivDown(supply, totalAssets());
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        uint256 supply = totalSupply; // Saves an extra SLOAD if totalSupply is non-zero.

        return supply == 0 ? shares : shares.mulDivDown(totalAssets(), supply);
    }

    function refreshApproval() external virtual;
}