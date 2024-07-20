import { ethers } from "hardhat";
import { chainParams } from "../scripts/deploy/params";
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const START = 1704067200
const MONTH = 30*24*60*60

const func = async function (hre:HardhatRuntimeEnvironment) {
  const RewardsController = chainParams[hre.network.name].rewardController
  const tokensToDeploy = chainParams[hre.network.name].tokens
  const {deployments, getNamedAccounts} = hre;

  const {deployer} = await getNamedAccounts();

  const SubsFactory = await deployments.get('SubsFactory');
  const signer = new ethers.Wallet(process.env.PRIVATEKEY!, hre.ethers.provider)

  const RewardsControllerContract = new ethers.Contract(RewardsController, [
    "function EMISSION_MANAGER() view external returns (address)",
  ], signer)
  await RewardsControllerContract.EMISSION_MANAGER()

  const subsFactory = new ethers.Contract(SubsFactory.address, SubsFactory.abi, signer)

  const contractCount = Number(await subsFactory.getContractCount())
  for(let i=0; i<tokensToDeploy.length; i++){
    const [tokenAddress, tokenSymbol, aTokenAddress] = tokensToDeploy[i]

    const findContractAddress = async ()=>{
      const logs:any[] = await subsFactory.queryFilter(subsFactory.filters.SubsCreated(), -1000)
      return logs.find(l=>l.args[1].toLowerCase() === tokenAddress.toLowerCase()).args[0]
    }
    if(i>=contractCount){
      // Verify params
      const aToken = new ethers.Contract(aTokenAddress, [
        "function ATOKEN_REVISION() view external returns (uint256)",
        "function UNDERLYING_ASSET_ADDRESS() view external returns (address)",
      ], signer)
      await aToken.ATOKEN_REVISION()

      if(tokenAddress.toLowerCase() !== (await aToken.UNDERLYING_ASSET_ADDRESS()).toLowerCase()){
        throw new Error(`Token ${tokenAddress} doesn't match!`)
      }
      const token = new ethers.Contract(tokenAddress, [
        "function allowance(address owner, address spender) view external returns (uint256)",
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function decimals() view returns (uint8)",
      ], signer)
      const UNIT = BigInt(10**Number(await token.decimals()))
      if(await token.allowance(deployer, SubsFactory.address) < UNIT){
        await (await token.approve(SubsFactory.address, UNIT)).wait()
      }

      // Create market
      await (await subsFactory.createContract(MONTH, aTokenAddress, deployer, START,
        deployer, RewardsController, deployer, UNIT)).wait()
      if(i === 0){
        console.log(`npx hardhat verify --network ${hre.network.name} ${await findContractAddress()}`, MONTH, aTokenAddress, deployer, START, deployer, RewardsController, deployer)
      }
    }
    console.log(hre.network.name, tokenSymbol, tokenAddress, await findContractAddress())
  }
};
module.exports = func;
func.tags = ['Subs'];
func.dependencies = ['SubsFactory'];