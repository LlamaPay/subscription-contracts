import { ethers } from "hardhat";

const START = 1704067200
const MONTH = 30*24*60*60

// Params
const aTokenAddress = "0x6ab707Aca953eDAeFBc4fD23bA73294241490620"
const RewardsController = "0x929EC64c34a17401F460460D4B9390518E5B473e"
const rpc = "https://rpc.ankr.com/optimism"

const func = async function (hre:any) {
  const {deployments, getNamedAccounts} = hre;

  const {deployer} = await getNamedAccounts();

  const SubsFactory = await deployments.get('SubsFactory');
  const signer = new ethers.Wallet(process.env.PRIVATEKEY!, new ethers.JsonRpcProvider(rpc))

  // Verify params
  const aToken = new ethers.Contract(aTokenAddress, [
    "function ATOKEN_REVISION() view external returns (uint256)",
    "function UNDERLYING_ASSET_ADDRESS() view external returns (address)",
  ], signer)
  if(await aToken.ATOKEN_REVISION() !== 2n){
    throw new Error("Bad aToken")
  }

  const RewardsControllerContract = new ethers.Contract(RewardsController, [
    "function EMISSION_MANAGER() view external returns (address)",
  ], signer)
  await RewardsControllerContract.EMISSION_MANAGER()

  const tokenAddress = await aToken.UNDERLYING_ASSET_ADDRESS()
  const token = new ethers.Contract(tokenAddress, [
    "function allowance(address owner, address spender) view external returns (uint256)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function decimals() view returns (uint8)",
  ], signer)
  const UNIT = BigInt(10**await token.decimals())
  if(await token.allowance(deployer, SubsFactory.address) < UNIT){
    await (await token.approve(SubsFactory.address, UNIT)).wait()
  }

  // Create market
  const subsFactory = new ethers.Contract(SubsFactory.address, SubsFactory.abi, signer)

  const logs = await (await subsFactory.createContract(MONTH, aTokenAddress, deployer, START,
    deployer, RewardsController, deployer, UNIT)).wait()
  console.log(logs)
};
module.exports = func;
func.tags = ['Subs'];
func.dependencies = ['SubsFactory'];