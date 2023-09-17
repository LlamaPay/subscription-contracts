const func = async function (hre:any) {
    const {deployments, getNamedAccounts} = hre;
    const {deploy} = deployments;
  
    const {deployer} = await getNamedAccounts();
  
    await deploy('Subs', {
      from: deployer,
      args: [30*24*3600, "0x85c6Cd5fC71AF35e6941d7b53564AC0A68E09f5C", deployer, 1693526400], // 2023-9-1, 12:00:00 am UTC
      log: true,
      autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
      //deterministicDeployment: true,
    });
  };
  module.exports = func;
  func.tags = ['Subs'];
  