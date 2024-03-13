import { ethers } from "hardhat";
import { getSub, unsubscribeParams } from "./helpers"
import { fe, stakingRewards, tokenAddress, vaultAddress, whaleAddress } from "./constats";

describe("perf", function () {
    it("Should work", async function () {
        const [owner, subReceiver, feeCollector] = await ethers.getSigners();
        const daiWhale = await ethers.getImpersonatedSigner(whaleAddress);
        const Subs = await ethers.getContractFactory("Subs");
        const subs = await Subs.deploy(30 * 24 * 3600, vaultAddress, feeCollector.address, 1694919024, feeCollector.address, stakingRewards, owner.address);

        const token = new ethers.Contract(tokenAddress, [
            "function approve(address spender, uint256 amount) external returns (bool)",
        ], daiWhale)
        await token.approve(await subs.getAddress(), fe(1e6))
        await subs.connect(daiWhale).subscribe(subReceiver.address, fe(0.1), fe(0.1*2))
        const sub = await getSub(subs.connect(daiWhale).subscribe(subReceiver.address, fe(0.15), fe(0.15*2)))

        await subs.connect(daiWhale).unsubscribe(...unsubscribeParams(sub))
    });
})