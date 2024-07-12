import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import 'hardhat-deploy';

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.19",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 4294967,
      },
    }
  },
  networks: {
    hardhat: {
      forking: {
        url: "https://rpc.ankr.com/optimism", //"https://eth.llamarpc.com",
        blockNumber: 111028932
      }
    },
    ...["eth", "optimism", "bsc", "avalanche", "fantom", "arbitrum", "polygon", "polygon_zkevm", "base",
         "bttc", "zksync_era", "mantle", "scroll", "blast"].reduce((acc, chain)=>({
      ...acc,
      [chain]: {
        url: `https://rpc.ankr.com/${chain}`,
        accounts: [process.env.PRIVATEKEY!],
        gasMultiplier: 1.1,
      }
    }), {}),
    ...[
      ["aurora", "https://mainnet.aurora.dev"],
      ["cronos", "https://evm.cronos.org"],
      ["linea", "https://rpc.linea.build"],
      ["mode", "https://mainnet.mode.network"]
    ].reduce((acc, chain)=>({
      ...acc,
      [chain[0]]: {
        url: chain[1],
        accounts: [process.env.PRIVATEKEY!],
        gasMultiplier: 1.1,
      }
    }), {}),

  },
  namedAccounts: {
    deployer: 0,
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN
  },
};

export default config;
