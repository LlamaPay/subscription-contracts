import { ethers } from "hardhat";

// CHANGE THESE VARIABLES TO TEST WITH DIFFERENT VAULTS AND TOKENS WITH DIFFERENT DECIMALS
const mainnet = false
const useUSDC = false // Requires mainnet === false
const useAAVE = false


export const tokenAddress = mainnet?'0x6B175474E89094C44Da98b954EedeAC495271d0F':
  useUSDC?'0x7f5c764cbc14f9669b88837ca1490cca17c31607':'0xda10009cbd5d07dd0cecc66161fc93d7c9000da1'
export const vaultAddress = mainnet?'0x83F20F44975D03b1b09e64809B757c47f942BEeA': // DAI
  useUSDC?'0x6E6699E4B8eE4Bf35E72a41fe366116ff4C5A3dF':
    useAAVE?
      '0x82e64f49ed5ec1bc6e43dad4fc8af9bb3a2312ee': // aDAI
      '0x65343F414FFD6c97b0f6add33d16F6845Ac22BAc' // yearn DAI
export const whaleAddress = mainnet?'0x075e72a5edf65f0a5f44699c7654c1a76941ddc8':
  useUSDC?'0x7f5c764cbc14f9669b88837ca1490cca17c31607':'0x9cd4ff80d81e4dda8e9d637887a5db7e0c8e007b'
export const tokenYield = !useAAVE?0:useUSDC?0.026:0.0235
export const stakingRewards = useAAVE?"0x929EC64c34a17401F460460D4B9390518E5B473e":"0xf8126ef025651e1b313a6893fcf4034f4f4bd2aa"

export const fe = (n:number) => ethers.parseUnits(n.toFixed(5), useUSDC?6:18)
export const de = (n:bigint|any) => Number(n)/(useUSDC?1e6:1e18)
export const dd = (n:any) => new Date(Number(n) * 1e3).toISOString().split('T')[0]