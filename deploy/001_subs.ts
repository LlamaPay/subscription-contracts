const func = async function (hre:any) {
  const {deployments, getNamedAccounts} = hre;
  const {deploy} = deployments;

  const {deployer} = await getNamedAccounts();
  const YearnERC4626 = await deployments.get('YearnERC4626');

  await deploy('Subs', {
    from: deployer,
    args: [5*60, YearnERC4626.address, deployer, 1694919024], // 2023-9-1, 12:00:00 am UTC
    log: true,
    autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
    //deterministicDeployment: true,
  });
};
module.exports = func;
func.tags = ['Subs'];
func.dependencies = ['YearnERC4626'];