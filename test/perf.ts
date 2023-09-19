import { ethers } from "hardhat";
import { getSub, unsubscribeParams } from "./helpers"

const fe = (n:number) => ethers.parseUnits(n.toFixed(5), 18)

describe("perf", function () {
    it("Should work", async function () {
        const [subReceiver, feeCollector] = await ethers.getSigners();
        const daiWhale = await ethers.getImpersonatedSigner("0x9cd4ff80d81e4dda8e9d637887a5db7e0c8e007b");
        const Subs = await ethers.getContractFactory("Subs");
        const subs = await Subs.deploy(30 * 24 * 3600, "0x65343F414FFD6c97b0f6add33d16F6845Ac22BAc", feeCollector.address, 1694919024, feeCollector.address, "0xf8126ef025651e1b313a6893fcf4034f4f4bd2aa", fe(50));

        const token = new ethers.Contract("0xda10009cbd5d07dd0cecc66161fc93d7c9000da1", [
            "function approve(address spender, uint256 amount) external returns (bool)",
        ], daiWhale)
        await token.approve(await subs.getAddress(), fe(1e6))
        await subs.connect(daiWhale).subscribe(subReceiver.address, fe(0.1), 2)
        const sub = await getSub(subs.connect(daiWhale).subscribe(subReceiver.address, fe(0.15), 2))

        await subs.connect(daiWhale).unsubscribe(...unsubscribeParams(sub))
    });
})