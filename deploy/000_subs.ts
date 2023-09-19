const func = async function (hre:any) {
  const {deployments, getNamedAccounts} = hre;
  const {deploy} = deployments;

  const {deployer} = await getNamedAccounts();

  await deploy('Subs', {
    from: deployer,
    args: [5*60, "0x65343F414FFD6c97b0f6add33d16F6845Ac22BAc", deployer, 1694919024, deployer, "0xf8126ef025651e1b313a6893fcf4034f4f4bd2aa"], // 2023-9-1, 12:00:00 am UTC
    log: true,
    autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
    //deterministicDeployment: true,
  });
};
module.exports = func;
func.tags = ['Subs'];
func.dependencies = ['YearnERC4626'];