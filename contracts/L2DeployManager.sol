pragma solidity 0.8.30;

import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import { Client } from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import { CCIPReceiver } from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import { BytecodeStore } from "./libraries/BytecodeStore.sol";
import { IFactory } from "./interfaces/IFactory.sol";
import { Types } from "./interfaces/Types.sol";
import { IBytecodeProvider } from "./interfaces/IBytecodeProvider.sol";
import { IL2DeployManager } from "./interfaces/IL2DeployManager.sol";

contract L2DeployManager is IL2DeployManager, IBytecodeProvider, CCIPReceiver {
    address public immutable l1DeployManager;
    mapping(bytes32 => address[]) private storedBytecodePtrs;

    constructor(address _l1DeployManager, address _router) CCIPReceiver(_router) {
        l1DeployManager = _l1DeployManager;
    }

    /* Developer functions */

    /// @notice Allows anyone to deploy a certain version of bytecode on the current network.
    /// @dev Bytecode must be sent from the L1DeployManager.
    /// @dev Bytecode will be deployed through the appropriate Factory if it is set. Otherwise, L2DeployManager will try to deploy it via Create2.
    /// @param _bytecodeVersion A specific version of contract type to deploy.
    /// @param _salt A value necessary to generate a unique salt for Create2.
    /// @param _constructorParams parameters necessary to deploy a specified contract.
    function deploy(
        Types.BytecodeVersion calldata _bytecodeVersion,
        bytes32 _salt,
        bytes calldata _constructorParams
    ) external returns (address) {
        bytes memory initCode = getVerifiedBytecode(_bytecodeVersion);
        if (initCode.length == 0) revert BytecodeIsEmpty();
        bytes32 uniqueSalt = keccak256(abi.encode(_salt, msg.sender));
        bytes memory bytecodeWithParams = abi.encodePacked(initCode, _constructorParams);
        return Create2.deploy(0, uniqueSalt, bytecodeWithParams);
    }

    /* View functions */

    /// @notice Returns a bytecode of the specified version.
    /// @dev Can be used to validate if bytecode was sent to the current network.
    /// @param _version A version of bytecode for which to return bytecode.
    /// @return Bytecode of the specified contract type and its version.
    function getVerifiedBytecode(Types.BytecodeVersion calldata _version) public view returns (bytes memory) {
        return
            BytecodeStore._readInitCode(
                storedBytecodePtrs[BytecodeStore._computeBytecodeHash(_version.contractType, _version.version)]
            );
    }

    function versionExists(Types.BytecodeVersion calldata _version) external view returns (bool) {
        return
            storedBytecodePtrs[BytecodeStore._computeBytecodeHash(_version.contractType, _version.version)].length != 0;
    }

    /// @notice Computes a pre-deployed addresses of specified contract type and version.
    /// @param _salt A value necessary to generate a unique salt for Create2.
    /// @param _constructorParams encoded parameters necessary to deploy a specified contract.
    /// @param _deployer Address of deployer. Necessary for unique salt generation.
    /// @return Address of computed pre-deployed smart contract.
    function computeAddress(
        Types.BytecodeVersion calldata _bytecodeVersion,
        bytes32 _salt,
        bytes calldata _constructorParams,
        address _deployer
    ) external view returns (address) {
        bytes32 uniqueSalt = keccak256(abi.encode(_salt, _deployer));
        bytes memory bytecodeWithParams = abi.encodePacked(getVerifiedBytecode(_bytecodeVersion), _constructorParams);
        return Create2.computeAddress(uniqueSalt, keccak256(bytecodeWithParams));
    }

    /* Internal helpers */

    /// @notice Helper function for receiving messages from L1DeployManager.
    /// @dev The sender of the message from Ethereum must be L1DeployManager.
    /// @param any2EvmMessage params necessary for the cross-chain message. Data contains bytecode hash and its bytecode.
    function _ccipReceive(Client.Any2EVMMessage memory any2EvmMessage) internal override {
        if (abi.decode(any2EvmMessage.sender, (address)) != l1DeployManager) revert InvalidSender();
        (bytes32 bytecodeHash, bytes memory initCode) = abi.decode(any2EvmMessage.data, (bytes32, bytes));
        storedBytecodePtrs[bytecodeHash] = BytecodeStore._writeInitCode(initCode);

        emit BytecodeReceived(any2EvmMessage.messageId, bytecodeHash);
    }
}
