const func = async function (hre:any) {
const {deployments, getNamedAccounts} = hre;
const {deploy} = deployments;

const {deployer} = await getNamedAccounts();

await deploy('YearnERC4626', {
    from: deployer,
    args: ["0xda10009cbd5d07dd0cecc66161fc93d7c9000da1", "0x65343F414FFD6c97b0f6add33d16F6845Ac22BAc", deployer, "0xf8126ef025651e1b313a6893fcf4034f4f4bd2aa"],
    log: true,
    autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
    //deterministicDeployment: true,
});
};
module.exports = func;
func.tags = ['YearnERC4626'];
    