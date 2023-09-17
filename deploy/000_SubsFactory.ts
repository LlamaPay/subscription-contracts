const func = async function (hre:any) {
    const {deployments, getNamedAccounts} = hre;
    const {deploy} = deployments;
  
    const {deployer} = await getNamedAccounts();
  
    await deploy('SubsFactory', {
      from: deployer,
      args: [deployer],
      log: true,
      autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
      //deterministicDeployment: true,
    });
  };
  module.exports = func;
  func.tags = ['SubsFactory'];
  