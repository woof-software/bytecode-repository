// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Types } from "./Types.sol";

interface IL2DeployManager {
    event BytecodeReceived(bytes32 _messageId, bytes32 _bytecodeHash);
    event ContractDeployed(
        Types.BytecodeVersion _bytecodeVersion,
        bytes _constructorParams,
        address _newContract,
        address _deployer
    );
    event DeveloperAccessGranted(address _developer);

    error InvalidSender();
    error OnlyTimelock();
    error BytecodeIsEmpty();
    error OnlyDeveloperOrGovernor();
    error ZeroAddress();

    /// @notice A type of message to receive from Ethereum.
    enum MessageType {
        SEND_BYTECODE,
        BECOME_DEVELOPER
    }
}
