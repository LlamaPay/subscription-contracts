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

const usdcAddress = mainnet?'-':'0x7f5c764cbc14f9669b88837ca1490cca17c31607'
const usdcVault = mainnet?'-':'0x6E6699E4B8eE4Bf35E72a41fe366116ff4C5A3dF'

const fe = (n:number) => ethers.parseEther(n.toString())
const de = (n:bigint|any) => Number(n)/1e18

async function getSub(call: Promise<any>){
  return (await (await call).wait())?.logs.find((l:any)=>l.topics[0]==="0x75aabd19e348827dfa0d37beb9ada0c4ccaec489ee6d4f754b579b7722f210bc").args
}

function unsubscribeParams(sub:any){
  return [sub.initialPeriod, sub.expirationDate, sub.amountPerCycle, sub.receiver, sub.accumulator, sub.initialShares] as [any, any, any, any, any, any]
}

const dd = (n:any) => new Date(Number(n) * 1e3).toISOString().split('T')[0]

async function displayTimes(subs:any, time:any){
  console.log(dd(await subs.currentPeriod()), dd(await time.latest()))
}

async function calculateSubBalance(sub: any, subs: any, currentTimestamp: number, vault: any, DIVISOR: bigint, periodDuration: number) {
  if (sub.expirationDate > currentTimestamp) {
    let [sharesAccumulator, currentPeriod] = await Promise.all([subs.sharesAccumulator(), subs.currentPeriod()])
    if (Number(currentPeriod) + periodDuration < currentTimestamp) {
      const shares = await vault.convertToShares(DIVISOR);
      sharesAccumulator += BigInt(Math.floor((currentTimestamp - Number(currentPeriod)) / periodDuration)) * shares;
    }
    const sharesPaid = ((sharesAccumulator - sub.accumulator) * sub.amountPerCycle) / (DIVISOR as any);
    const sharesLeft = sub.initialShares - sharesPaid;
    return vault.convertToAssets(sharesLeft)
  } else {
    const periods = []
    for (let period = sub.initialPeriod; period < sub.expirationDate; period += BigInt(periodDuration)) {
      periods.push(period)
    }
    const [currentSharePrice, ...periodShares] = await Promise.all([
      vault.convertToShares(DIVISOR),
      ...periods.map(p => subs.sharesPerPeriod(p))
    ])
    let subsetAccumulator = 0n;
    periodShares.forEach((shares) => {
      subsetAccumulator += shares === 0n ? currentSharePrice : shares;
    })
    return vault.convertToAssets(sub.initialShares - ((subsetAccumulator * (sub.amountPerCycle as bigint)) / DIVISOR));
  }
}

describe("Subs", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, subReceiver, feeCollector, otherSubscriber] = await ethers.getSigners();
    const daiWhale = await ethers.getImpersonatedSigner(whaleAddress);
    const token = new ethers.Contract(tokenAddress,[
        "function balanceOf(address account) external view returns (uint256)",
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function transfer(address spender, uint256 amount) external returns (bool)"
    ], daiWhale)
    const vault = new ethers.Contract(vaultAddress,[
      "function balanceOf(address account) external view returns (uint256)",
      "function convertToAssets(uint256 shares) external view returns (uint256)",
      "function convertToShares(uint256 assets) external view returns (uint256)"
    ], daiWhale)

    const Subs = await ethers.getContractFactory("Subs");
    const subs = await Subs.deploy(30*24*3600, tokenAddress, vaultAddress, feeCollector.address, fe(1), await time.latest());

    await token.approve(await subs.getAddress(), fe(1e6))

    return { subs, token, owner, subReceiver, feeCollector, daiWhale, vault, otherSubscriber };
  }

  async function deployUsdcFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, subReceiver, feeCollector, otherSubscriber] = await ethers.getSigners();
    const daiWhale = await ethers.getImpersonatedSigner(whaleAddress);
    const token = new ethers.Contract(usdcAddress,[
        "function balanceOf(address account) external view returns (uint256)",
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function transfer(address spender, uint256 amount) external returns (bool)"
    ], daiWhale)
    const vault = new ethers.Contract(usdcVault,[
      "function balanceOf(address account) external view returns (uint256)",
      "function convertToAssets(uint256 shares) external view returns (uint256)",
      "function convertToShares(uint256 assets) external view returns (uint256)"
    ], daiWhale)

    const Subs = await ethers.getContractFactory("Subs");
    const subs = await Subs.deploy(30*24*3600, usdcAddress, usdcVault, feeCollector.address, 1e6, await time.latest());

    await token.approve(await subs.getAddress(), fe(1e6))

    return { subs, token, owner, subReceiver, feeCollector, daiWhale, vault, otherSubscriber };
  }

  describe("Basic", function () {
    it("Should work", async function () {
      const { subs, daiWhale, subReceiver } = await loadFixture(deployFixture);
      const firstSub = await getSub(subs.connect(daiWhale).subscribe(subReceiver.address, fe(5e3), 12));
      await time.increase(30*24*3600);
      await subs.connect(daiWhale).unsubscribe(...unsubscribeParams(firstSub))
      await subs.connect(daiWhale).subscribe(subReceiver.address, fe(5e3), 0);
    });

    it("Should reduce funds", async function () {
      const { subs, daiWhale, subReceiver, token } = await loadFixture(deployFixture);
      const prevBal = await token.balanceOf(daiWhale.address)
      const sub = await getSub(subs.connect(daiWhale).subscribe(subReceiver.address, fe(5e3), 12));

      const diff = prevBal - await token.balanceOf(daiWhale.address)
      expect(diff).to.be.approximately(fe(5e3*13), fe(1));

      await subs.connect(daiWhale).unsubscribe(...unsubscribeParams(sub))
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
      await subs.connect(daiWhale).unsubscribe(...unsubscribeParams(sub))
      expect(await token.balanceOf(daiWhale.address)).to.be.greaterThan(prevBal);

      expect(await token.balanceOf(subReceiver.address)).to.be.eq(0);
      await subs.connect(subReceiver).claim(fe(1)); // update balances info
      await subs.connect(subReceiver).claim((await subs.receiverBalances(subReceiver.address)).balance)
      expect(await token.balanceOf(subReceiver.address)).to.be.approximately(fe(600*0.99+10), fe(1));
      const receiverBalance = await subs.receiverBalances(subReceiver.address)
      expect(receiverBalance.balance).to.be.eq(0);
      expect(receiverBalance.amountPerPeriod).to.be.eq(fe(10));
      await time.increase(30*24*3600);
      await getSub(subs.connect(daiWhale).subscribe(subReceiver.address, fe(0.0001), 700));
      expect((await subs.receiverBalances(subReceiver.address)).amountPerPeriod).to.be.eq(fe(0.0001));
    });

    it("unsub after sub has expired", async function () {
    })

    it("claim correctly discounts expirations", async function () {
    })

    it("works well with tokens that have different decimals", async function () {
    })

    it("receiver earns yield", async function () {
    })

    it("share prices are tracked properly (testing with wild swings)", async function () {
    })

    it("balance through months", async function () {
      const { subs, daiWhale, subReceiver, token, vault, feeCollector, otherSubscriber } = await loadFixture(deployFixture);
      await time.increase(29*24*3600);
      const whaleSub = await getSub(subs.connect(daiWhale).subscribe(subReceiver.address, fe(13), 7));
      for(let i=0; i<14; i++){
        console.log(dd(await time.latest()), de(await calculateSubBalance(whaleSub, subs, await time.latest(), vault, fe(1), 30*24*3600)))
        await time.increase(30*24*3600);
      }
      console.log("global update")
      await subs.connect(subReceiver).claim(fe(0.01));
      for(let i=0; i<5; i++){
        console.log(dd(await time.latest()), de(await calculateSubBalance(whaleSub, subs, await time.latest(), vault, fe(1), 30*24*3600)))
        await time.increase(30*24*3600);
      }
      const prevBal = await token.balanceOf(daiWhale.address)
      await subs.connect(daiWhale).unsubscribe(...unsubscribeParams(whaleSub))
      const postBal = await token.balanceOf(daiWhale.address)
      console.log("final", de(postBal - prevBal))
    })

    it("2 subscribers + refreshApproval", async function () {
      const { subs, daiWhale, subReceiver, token, vault, feeCollector, otherSubscriber } = await loadFixture(deployFixture);
      await time.increase(29*24*3600);
      const whaleSub = await getSub(subs.connect(daiWhale).subscribe(subReceiver.address, fe(7), 10));
      await time.increase(2*30*24*3600);
      await subs.refreshApproval();

      await token.transfer(otherSubscriber.address, fe(1e3))
      const token2 = new ethers.Contract(tokenAddress,[
        "function balanceOf(address account) external view returns (uint256)",
        "function approve(address spender, uint256 amount) external returns (bool)"
      ], otherSubscriber)
      await token2.approve(await subs.getAddress(), fe(1e3))
      const otherSub = await getSub(subs.connect(otherSubscriber).subscribe(subReceiver.address, fe(13), 7));
      let otherSubBalance = 91
      expect(await calculateSubBalance(otherSub, subs, await time.latest(), vault, fe(1), 30*24*3600)).to.be.approximately(fe(otherSubBalance), fe(0.1))
      //expect((await subs.receiverBalances(subReceiver.address)).balance).to.be.approximately(fe(14), fe(0))


      await time.increase(3*30*24*3600);
      await subs.connect(subReceiver).claim(fe(0.01));
      otherSubBalance += -3*13 + (91)*0.02*3/12
      expect(await calculateSubBalance(otherSub, subs, await time.latest(), vault, fe(1), 30*24*3600)).to.be.approximately(fe(otherSubBalance), fe(0.1))
      await subs.connect(subReceiver).claim((await subs.receiverBalances(subReceiver.address)).balance);
      expect((await subs.receiverBalances(subReceiver.address)).balance).to.be.eq(0)
      const firstBal = await token.balanceOf(subReceiver.address)
      expect(firstBal).to.be.approximately(fe(7*5+13*3), fe(1))
      await time.increase(1*30*24*3600);
      otherSubBalance += -1*13 + (otherSubBalance)*0.02*1/12
      expect(await calculateSubBalance(otherSub, subs, await time.latest(), vault, fe(1), 30*24*3600)).to.be.approximately(fe(otherSubBalance), fe(0.1))
      await subs.connect(daiWhale).unsubscribe(...unsubscribeParams(whaleSub))
      await time.increase(10*30*24*3600);
      otherSubBalance += -3*13 + (otherSubBalance)*0.02*10/12
      expect(await calculateSubBalance(otherSub, subs, await time.latest(), vault, fe(1), 30*24*3600)).to.be.approximately(fe(otherSubBalance), fe(0.1))
      await subs.connect(subReceiver).claim(fe(0.01));
      await subs.connect(subReceiver).claim((await subs.receiverBalances(subReceiver.address)).balance);
      const secondBal = await token.balanceOf(subReceiver.address)
      expect(secondBal-firstBal).to.be.approximately(fe(7*1+13*4), fe(1))
      const prevOtherBal = await token.balanceOf(otherSubscriber.address)
      await subs.connect(otherSubscriber).unsubscribe(...unsubscribeParams(otherSub))
      expect(await token.balanceOf(otherSubscriber.address)-prevOtherBal).to.be.approximately(fe(1.2), fe(0.1))
      expect(await vault.balanceOf(await subs.getAddress())).to.be.approximately(0, 4)
      await time.increase(5*30*24*3600);
      await expect(subs.connect(subReceiver).claim(fe(0.01))).to.be.reverted
    })


    it("claim after 2 periods", async function () {
      const { subs, daiWhale, subReceiver, token, vault, feeCollector } = await loadFixture(deployFixture);
      await subs.connect(daiWhale).subscribe(subReceiver.address, fe(1), 0);
      await time.increase(2*30*24*3600);
      await subs.connect(subReceiver).claim(fe(0.9));
    })

    it("max out _updateGlobal gas", async function () {
      const { subs, daiWhale, subReceiver, token, vault, feeCollector } = await loadFixture(deployFixture);
      await subs.connect(daiWhale).subscribe(subReceiver.address, fe(1), 0);
      const cycles = 500
      await time.increase(cycles*30*24*3600);
      const rec = await subs.connect(daiWhale).subscribe(subReceiver.address, fe(1), 0)
      expect((await rec.wait())?.gasUsed).to.be.lessThan(15e6) // 15M is the block limit
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
