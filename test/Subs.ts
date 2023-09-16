import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

// CHANGE THESE VARIABLES TO TEST WITH DIFFERENT VAULTS AND TOKENS WITH DIFFERENT DECIMALS
const mainnet = false
const useUSDC = true // Requires mainnet === false


const tokenAddress = mainnet?'0x6B175474E89094C44Da98b954EedeAC495271d0F':
  useUSDC?'0x7f5c764cbc14f9669b88837ca1490cca17c31607':'0xda10009cbd5d07dd0cecc66161fc93d7c9000da1'
const vaultAddress = mainnet?'0x83F20F44975D03b1b09e64809B757c47f942BEeA':
  useUSDC?'0x6E6699E4B8eE4Bf35E72a41fe366116ff4C5A3dF':'0x85c6Cd5fC71AF35e6941d7b53564AC0A68E09f5C' // sDAI : 4626 aDAI
const whaleAddress = mainnet?'0x075e72a5edf65f0a5f44699c7654c1a76941ddc8':
  useUSDC?'0x7f5c764cbc14f9669b88837ca1490cca17c31607':'0x9cd4ff80d81e4dda8e9d637887a5db7e0c8e007b'
const tokenYield = useUSDC?0.026:0.0209

const fe = (n:number) => ethers.parseUnits(n.toFixed(5), useUSDC?6:18)
const de = (n:bigint|any) => Number(n)/1e18
const dd = (n:any) => new Date(Number(n) * 1e3).toISOString().split('T')[0]

async function getSub(call: Promise<any>){
  return (await (await call).wait())?.logs.find((l:any)=>l.topics[0]==="0x75aabd19e348827dfa0d37beb9ada0c4ccaec489ee6d4f754b579b7722f210bc").args
}

function unsubscribeParams(sub:any){
  return [sub.initialPeriod, sub.expirationDate, sub.amountPerCycle, sub.receiver, sub.accumulator, sub.initialShares] as [any, any, any, any, any, any]
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
    const subs = await Subs.deploy(30*24*3600, tokenAddress, vaultAddress, feeCollector.address, await time.latest());

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
      const yieldGenerated = 10*(1+tokenYield)**5 - 10
      expect(await token.balanceOf(subReceiver.address)).to.be.approximately(fe((610+yieldGenerated)*0.99), fe(0.1));
      expect(await vault.balanceOf(await subs.getAddress())).to.be.approximately(0, 2);
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

    it("claim correctly discounts expirations", async function () {
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
      expect(otherSubBalance).to.be.above(1.2)
      expect(otherSubBalance).to.be.below(1.6)
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
});
