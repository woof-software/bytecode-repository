pragma solidity 0.8.30;

interface IFactory {
    function deploy(
        bytes32 _contractType,
        bytes32 _salt,
        bytes calldata _initCode,
        bytes calldata _constructorParams
    ) external returns (address);
}
