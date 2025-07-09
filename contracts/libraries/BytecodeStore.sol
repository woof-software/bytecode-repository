pragma solidity 0.8.30;

import { SSTORE2 } from "solady/src/utils/SSTORE2.sol";
import { LibBytes } from "solady/src/utils/LibBytes.sol";
import { IVersionController } from "../interfaces/IVersionController.sol";

library BytecodeStore {
    using LibBytes for bytes;

    /// @notice Bytecode version typehash.
    bytes32 public constant BYTECODE_VERSION_TYPEHASH =
        keccak256("BytecodeVersion(bytes32 contractType,uint64 major,uint64 minor,uint64 patch,string alternative)");
    /// @notice small buffer to account for `SSTORE2` overhead.
    uint256 public constant CHUNK_SIZE = 24500;

    error InitCodeIsEmpty();

    function _computeBytecodeHash(
        bytes32 _contractType,
        IVersionController.VersionWithAlternative memory _version
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    BYTECODE_VERSION_TYPEHASH,
                    _contractType,
                    _version.version.major,
                    _version.version.minor,
                    _version.version.patch,
                    _version.alternative
                )
            );
    }

    /// @notice Writes the bytecode in the storage.
    /// @dev Utilizes SSTORE2 for storing the bytecode.
    /// @dev Bytecode must not be empty.
    /// @param _initCode Bytecode to store.
    /// @return An array of pointer addresses at which parts of bytecode was stored.
    function _writeInitCode(bytes memory _initCode) internal returns (address[] memory) {
        if (_initCode.length == 0) revert InitCodeIsEmpty();
        uint256 len = (_initCode.length - 1) / CHUNK_SIZE + 1;
        address[] memory initCodePointers = new address[](len);
        for (uint256 i; i < len; ++i) {
            uint256 start = i * CHUNK_SIZE;
            uint256 end = start + CHUNK_SIZE;
            if (end > _initCode.length) end = _initCode.length;
            initCodePointers[i] = SSTORE2.write(_initCode.slice(start, end));
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
