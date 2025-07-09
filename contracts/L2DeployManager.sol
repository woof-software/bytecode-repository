pragma solidity 0.8.30;

import { Client } from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import { CCIPReceiver } from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import { BytecodeStore } from "./libraries/BytecodeStore.sol";
import { IFactory } from "./interfaces/IFactory.sol";
import { IVersionController } from "./interfaces/IVersionController.sol";
import { IL2DeployManager } from "./interfaces/IL2DeployManager.sol";

contract L2DeployManager is IL2DeployManager, CCIPReceiver {
    address public immutable l1DeployManager;
    address public immutable localTimelock;
    mapping(bytes32 => address[]) private storedBytecodePtrs;
    mapping(bytes32 => IFactory) public contractTypeFactory;

    constructor(address _l1DeployManager, address _localTimelock, address _router) CCIPReceiver(_router) {
        l1DeployManager = _l1DeployManager;
        localTimelock = _localTimelock;
    }

    modifier onlyTimelock() {
        if (msg.sender != localTimelock) revert OnlyTimelock();
        _;
    }

    /* Governor functions */

    function setContractTypeFactory(bytes32 _contractType, IFactory _factory) external onlyTimelock {
        contractTypeFactory[_contractType] = _factory;

        emit FactorySet(_contractType, address(_factory));
    }

    /* Developer functions */

    function deploy(
        IVersionController.BytecodeVersion calldata _bytecodeVersion,
        bytes32 _salt,
        bytes calldata _constructorParams
    ) external {
        bytes memory initCode = getBytecode(_bytecodeVersion);
        if (initCode.length == 0) revert BytecodeIsEmpty();
        contractTypeFactory[_bytecodeVersion.contractType].deploy(
            _bytecodeVersion.contractType,
            _salt,
            initCode,
            _constructorParams
        );
    }

    /* View functions */

    function getBytecode(
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

    function _ccipReceive(Client.Any2EVMMessage memory any2EvmMessage) internal override {
        if (abi.decode(any2EvmMessage.sender, (address)) != l1DeployManager) revert InvalidSender();
        (bytes32 bytecodeHash, bytes memory initCode) = abi.decode(any2EvmMessage.data, (bytes32, bytes));
        if (storedBytecodePtrs[bytecodeHash].length != 0) revert BytecodeAlreadyReceived(bytecodeHash);
        storedBytecodePtrs[bytecodeHash] = BytecodeStore._writeInitCode(initCode);

        emit BytecodeReceived(any2EvmMessage.messageId, bytecodeHash);
    }
}
