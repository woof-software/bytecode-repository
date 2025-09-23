# Solidity API

## BaseFactory

This abstract contract provides standardized deployment infrastructure for factory contracts that deploy audited bytecode with deterministic CREATE2 addresses.
- The contract abstracts bytecode retrieval from BytecodeProviders (VersionController on L1 or L2DeployManager on L2 networks) enabling unified deployment patterns across chains.
- All deployments use CREATE2 with deployer-specific salt generation, ensuring deterministic addresses while preventing deployment conflicts between different users.
- Address computation functions enable predictable contract addresses before deployment for integration planning and multi-chain coordination.
- The abstract design allows specialized factory contracts to inherit standardized deployment functionality while implementing domain-specific deployment logic.
- Internal functions provide:
  1. Bytecode retrieval from configured BytecodeProvider with version validation and audit verification integration.
  2. CREATE2 deployment with automatic salt generation combining user-provided salt and deployer address for uniqueness.
  3. Address computation using identical salt logic as deployment functions for predictable contract addresses.
  4. Utility functions for bytecode preparation and address manipulation required for complex deployment patterns.
- Salt generation methodology ensures:
  1. Unique contract addresses for each deployer using the same salt, preventing deployment conflicts and enabling parallel deployments.
  2. Deterministic addresses for the same deployer and salt combination across all networks, enabling consistent multi-chain UX.
  3. Predictable address computation before deployment for integration planning and cross-chain address verification.
- Bytecode validation is handled by the underlying BytecodeProvider, ensuring only audited and verified contracts can be deployed.
- The contract serves as the foundation for all specialized factory contracts in the BytecodeRepository ecosystem, promoting code reuse and consistent behavior.
- Derived factory contracts can focus on protocol-specific logic while inheriting battle-tested deployment infrastructure and security guarantees.
- Address computation functions support both single-contract and multi-contract deployment patterns required for complex protocols and interconnected systems.

### bytecodeProvider

```solidity
contract IBytecodeProvider bytecodeProvider
```

Smart contract to retrieve bytecodes from. Can be either VersionController or L2DeployManager.

### constructor

```solidity
constructor(contract IBytecodeProvider _bytecodeProvider) internal
```

### _getInitCode

```solidity
function _getInitCode(struct Types.BytecodeVersion _bytecodeVersion) internal view returns (bytes)
```

Retrieves bytecode from Bytecode provider.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _bytecodeVersion | struct Types.BytecodeVersion | Version of contract type to retrieve. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes | Bytecode. |

### _deployContractType

```solidity
function _deployContractType(struct Types.BytecodeVersion _bytecodeVersion, bytes _constructorArgs, bytes32 _salt) internal returns (address)
```

Prepares bytecode with params and deploys a smart contract of specified contract type and version.

_Uses Create2 library by OpenZeppelin.
Unique salt for deployment consists of _salt and msg.sender address._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _bytecodeVersion | struct Types.BytecodeVersion | Version of contract to deploy. |
| _constructorArgs | bytes | Encoded constructor arguments. |
| _salt | bytes32 | Parameter necessary for deployment via Create2. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | Address of deployed smart contract. |

### _deployContract

```solidity
function _deployContract(bytes _bytecodeWithParams, bytes32 _salt) internal returns (address)
```

Deploys a smart contract of specified contract type and version.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _bytecodeWithParams | bytes | Encoded bytecode and constructor arguments. |
| _salt | bytes32 | Parameter necessary for deployment via Create2. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | Address of deployed smart contract. |

### _computeContractTypeAddress

```solidity
function _computeContractTypeAddress(struct Types.BytecodeVersion _bytecodeVersion, bytes _constructorArgs, bytes32 _salt, address _deployer) internal view returns (address)
```

Prepares bytecode with params and computes a pre-deployed address of smart contract.

_Uses Create2 library by OpenZeppelin._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _bytecodeVersion | struct Types.BytecodeVersion | Version of contract to compute pre-deployed address for. |
| _constructorArgs | bytes | Encoded constructor arguments. |
| _salt | bytes32 | Parameter necessary for deployment via Create2. |
| _deployer | address | Address of the deployer. Necessary for unique salt generation. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | Address of deployed smart contract. |

### _computeContractAddress

```solidity
function _computeContractAddress(bytes _bytecodeWithParams, bytes32 _salt, address _deployer) internal view returns (address)
```

Computes a pre-deployed address of smart contract.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _bytecodeWithParams | bytes | Encoded bytecode and constructor arguments. |
| _salt | bytes32 | Parameter necessary for deployment via Create2. |
| _deployer | address | Address of the deployer. Necessary for unique salt generation. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | Address of deployed smart contract. |

### addressToBytes32

```solidity
function addressToBytes32(address addr) internal pure returns (bytes32 result)
```

A helper functon for converting address into bytes32.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| addr | address | Address to convert. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| result | bytes32 | Address encoded into bytes32. |

