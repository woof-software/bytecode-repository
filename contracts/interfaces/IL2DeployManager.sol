pragma solidity 0.8.30;

interface IL2DeployManager {
    event BytecodeReceived(bytes32 _messageId, bytes32 _bytecodeHash);
    event FactorySet(bytes32 _contractType, address _factory);

    error InvalidSender();
    error OnlyTimelock();
    error BytecodeIsEmpty();
}
