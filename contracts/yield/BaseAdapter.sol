pragma solidity ^0.8.19;

import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/src/utils/SafeTransferLib.sol";
import {FixedPointMathLib} from "solmate/src/utils/FixedPointMathLib.sol";
import {Owned} from "solmate/src/auth/Owned.sol";

abstract contract BaseAdapter is Owned {
    using SafeTransferLib for ERC20;
    using FixedPointMathLib for uint256;

    ERC20 public immutable asset;
    address public rewardRecipient;
    uint public immutable DIVISOR; // This is just a constant to query convertToShares and then divide result, vault.convertToShares(DIVISOR) must never revert
    uint public totalSupply;
    uint public minBalanceToTriggerDeposit; // Threshold after which we'll trigger a deposit to yield source, also doubles as a pause button for new deposits if set to type(uint256).max

    constructor(
        address asset_,
        address rewardRecipient_,
        uint minBalanceToTriggerDeposit_
    ) Owned(msg.sender) {
        asset = ERC20(asset_);
        rewardRecipient = rewardRecipient_;
        DIVISOR = 10**asset.decimals(); // Even if decimals() changes later this will still work fine
        minBalanceToTriggerDeposit = minBalanceToTriggerDeposit_;
    }

    function setRewardRecipient(address _rewardRecipient) external onlyOwner() {
        rewardRecipient = _rewardRecipient;
    }

    function setMinBalanceToTriggerDeposit(uint _minBalanceToTriggerDeposit) external onlyOwner() {
        minBalanceToTriggerDeposit = _minBalanceToTriggerDeposit;
    }

    // Why is this not caller-restricted?
    // - forceDeposit() can be triggered anyway by making a deposit that increases balance enough, and then withdrawing it
    // - redeem() doesn't support withdrawing money from both asset and vault, so in the case where the last user wants to withdraw
    //    and only 50% of money is in the vault, owner could increase minBalanceToTriggerDeposit to max to prevent new vault deposits
    //    and prevent the user from getting the money, asking for a ransom. With this method user can simply call this to solve the situation
    function triggerDeposit(uint maxToPull) external {
        forceDepositAndCheck(asset.balanceOf(address(this)), msg.sender, maxToPull);
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
    //   so to greatly reduce gas costs and amortize them among all users we've implemented a yield buffer
    //   When new coins are deposited they'll be simply stored in the contract, with no extra gas costs,
    //   then, when enough coins accumulate (or when we trigger it), all coins will be moved to the yield vault, thus aggregating all these user deposits
    //   into a single large deposit for which we pay O(1) gas, thus amortizing costs.
    //   This means that some money will sit idle and not earn any yield, but thats ok because we can set an upper bound and make it a small % of total TVL.
    //   The min balance to trigger a deposit is configurable by owner so we can change it depending on gas costs, yield APYs and contract activity.
    //   This also applies for withdrawals, if we have enough money in the buffer we'll just use that so we don't have to pull money from vault
    function deposit(uint256 assets, uint256 amountPerCycle) internal returns (uint shares, uint cycles) {
        uint assetBalance = asset.balanceOf(address(this));
        uint newTotalAssets;
        require(minBalanceToTriggerDeposit < type(uint256).max, "paused"); // this only pauses new deposits, users can still withdraw all their money
        if(assetBalance > minBalanceToTriggerDeposit){
            // Handle cases where totalAssets() drops after a deposit into yield source
            uint oldTotalAssets = totalAssets();
            forceDeposit(assetBalance);
            newTotalAssets = totalAssets();
            if(newTotalAssets < oldTotalAssets){
                assets -= oldTotalAssets-newTotalAssets;
            }
        } else {
            newTotalAssets = totalAssets();
        }
        cycles = assets/amountPerCycle;
        shares = totalSupply == 0 ? assets : assets.mulDivDown(totalSupply, newTotalAssets - assets);
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