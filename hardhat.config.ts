import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

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
        url: "https://eth.llamarpc.com",
        blockNumber: 17589468
      }
    },
  }
};

export default config;
