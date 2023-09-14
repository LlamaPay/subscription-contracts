import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";

const tokenAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F'

const fe = (n:number) => ethers.parseEther(n.toString())

describe("Subs", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployFixture() {
    //const unlockTime = (await time.latest()) + ONE_YEAR_IN_SECS;

    // Contracts are deployed using the first signer/account by default
    const [owner, subReceiver, feeCollector] = await ethers.getSigners();
    const daiWhale = await ethers.getImpersonatedSigner("0x075e72a5edf65f0a5f44699c7654c1a76941ddc8");
    const token = new ethers.Contract(tokenAddress,
        ["function balanceOf(address account) external view returns (uint256)",
        "function approve(address spender, uint256 amount) external returns (bool)"
    ], daiWhale)

    const Subs = await ethers.getContractFactory("Subs");
    const subs = await Subs.deploy(30*24*3600, tokenAddress, '0x83F20F44975D03b1b09e64809B757c47f942BEeA', feeCollector.address, fe(1));

    await token.approve(await subs.getAddress(), fe(1e6))

    return { subs, token, owner, subReceiver, feeCollector, daiWhale };
  }

  describe("Deployment", function () {
    it("Should work", async function () {
      const { subs, daiWhale, subReceiver } = await loadFixture(deployFixture);
      await subs.subscribe(subReceiver.address, fe(5e3), 12);
      await time.increaseTo(await time.latest() + 30*24*3600);
      //await subs.unsubscribe()
    });

    it("Should reduce funds", async function () {
      const { subs, daiWhale, subReceiver, token } = await loadFixture(deployFixture);
      const prevBal = await token.balanceOf(daiWhale.address)
      await subs.subscribe(subReceiver.address, fe(5e3), 12);

      expect(prevBal - await token.balanceOf(daiWhale.address)).to.equal(fe(5e3*12));
    });
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
