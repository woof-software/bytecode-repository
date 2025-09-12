// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Types } from "./Types.sol";

interface IBytecodeProvider {
    function getVerifiedBytecode(Types.BytecodeVersion calldata _version) external view returns (bytes memory);

    function versionExists(Types.BytecodeVersion calldata _version) external view returns (bool);
}
