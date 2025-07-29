pragma solidity 0.8.30;

import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import { Client } from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import { CCIPReceiver } from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import { BytecodeStore } from "./libraries/BytecodeStore.sol";
import { IFactory } from "./interfaces/IFactory.sol";
import { IVersionController } from "./interfaces/IVersionController.sol";
import { IL2DeployManager } from "./interfaces/IL2DeployManager.sol";

contract L2DeployManager is IL2DeployManager, CCIPReceiver {
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
        IVersionController.BytecodeVersion calldata _bytecodeVersion,
        bytes32 _salt,
        bytes calldata _constructorParams
    ) external returns (address) {
        bytes memory initCode = getVerifiedBytecode(_bytecodeVersion);
        if (initCode.length == 0) revert BytecodeIsEmpty();
        bytes32 uniqueSalt = keccak256(abi.encode(_salt, msg.sender));
        bytes memory bytecodeWithParams = abi.encode(initCode, _constructorParams);
        return Create2.deploy(0, uniqueSalt, bytecodeWithParams);
    }

    /* View functions */

    /// @notice Returns a bytecode of the specified version.
    /// @dev Can be used to validate if bytecode was sent to the current network.
    /// @param _bytecodeVersion A version of bytecode for which to return bytecode.
    /// @return Bytecode of the specified contract type and its version.
    function getVerifiedBytecode(
        IVersionController.BytecodeVersion calldata _bytecodeVersion
    ) public view returns (bytes memory) {
        return
            BytecodeStore._readInitCode(
                storedBytecodePtrs[
                    BytecodeStore._computeBytecodeHash(_bytecodeVersion.contractType, _bytecodeVersion.version)
                ]
            );
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
