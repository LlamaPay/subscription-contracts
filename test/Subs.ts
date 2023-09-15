import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";

const mainnet = false
const tokenAddress = mainnet?'0x6B175474E89094C44Da98b954EedeAC495271d0F':'0xda10009cbd5d07dd0cecc66161fc93d7c9000da1'
const vaultAddress = mainnet?'0x83F20F44975D03b1b09e64809B757c47f942BEeA':'0x85c6Cd5fC71AF35e6941d7b53564AC0A68E09f5C' // sDAI : 4626 aDAI
const whaleAddress = mainnet?'0x075e72a5edf65f0a5f44699c7654c1a76941ddc8':'0x9cd4ff80d81e4dda8e9d637887a5db7e0c8e007b'

const fe = (n:number) => ethers.parseEther(n.toString())

async function getSub(call: Promise<any>){
  return (await (await call).wait())?.logs.find((l:any)=>l.topics[0]==="0x75aabd19e348827dfa0d37beb9ada0c4ccaec489ee6d4f754b579b7722f210bc").args
}

describe("Subs", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployFixture() {
    //const unlockTime = (await time.latest()) + ONE_YEAR_IN_SECS;

    // Contracts are deployed using the first signer/account by default
    const [owner, subReceiver, feeCollector] = await ethers.getSigners();
    const daiWhale = await ethers.getImpersonatedSigner(whaleAddress);
    const token = new ethers.Contract(tokenAddress,
        ["function balanceOf(address account) external view returns (uint256)",
        "function approve(address spender, uint256 amount) external returns (bool)"
    ], daiWhale)
    const vault = new ethers.Contract(vaultAddress,
      ["function balanceOf(address account) external view returns (uint256)",
      "function convertToAssets(uint256 shares) external view returns (uint256)",
      "function convertToShares(uint256 assets) external view returns (uint256)"
    ], daiWhale)

    const Subs = await ethers.getContractFactory("Subs");
    const subs = await Subs.deploy(30*24*3600, tokenAddress, vaultAddress, feeCollector.address, fe(1), await time.latest());

    await token.approve(await subs.getAddress(), fe(1e6))

    return { subs, token, owner, subReceiver, feeCollector, daiWhale, vault };
  }

  describe("Basic", function () {
    it("Should work", async function () {
      const { subs, daiWhale, subReceiver } = await loadFixture(deployFixture);
      const firstSub = await getSub(subs.connect(daiWhale).subscribe(subReceiver.address, fe(5e3), 12));
      await time.increase(30*24*3600);
      await subs.connect(daiWhale).unsubscribe(firstSub.initialPeriod, firstSub.expirationDate, firstSub.amountPerCycle, firstSub.receiver, firstSub.accumulator, firstSub.initialShares)
      await subs.connect(daiWhale).subscribe(subReceiver.address, fe(5e3), 0);
    });

    it("Should reduce funds", async function () {
      const { subs, daiWhale, subReceiver, token } = await loadFixture(deployFixture);
      const prevBal = await token.balanceOf(daiWhale.address)
      const sub = await getSub(subs.connect(daiWhale).subscribe(subReceiver.address, fe(5e3), 12));

      const diff = prevBal - await token.balanceOf(daiWhale.address)
      expect(diff).to.be.approximately(fe(5e3*13), fe(1));

      await subs.connect(daiWhale).unsubscribe(sub.initialPeriod, sub.expirationDate, sub.amountPerCycle, sub.receiver, sub.accumulator, sub.initialShares)
      expect(prevBal - await token.balanceOf(daiWhale.address)).to.be.approximately(fe(5e3), fe(1));
    });

    it("should charge 30% while in 70% of the month", async function () {
      const { subs, daiWhale, subReceiver, token } = await loadFixture(deployFixture);
      await time.increase(30*24*3600*0.7);
      const prevBal = await token.balanceOf(daiWhale.address)
      const sub = await getSub(subs.connect(daiWhale).subscribe(subReceiver.address, fe(5e3), 0));

      const diff = prevBal - await token.balanceOf(daiWhale.address)
      expect(diff).to.be.approximately(fe(5e3*0.3), fe(1));
    });

    it("receiver & feeCollector gets funds properly", async function () {
      const { subs, daiWhale, subReceiver, token, vault, feeCollector } = await loadFixture(deployFixture);
      await subs.connect(daiWhale).subscribe(subReceiver.address, fe(5e3), 12);
      console.log(await subs.currentPeriod(), await time.latest(), await time.latest() - Number(await subs.currentPeriod()))
      const shares = await vault.convertToShares(fe(5e3))
      const receiverSharesBalance = (await subs.receiverBalances(subReceiver.address)).balance
      expect(receiverSharesBalance).to.be.approximately(shares, fe(1));
      await subs.connect(subReceiver).claim(receiverSharesBalance)
      expect(await token.balanceOf(subReceiver.address)).to.be.approximately(fe(5e3*0.99), fe(1));
      expect(await vault.balanceOf(feeCollector.address)).to.be.approximately(fe(5e3*0.01), fe(1)); // 1% collected by feeCollector
    });

    it("if yield is higher than costs, user doesnt lose money", async function () {
      const { subs, daiWhale, subReceiver, token, vault, feeCollector } = await loadFixture(deployFixture);
      const prevBal = await token.balanceOf(daiWhale.address)
      const sub = await getSub(subs.connect(daiWhale).subscribe(subReceiver.address, fe(10), 700)); // yield is 2%

      const diff = prevBal - await token.balanceOf(daiWhale.address)
      expect(diff).to.be.approximately(fe(7010), fe(1));

      await time.increase(365*24*3600*5); // 5yr
      await subs.connect(daiWhale).unsubscribe(sub.initialPeriod, sub.expirationDate, sub.amountPerCycle, sub.receiver, sub.accumulator, sub.initialShares)
      expect(await token.balanceOf(daiWhale.address)).to.be.greaterThan(prevBal);

      expect(await token.balanceOf(subReceiver.address)).to.be.eq(0);
      await subs.connect(subReceiver).claim(fe(1)); // update balances info
      await subs.connect(subReceiver).claim((await subs.receiverBalances(subReceiver.address)).balance)
      expect(await token.balanceOf(subReceiver.address)).to.be.approximately(fe(600*0.99+10), fe(1));
      const receiverBalance = await subs.receiverBalances(subReceiver.address)
      expect(receiverBalance.balance).to.be.eq(0);
      expect(receiverBalance.amountPerPeriod).to.be.eq(0);
    });

    it("unsub after sub has expired", async function () {
    })

    it("claim correctly discounts expirations", async function () {
    })

    it("works well with tokens that have different decimals", async function () {
    })
  });
/*
  describe("Withdrawals", function () {
    describe("Validations", function () {
      it("Should revert with the right error if called too soon", async function () {
        const { lock } = await loadFixture(deployOneYearLockFixture);

        await expect(lock.withdraw()).to.be.revertedWith(
          "You can't withdraw yet"
        );
      });

      it("Should revert with the right error if called from another account", async function () {
        const { lock, unlockTime, otherAccount } = await loadFixture(
          deployOneYearLockFixture
        );

        // We can increase the time in Hardhat Network
        await time.increaseTo(unlockTime);

        // We use lock.connect() to send a transaction from another account
        await expect(lock.connect(otherAccount).withdraw()).to.be.revertedWith(
          "You aren't the owner"
        );
      });

      it("Shouldn't fail if the unlockTime has arrived and the owner calls it", async function () {
        const { lock, unlockTime } = await loadFixture(
          deployOneYearLockFixture
        );

        // Transactions are sent using the first signer by default
        await time.increaseTo(unlockTime);

        await expect(lock.withdraw()).not.to.be.reverted;
      });
    });

    describe("Events", function () {
      it("Should emit an event on withdrawals", async function () {
        const { lock, unlockTime, lockedAmount } = await loadFixture(
          deployOneYearLockFixture
        );

        await time.increaseTo(unlockTime);

        await expect(lock.withdraw())
          .to.emit(lock, "Withdrawal")
          .withArgs(lockedAmount, anyValue); // We accept any value as `when` arg
      });
    });

    describe("Transfers", function () {
      it("Should transfer the funds to the owner", async function () {
        const { lock, unlockTime, lockedAmount, owner } = await loadFixture(
          deployOneYearLockFixture
        );

        await time.increaseTo(unlockTime);

        await expect(lock.withdraw()).to.changeEtherBalances(
          [owner, lock],
          [lockedAmount, -lockedAmount]
        );
      });
    });
  });
  */
});
