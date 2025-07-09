pragma solidity 0.8.30;

import { SSTORE2 } from "solady/src/utils/SSTORE2.sol";

library BytecodeStore {
    /// @notice small buffer to account for `SSTORE2` overhead.
    uint256 public constant CHUNK_SIZE = 24500;

    error InitCodeIsEmpty();

    /// @notice Writes the bytecode in the storage.
    /// @dev Utilizes SSTORE2 for storing the bytecode.
    /// @dev Bytecode must not be empty.
    /// @param _initCode Bytecode to store.
    /// @return An array of pointer addresses at which parts of bytecode was stored.
    function _writeInitCode(bytes calldata _initCode) internal returns (address[] memory) {
        if (_initCode.length == 0) revert InitCodeIsEmpty();
        uint256 len = (_initCode.length - 1) / CHUNK_SIZE + 1;
        address[] memory initCodePointers = new address[](len);
        for (uint256 i; i < len; ++i) {
            uint256 start = i * CHUNK_SIZE;
            uint256 end = start + CHUNK_SIZE;
            if (end > _initCode.length) end = _initCode.length;
            initCodePointers[i] = SSTORE2.write(_initCode[start:end]);
        }
        return initCodePointers;
    }

    /// @notice Returns the bytecode stored at given address pointers.
    /// @param _initCodePtrs Address pointers at which parts of the bytecode is stored.
    /// @return Bytecode stored at the given pointers.
    function _readInitCode(address[] memory _initCodePtrs) internal view returns (bytes memory) {
        bytes memory initCode;
        for (uint256 i; i < _initCodePtrs.length; ++i) {
            initCode = bytes.concat(initCode, SSTORE2.read(_initCodePtrs[i]));
        }
        return initCode;
    }
}
