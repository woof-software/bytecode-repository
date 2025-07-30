pragma solidity 0.8.30;

import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import { IVersionController } from "../interfaces/IVersionController.sol";
import { IBytecodeProvider } from "../interfaces/IBytecodeProvider.sol";

abstract contract BaseFactory {
    IBytecodeProvider public immutable bytecodeProvider;

    constructor(IBytecodeProvider _bytecodeProvider) {
        bytecodeProvider = _bytecodeProvider;
    }

    function _getInitCode(
        IVersionController.BytecodeVersion memory _bytecodeVersion
    ) internal view returns (bytes memory) {
        return bytecodeProvider.getVerifiedBytecode(_bytecodeVersion);
    }

    function _deployContractType(
        IVersionController.BytecodeVersion memory _bytecodeVersion,
        bytes memory _constructorArgs,
        bytes32 _salt
    ) internal returns (address) {
        bytes memory initCode = _getInitCode(_bytecodeVersion);
        bytes memory bytecodeWithParams = abi.encodePacked(initCode, _constructorArgs);
        return _deployContract(bytecodeWithParams, _salt);
    }

    function _deployContract(bytes memory _bytecodeWithParams, bytes32 _salt) internal returns (address) {
        bytes32 uniqueSalt = keccak256(abi.encode(_salt, msg.sender));
        return Create2.deploy(0, uniqueSalt, _bytecodeWithParams);
    }

    function _computeContractTypeAddress(
        IVersionController.BytecodeVersion memory _bytecodeVersion,
        bytes memory _constructorArgs,
        bytes32 _salt,
        address _deployer
    ) internal view returns (address) {
        bytes memory initCode = _getInitCode(_bytecodeVersion);
        bytes memory bytecodeWithParams = abi.encodePacked(initCode, _constructorArgs);
        return _computeContractAddress(bytecodeWithParams, _salt, _deployer);
    }

    function _computeContractAddress(
        bytes memory _bytecodeWithParams,
        bytes32 _salt,
        address _deployer
    ) internal view returns (address) {
        bytes32 uniqueSalt = keccak256(abi.encode(_salt, _deployer));
        return Create2.computeAddress(uniqueSalt, keccak256(_bytecodeWithParams));
    }

    function addressToBytes32(address addr) internal pure returns (bytes32 result) {
        assembly {
            result := shl(96, addr) // shift left by 12 bytes (96 bits) to pad with zeros
        }
    }
}
