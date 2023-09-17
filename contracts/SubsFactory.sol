pragma solidity ^0.8.19;

import {Subs} from "./Subs.sol";

interface IERC4626 {
    function asset() external view returns (address);
}

contract SubsFactory {
    address public immutable feeCollector;

    event ContractCreated(address token, address vault, uint startingPeriod, uint periodDuration, address contractAddress);

    constructor(address _feeCollector){
        feeCollector = _feeCollector;
    }

    function createContract(uint _periodDuration, address _vault, uint _startingPeriod) external {
        Subs subs = new Subs(_periodDuration, _vault, feeCollector, _startingPeriod);
        emit ContractCreated(IERC4626(_vault).asset(), _vault, _startingPeriod, _periodDuration, address(subs));
    }
}