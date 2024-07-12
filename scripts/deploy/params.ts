export const chainParams = {
    ["arbitrum" as string]: {
        rewardController: "0x929EC64c34a17401F460460D4B9390518E5B473e",
        tokens: [
            ["0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", "USDT", "0x6ab707Aca953eDAeFBc4fD23bA73294241490620"],
            ["0xaf88d065e77c8cc2239327c5edb3a432268e5831", "USDC", "0x724dc807b04555b71ed48a6896b6F41593b8C637"],
            ["0xff970a61a04b1ca14834a43f5de4533ebddb5cc8", "USDC.e", "0x625E7708f30cA75bfd92586e17077590C60eb4cD"],
            ["0xda10009cbd5d07dd0cecc66161fc93d7c9000da1", "DAI", "0x82E64f49Ed5EC1bC6e43DAD4FC8Af9bb3A2312EE"],
        ],
    },
    base: {
        rewardController: "0xf9cc4F0D883F1a1eb2c253bdb46c254Ca51E1F44",
        tokens: [
            ["0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", "USDC", "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB"],
            ["0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca", "USDbC", "0x0a1d576f3eFeF75b330424287a95A366e8281D54"],
            //["0x50c5725949a6f0c72e6c4a641f24049a917db0cb", "DAI", "x"],
        ],
    },
    polygon: {
        rewardController: "0x929EC64c34a17401F460460D4B9390518E5B473e",
        tokens: [
            ["0xc2132d05d31c914a87c6611c10748aeb04b58e8f", "USDT", "0x6ab707Aca953eDAeFBc4fD23bA73294241490620"],
            ["0x2791bca1f2de4661ed88a30c99a7a9449aa84174", "USDC (PoS)", "0x625E7708f30cA75bfd92586e17077590C60eb4cD"],
            ["0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", "USDC", "0xA4D94019934D8333Ef880ABFFbF2FDd611C762BD"],
            ["0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", "DAI", "0x82E64f49Ed5EC1bC6e43DAD4FC8Af9bb3A2312EE"],
        ],
    },
    avalanche: {
        rewardController: "0x929EC64c34a17401F460460D4B9390518E5B473e",
        tokens: [
            //["0xc7198437980c041c805a1edcba50c1ce5db95118", "USDT.e", "x"],
            ["0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7", "USDT", "0x6ab707Aca953eDAeFBc4fD23bA73294241490620"],
            //["0xa7d7079b0fead91f3e65f86e8915cb59c1a4c664", "USDC.e", "x"],
            ["0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", "USDC", "0x625E7708f30cA75bfd92586e17077590C60eb4cD"],
            ["0xd586e7f844cea2f87f50152665bcbc2c279d8d70", "DAI.e", "0x82E64f49Ed5EC1bC6e43DAD4FC8Af9bb3A2312EE"],
        ],
    },
    optimism: {
        rewardController: "0x929EC64c34a17401F460460D4B9390518E5B473e",
        tokens: [
            ["0x94b008aa00579c1307b0ef2c499ad98a8ce58e58", "USDT", "0x6ab707Aca953eDAeFBc4fD23bA73294241490620"],
            ["0x0b2c639c533813f4aa9d7837caf62653d097ff85", "USDC", "0x38d693cE1dF5AaDF7bC62595A37D667aD57922e5"],
            ["0x7f5c764cbc14f9669b88837ca1490cca17c31607", "USDC.e", "0x625E7708f30cA75bfd92586e17077590C60eb4cD"],
            ["0xda10009cbd5d07dd0cecc66161fc93d7c9000da1", "DAI", "0x82E64f49Ed5EC1bC6e43DAD4FC8Af9bb3A2312EE"],
        ],
    },
    ethereum: {
        rewardController: "0x8164Cc65827dcFe994AB23944CBC90e0aa80bFcb",
        tokens: [
            ["0xdac17f958d2ee523a2206206994597c13d831ec7", "USDT", "0x23878914EFE38d27C4D67Ab83ed1b93A74D4086a"],
            ["0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", "USDC", "0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c"],
            ["0x6b175474e89094c44da98b954eedeac495271d0f", "DAI", "0x018008bfb33d285247A21d44E50697654f754e63"],
        ],
    },
    bsc: {
        rewardController: "0xC206C2764A9dBF27d599613b8F9A63ACd1160ab4",
        tokens: [
            ["0x55d398326f99059ff775485246999027b3197955", "USDT", "0xa9251ca9DE909CB71783723713B21E4233fbf1B1"],
            ["0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", "USDC", "0x00901a076785e0906d1028c7d6372d247bec7d61"],
            //["0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3", "DAI", "x"],
        ],
    },
}