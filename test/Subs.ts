import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { getSub, unsubscribeParams } from "./helpers"
import { tokenAddress, vaultAddress, whaleAddress, tokenYield, stakingRewards, fe, de, dd } from "./constats";



async function calculateSubBalance(sub: any, subs: any, currentTimestamp: number, vault: any, DIVISOR: bigint, periodDuration: number) {
  if (sub.expirationDate > currentTimestamp) {
    let [sharesAccumulator, currentPeriod] = await Promise.all([subs.sharesAccumulator(), subs.currentPeriod()])
    if (Number(currentPeriod) + periodDuration < currentTimestamp) {
      const shares = await vault.convertToShares(DIVISOR);
      sharesAccumulator += BigInt(Math.floor((currentTimestamp - Number(currentPeriod)) / periodDuration)) * shares;
    }
    const sharesPaid = ((sharesAccumulator - sub.accumulator) * sub.amountPerCycle) / (DIVISOR as any);
    const sharesLeft = sub.initialShares - sharesPaid;
    return sharesLeft < 0? 0n:vault.convertToAssets(sharesLeft)
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
    const shares = sub.initialShares - ((subsetAccumulator * (sub.amountPerCycle as bigint)) / DIVISOR)
    return shares < 0? 0n:vault.convertToAssets(shares);
  }
}

async function calculateAvailableToClaim(receiver: string, subs: any, currentTimestamp: number, vault: any, DIVISOR: bigint, periodDuration: number) {
  const receiverBalance = await subs.receiverBalances(receiver)
  const periodBoundary = currentTimestamp - periodDuration
  let balance = receiverBalance.balance;
  if(receiverBalance.lastUpdate <= periodBoundary && receiverBalance.lastUpdate != 0n){
    const periods = []
    for (let period = receiverBalance.lastUpdate; period <= periodBoundary; period += BigInt(periodDuration)) {
      periods.push(period)
    }
    const [currentSharePrice, periodShares, receiverAmountToExpire] = await Promise.all([
      vault.convertToShares(DIVISOR),
      Promise.all(periods.map(p => subs.sharesPerPeriod(p))),
      Promise.all(periods.map(p => subs.receiverAmountToExpire(receiver, p))),
    ])
    let amountPerPeriod = receiverBalance.amountPerPeriod;
    periodShares.forEach((shares, i) => {
      const finalShares = shares === 0n ? currentSharePrice : shares;
      amountPerPeriod -= receiverAmountToExpire[i];
      balance += BigInt(amountPerPeriod * finalShares) / DIVISOR;
    })
  }
  return balance
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

    const startTimestamp =  await time.latest()
    const Subs = await ethers.getContractFactory("Subs");
    const subs = await Subs.deploy(30*24*3600, vaultAddress, feeCollector.address, startTimestamp, feeCollector.address, stakingRewards, fe(17));

    const vault = new ethers.Contract(await subs.getAddress(),[
      //"function balanceOf(address account) external view returns (uint256)",
      "function convertToAssets(uint256 shares) external view returns (uint256)",
      "function convertToShares(uint256 assets) external view returns (uint256)"
    ], daiWhale)

    await token.approve(await subs.getAddress(), fe(1e6))

    return { subs, token, owner, subReceiver, feeCollector, daiWhale, vault, otherSubscriber, startTimestamp };
  }

  describe("Basic", function () {
    it("Should work", async function () {
      const { subs, daiWhale, subReceiver } = await loadFixture(deployFixture);
      const firstSub = await getSub(subs.connect(daiWhale).subscribe(subReceiver.address, fe(5e3), 12));
      await time.increase(30*24*3600);
      await subs.connect(daiWhale).unsubscribe(...unsubscribeParams(firstSub))
      await subs.connect(daiWhale).subscribe(subReceiver.address, fe(5e3), 0);
    });

    it("subscribeForNextPeriod", async function () {
      const { subs, daiWhale, subReceiver, token } = await loadFixture(deployFixture);
      await time.increase(3*24*3600);
      const prevBal = await token.balanceOf(daiWhale.address)
      const firstSub = await getSub(subs.connect(daiWhale).subscribeForNextPeriod(subReceiver.address, fe(5), 12), "NewDelayedSubscription");
      expect(prevBal - await token.balanceOf(daiWhale.address)).to.eq(fe(5*12));
      await time.increase(30*24*3600);
      await subs.connect(daiWhale).unsubscribe(...unsubscribeParams(firstSub))
      expect(prevBal - await token.balanceOf(daiWhale.address)).to.be.approximately(fe(5), 5);
      const prevBal2 = await token.balanceOf(daiWhale.address)
      const secondSub = await getSub(subs.connect(daiWhale).subscribeForNextPeriod(subReceiver.address, fe(12), 1), "NewDelayedSubscription");
      await subs.connect(daiWhale).unsubscribe(...unsubscribeParams(secondSub))
      expect(await token.balanceOf(daiWhale.address)).to.be.lessThanOrEqual(prevBal2);
      expect(await token.balanceOf(daiWhale.address) - prevBal2).to.be.above(-5);
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

    it("can pause deposits but not withdrawals", async function () {
      const { subs, daiWhale, subReceiver, token } = await loadFixture(deployFixture);
      const MAX_UINT = "115792089237316195423570985008687907853269984665640564039457584007913129639935"
      const sub = await getSub(subs.connect(daiWhale).subscribe(subReceiver.address, fe(5), 10));
      await subs.setMinBalanceToTriggerDeposit(MAX_UINT)
      await expect(subs.connect(daiWhale).setMinBalanceToTriggerDeposit(1)).to.be.revertedWith("UNAUTHORIZED")
      await expect(subs.connect(daiWhale).subscribe(subReceiver.address, fe(5), 10)).to.be.revertedWith("paused")
      await subs.connect(daiWhale).unsubscribe(...unsubscribeParams(sub))
      await subs.setMinBalanceToTriggerDeposit(fe(1000))
      await subs.connect(daiWhale).subscribe(subReceiver.address, fe(5), 10)
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
      expect((await subs.receiverBalances(feeCollector.address)).balance).to.be.approximately(fe(5e3*0.01), fe(1)); // 1% collected by feeCollector
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
      const yieldGenerated = 10*(1+tokenYield)**5 - 10
      expect(await token.balanceOf(subReceiver.address)).to.be.approximately(fe((610+yieldGenerated)*0.99), fe(0.1));
      expect(await subs.totalAssets()).to.be.approximately(0, 2);
      const receiverBalance = await subs.receiverBalances(subReceiver.address)
      expect(receiverBalance.balance).to.be.eq(0);
      expect(receiverBalance.amountPerPeriod).to.be.eq(fe(10));
      await time.increase(30*24*3600);
      await getSub(subs.connect(daiWhale).subscribe(subReceiver.address, fe(0.0001), 700));
      expect((await subs.receiverBalances(subReceiver.address)).amountPerPeriod).to.be.eq(fe(0.0001));
    });

    it("can claim right after currentPeriod changes", async function () {
      const { subs, daiWhale, subReceiver, token, vault, feeCollector, otherSubscriber } = await loadFixture(deployFixture);
      await time.increase(29*24*3600);
      const whaleSub = await getSub(subs.connect(daiWhale).subscribe(subReceiver.address, fe(13), 7));
      await time.increase(2*24*3600);
      await subs.connect(subReceiver).claim(fe(13.1));
    })

    it("unsub after sub has expired", async function () {
    })

    it("cant unsub twice", async function () {
      const { subs, daiWhale, subReceiver } = await loadFixture(deployFixture);
      const whaleSub = await getSub(subs.connect(daiWhale).subscribe(subReceiver.address, fe(13), 7));
      await subs.connect(daiWhale).unsubscribe(...unsubscribeParams(whaleSub))
      await expect(subs.connect(daiWhale).unsubscribe(...unsubscribeParams(whaleSub))).to.be.reverted
    })

    it("claim correctly discounts expirations", async function () {
    })

    it("receiver earns yield", async function () {
    })

    it("share prices are tracked properly (test with wild swings)", async function () {
    })

    it("actions at time boundaries behave properly", async function () {
      const { subs, daiWhale, subReceiver, startTimestamp, token, vault } = await loadFixture(deployFixture);
      const periodDuration = Number(await subs.periodDuration())
      const prevBal1 = await token.balanceOf(daiWhale.address)
      await time.increaseTo(startTimestamp+periodDuration-1)
      const sub = await getSub(subs.connect(daiWhale).subscribe(subReceiver.address, fe(13), 7));
      expect(await token.balanceOf(daiWhale.address) - prevBal1).to.be.eq(-fe(91))
      expect((await subs.receiverBalances(subReceiver.address)).balance).to.eq(0)
      await time.increaseTo(startTimestamp+periodDuration*7-1)
      {
        const prevBal = await token.balanceOf(daiWhale.address)
        await subs.connect(daiWhale).unsubscribe(...unsubscribeParams(sub))
        expect(await token.balanceOf(daiWhale.address) - prevBal).to.be.approximately(fe(13), 2)
      }
      {
        await time.increaseTo(startTimestamp+periodDuration*9)
        const prevBal = await token.balanceOf(subReceiver.address)
        await subs.connect(subReceiver).claim(await calculateAvailableToClaim(subReceiver.address, subs, await time.latest(), vault, fe(1), periodDuration))
        expect((await subs.receiverBalances(subReceiver.address)).balance).to.eq(0)
        expect(await token.balanceOf(subReceiver.address) - prevBal).to.be.approximately(fe(13*6*0.99), fe(0.01))
      }
    })

    it("actions at time boundaries behave properly (expiration - 1s)", async function () {
      const { subs, daiWhale, subReceiver, startTimestamp, token, vault } = await loadFixture(deployFixture);
      const periodDuration = Number(await subs.periodDuration())
      const prevBal1 = await token.balanceOf(daiWhale.address)
      await time.increaseTo(startTimestamp+periodDuration-1)
      const sub = await getSub(subs.connect(daiWhale).subscribe(subReceiver.address, fe(13), 7));
      expect(await token.balanceOf(daiWhale.address) - prevBal1).to.be.eq(-fe(91))
      expect((await subs.receiverBalances(subReceiver.address)).balance).to.eq(0)
      await time.increaseTo(startTimestamp+periodDuration*7-2)
      {
        const prevBal = await token.balanceOf(daiWhale.address)
        await subs.connect(daiWhale).unsubscribe(...unsubscribeParams(sub))
        expect(await token.balanceOf(daiWhale.address) - prevBal).to.be.approximately(fe(13), 2)
      }
      {
        await time.increaseTo(startTimestamp+periodDuration*9)
        const prevBal = await token.balanceOf(subReceiver.address)
        await subs.connect(subReceiver).claim(await calculateAvailableToClaim(subReceiver.address, subs, await time.latest(), vault, fe(1), periodDuration))
        expect((await subs.receiverBalances(subReceiver.address)).balance).to.eq(0)
        expect(await token.balanceOf(subReceiver.address) - prevBal).to.be.approximately(fe(13*6*0.99), fe(0.01))
      }
    })

    it("actions at time boundaries behave properly (expiration + 1s)", async function () {
      const { subs, daiWhale, subReceiver, startTimestamp, token, vault } = await loadFixture(deployFixture);
      const periodDuration = Number(await subs.periodDuration())
      const prevBal1 = await token.balanceOf(daiWhale.address)
      await time.increaseTo(startTimestamp+periodDuration-1)
      const sub = await getSub(subs.connect(daiWhale).subscribe(subReceiver.address, fe(13), 7));
      expect(await token.balanceOf(daiWhale.address) - prevBal1).to.be.eq(-fe(91))
      expect((await subs.receiverBalances(subReceiver.address)).balance).to.eq(0)
      await time.increaseTo(startTimestamp+periodDuration*7)
      {
        const prevBal = await token.balanceOf(daiWhale.address)
        await subs.connect(daiWhale).unsubscribe(...unsubscribeParams(sub))
        expect(await token.balanceOf(daiWhale.address) - prevBal).to.be.approximately(fe(0), 1)
      }
      {
        await time.increaseTo(startTimestamp+periodDuration*9)
        const prevBal = await token.balanceOf(subReceiver.address)
        await subs.connect(subReceiver).claim(await calculateAvailableToClaim(subReceiver.address, subs, await time.latest(), vault, fe(1), periodDuration))
        expect((await subs.receiverBalances(subReceiver.address)).balance).to.eq(0)
        expect(await token.balanceOf(subReceiver.address) - prevBal).to.be.approximately(fe(13*7*0.99), fe(0.01))
      }
    })

    it("amount instantly pulled is correct when periodDuration is 5mins", async function () {
      const periodDuration = 5*60
      const { daiWhale, subReceiver, token, feeCollector } = await loadFixture(deployFixture);
      const start = await time.latest()
      const Subs = await ethers.getContractFactory("Subs");
      const subs = await Subs.deploy(periodDuration, vaultAddress, feeCollector.address, start, feeCollector.address, stakingRewards, fe(50));
      await token.approve(await subs.getAddress(), fe(1e6))
      for(let i=1; i<20; i++){
        await time.increaseTo(start + i*periodDuration*2); // restart to beginning of period
        const increase = Math.round(Math.random()*periodDuration)
        await time.increase(increase);
        const prevBal = await token.balanceOf(daiWhale.address)
        await subs.connect(daiWhale).subscribe(subReceiver.address, fe(10), 0)
        const postBal = await token.balanceOf(daiWhale.address)
        expect(prevBal-postBal).to.be.approximately((fe(10)*BigInt(periodDuration-increase))/BigInt(periodDuration), 
          (fe(10)*5n)/BigInt(periodDuration)) // 5s of leeway
      }
    })

    it("balance through months", async function () {
      const { subs, daiWhale, subReceiver, token, vault } = await loadFixture(deployFixture);
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
      if(tokenYield > 0){
        const prevBal = await token.balanceOf(daiWhale.address)
        await subs.connect(daiWhale).unsubscribe(...unsubscribeParams(whaleSub))
        const postBal = await token.balanceOf(daiWhale.address)
        console.log("final", de(postBal - prevBal))
      }
    })

    it("calculateAvailableToClaim()", async function () {
      const { subs, daiWhale, subReceiver, token, vault, feeCollector, otherSubscriber } = await loadFixture(deployFixture);
      const DIVISOR = fe(1)
      expect(await calculateAvailableToClaim(subReceiver.address, subs, await time.latest(), vault, DIVISOR, 30*24*3600)).to.be.eq(0)
      await time.increase(29*24*3600);
      await getSub(subs.connect(daiWhale).subscribe(subReceiver.address, fe(13), 7));
      let expectedClaimable = 0n
      for(let i=0; i<14; i++){
        const claimable = await vault.convertToAssets(await calculateAvailableToClaim(subReceiver.address, subs, await time.latest(), vault, DIVISOR, 30*24*3600))
        console.log(dd(await time.latest()), de(claimable))
        expect(claimable).to.be.approximately(expectedClaimable, fe(1))
        await time.increase(30*24*3600);
        expectedClaimable += i<7?fe(13):0n
      }
      const prevBal = await token.balanceOf(subReceiver.address)
      await subs.connect(subReceiver).claim(await calculateAvailableToClaim(subReceiver.address, subs, await time.latest(), vault, DIVISOR, 30*24*3600))
      const postBal = await token.balanceOf(subReceiver.address)
      console.log("final", de(postBal - prevBal))
      expect((await subs.receiverBalances(subReceiver.address)).balance).to.be.eq(0)
      expect(await calculateAvailableToClaim(subReceiver.address, subs, await time.latest(), vault, DIVISOR, 30*24*3600)).to.be.eq(0)
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
      otherSubBalance += -3*13 + (91)*tokenYield*3/12
      expect(await calculateSubBalance(otherSub, subs, await time.latest(), vault, fe(1), 30*24*3600)).to.be.approximately(fe(otherSubBalance), fe(0.1))
      await subs.connect(subReceiver).claim((await subs.receiverBalances(subReceiver.address)).balance);
      expect((await subs.receiverBalances(subReceiver.address)).balance).to.be.eq(0)
      const firstBal = await token.balanceOf(subReceiver.address)
      expect(firstBal).to.be.approximately(fe(7*5+13*3), fe(1))
      await time.increase(1*30*24*3600);
      otherSubBalance += -1*13 + (otherSubBalance)*tokenYield*1/12
      expect(await calculateSubBalance(otherSub, subs, await time.latest(), vault, fe(1), 30*24*3600)).to.be.approximately(fe(otherSubBalance), fe(0.1))
      await subs.connect(daiWhale).unsubscribe(...unsubscribeParams(whaleSub))
      await time.increase(10*30*24*3600);
      otherSubBalance += -3*13 + (otherSubBalance)*tokenYield*10/12
      expect(await calculateSubBalance(otherSub, subs, await time.latest(), vault, fe(1), 30*24*3600)).to.be.approximately(fe(otherSubBalance), fe(0.1))
      await subs.connect(subReceiver).claim(fe(0.01));
      await subs.connect(subReceiver).claim((await subs.receiverBalances(subReceiver.address)).balance);
      const secondBal = await token.balanceOf(subReceiver.address)
      expect(secondBal-firstBal).to.be.approximately(fe(7*1+13*4), fe(1))
      const prevOtherBal = await token.balanceOf(otherSubscriber.address)
      await subs.connect(otherSubscriber).unsubscribe(...unsubscribeParams(otherSub))
      expect(await token.balanceOf(otherSubscriber.address)-prevOtherBal).to.be.approximately(fe(otherSubBalance), fe(0.1))
      if(tokenYield > 0){
        expect(otherSubBalance).to.be.above(1.2)
        expect(otherSubBalance).to.be.below(1.6)
      }
      expect((await subs.receiverBalances(await subs.getAddress())).balance).to.be.approximately(0, 4)
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
});
