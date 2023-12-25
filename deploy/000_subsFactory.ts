const func = async function (hre:any) {
    const {deployments, getNamedAccounts} = hre;
    const {deploy} = deployments;
  
    const {deployer} = await getNamedAccounts();
  
    await deploy('SubsFactory', {
      from: deployer,
      log: true,
      autoMine: true,
    });
  };
  module.exports = func;
  func.tags = ['SubsFactory'];