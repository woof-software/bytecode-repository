pragma solidity 0.8.30;

import { IBytecodeProvider } from "../interfaces/IBytecodeProvider.sol";
import { Types } from "../interfaces/Types.sol";

contract BytecodeProviderMock is IBytecodeProvider {
    function getVerifiedBytecode(Types.BytecodeVersion calldata _version) external view returns (bytes memory) {
        bytes memory _data = bytes("data");
        return _data;
    }

    // Always true
    function versionExists(Types.BytecodeVersion calldata _version) external view returns (bool) {
        return true;
    }

    // Always true
    function isDeveloper(address _account) external view returns (bool) {
        return true;
    }
}
