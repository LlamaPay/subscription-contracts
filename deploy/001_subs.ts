import { ethers } from "hardhat";

const func = async function (hre:any) {
  const {deployments, getNamedAccounts} = hre;

  const {deployer} = await getNamedAccounts();

  const SubsFactory = await deployments.get('SubsFactory');
  const signer = new ethers.Wallet(process.env.PRIVATEKEY!, new ethers.JsonRpcProvider("https://rpc.ankr.com/optimism"))
  const token = new ethers.Contract("0xda10009cbd5d07dd0cecc66161fc93d7c9000da1", [
    "function approve(address spender, uint256 amount) external returns (bool)",
  ], signer)
  await (await token.approve(SubsFactory.address, 1000000000000000000n)).wait()
  const subsFactory = new ethers.Contract(SubsFactory.address, SubsFactory.abi, signer)

  const startDay = new Date()
  startDay.setHours(0)
  startDay.setMinutes(0)
  startDay.setSeconds(0)
  startDay.setMilliseconds(0)
  const logs = await (await subsFactory.createContract(24*60*60, "0x82e64f49ed5ec1bc6e43dad4fc8af9bb3a2312ee", deployer, Math.floor(startDay.getTime()/1e3),
  deployer, "0x929EC64c34a17401F460460D4B9390518E5B473e", deployer)).wait()
  console.log(logs)
};
module.exports = func;
func.tags = ['Subs'];
func.dependencies = ['SubsFactory'];