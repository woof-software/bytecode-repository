pragma solidity 0.8.30;

import { IFactory } from "../interfaces/IFactory.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";

contract MockFactory is IFactory {
    function deploy(
        bytes32 /*_contractType*/,
        bytes32 _salt,
        bytes calldata _initCode,
        bytes calldata _constructorParams
    ) external returns (address) {
        return
            Create2.deploy(
                0,
                keccak256(abi.encode(_salt, msg.sender)),
                abi.encodePacked(_initCode, _constructorParams)
            );
    }
}
