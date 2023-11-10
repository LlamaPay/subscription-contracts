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
    optimism: {
      url: "https://rpc.ankr.com/optimism",
      //accounts: [process.env.PRIVATEKEY!],
      gasMultiplier: 1.2,
    },
  },
  namedAccounts: {
    deployer: 0,
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN
  },
};

export default config;
