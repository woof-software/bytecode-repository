pragma solidity 0.8.30;

import { IVersionController } from "./IVersionController.sol";

interface IBytecodeProvider {
    function getVerifiedBytecode(
        IVersionController.BytecodeVersion calldata _version
    ) external view returns (bytes memory);
}
