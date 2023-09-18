pragma solidity ^0.8.19;

import {ERC20} from "solmate/tokens/ERC20.sol";
import {ERC4626} from "solmate/mixins/ERC4626.sol";
import {SafeTransferLib} from "solmate/utils/SafeTransferLib.sol";

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

contract YearnERC4626 is ERC4626 {
    using SafeTransferLib for ERC20;

    Yearn public immutable vault;
    address public immutable rewardRecipient;
    StakingRewards public immutable stakingRewards;
    ERC20 public immutable rewardsToken;
    uint public immutable MULTIPLIER;

    constructor(
        ERC20 asset_,
        Yearn vault_,
        address rewardRecipient_,
        StakingRewards stakingRewards_
    ) ERC4626(asset_, _vaultName(asset_), _vaultSymbol(asset_)) {
        asset = asset_;
        vault = vault_;
        rewardRecipient = rewardRecipient_;
        stakingRewards = stakingRewards_;
        rewardsToken = ERC20(stakingRewards.rewardsToken());
        MULTIPLIER = 10**asset.decimals();
    }

    function _vaultName(ERC20 asset_) internal view virtual returns (string memory vaultName) {
        vaultName = string.concat("ERC4626-Wrapped Yearn ", asset_.symbol());
    }

    function _vaultSymbol(ERC20 asset_) internal view virtual returns (string memory vaultSymbol) {
        vaultSymbol = string.concat("y", asset_.symbol());
    }

    function claimRewards() external {
        stakingRewards.getReward();
    }

    function sendRewards(uint amount) external {
        rewardsToken.transfer(rewardRecipient, amount);
    }

    function afterDeposit(uint256 assets, uint256 /*shares*/ ) internal virtual override {
        asset.safeApprove(address(vault), assets);
        uint shares = vault.deposit(assets);
        vault.approve(address(stakingRewards), shares);
        stakingRewards.stake(shares);
    }

    function beforeWithdraw(uint256 assets, uint256 /*shares*/ ) internal virtual override {
        stakingRewards.withdraw((assets*MULTIPLIER)/vault.pricePerShare());
        vault.withdraw(assets, address(this));
    }

    function totalAssets() public view virtual override returns (uint256) {
        return stakingRewards.balanceOf(address(this)) * vault.pricePerShare();
    }

    function redeem(uint256 shares, address receiver, address owner) public virtual override returns (uint256 assets) {
        if (msg.sender != owner) {
            uint256 allowed = allowance[owner][msg.sender]; // Saves gas for limited approvals.

            if (allowed != type(uint256).max) {
                allowance[owner][msg.sender] = allowed - shares;
            }
        }

        // Check for rounding error since we round down in previewRedeem.
        require((assets = previewRedeem(shares)) != 0, "ZERO_ASSETS");

        _burn(owner, shares);

        emit Withdraw(msg.sender, receiver, owner, assets, shares);

        stakingRewards.withdraw((assets*MULTIPLIER)/vault.pricePerShare());
        vault.withdraw(assets, receiver);
    }
}