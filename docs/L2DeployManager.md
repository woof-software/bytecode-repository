# Solidity API

## L2DeployManager

This contract receives audited bytecode from L1 via Chainlink CCIP and enables secure, deterministic contract deployment on Layer 2 networks.
- The contract acts as a CCIP receiver, validating and storing bytecode transmitted from the trusted L1DeployManager with cryptographic integrity guarantees.
- Bytecode is stored using SSTORE2 optimization for gas-efficient persistence on L2 networks, supporting contracts larger than 24KB through intelligent chunking.
- Deployment functionality mirrors L1DeployManager exactly, ensuring identical CREATE2 addresses across all networks for seamless multi-chain UX.
- Integration as a BytecodeProvider enables specialized factories to retrieve stored bytecode for complex multi-contract deployment patterns.
- CCIP message validation ensures only bytecode from authorized L1DeployManager can be stored, preventing unauthorized bytecode injection.
- Anyone is able to:
  1. Deploy stored bytecode using CREATE2 with deterministic addresses matching L1 deployments for consistent multi-chain contract addresses.
  2. Compute deployment addresses before actual deployment for predictable contract planning and integration.
  3. Query stored bytecode availability to verify cross-chain synchronization status and plan deployments.
  4. Retrieve bytecode for custom deployment logic or verification purposes through the BytecodeProvider interface.
- The contract automatically handles:
  1. CCIP message reception and validation from trusted L1DeployManager to ensure bytecode authenticity and prevent malicious injections.
  2. Bytecode storage using SSTORE2 with automatic chunking for large contracts exceeding network gas limits or size constraints.
  3. Address computation using identical salt generation as L1DeployManager, guaranteeing cross-chain address consistency.
  4. Integration with factory contracts via BytecodeProvider interface for specialized deployment patterns and protocol-specific logic.
- Bytecode integrity is maintained through cryptographic hashing and validation, ensuring deployed contracts match exactly with L1-approved versions.
- The contract serves as the canonical L2 endpoint for BytecodeRepository ecosystem, enabling trustless multi-chain deployment with audit verification.
- Factory contracts and custom deployment tools can retrieve bytecode through the IBytecodeProvider interface for specialized deployment patterns.
- The system maintains a complete audit trail of received bytecode with CCIP message IDs for transparency and debugging purposes.

### l1DeployManager

```solidity
address l1DeployManager
```

### constructor

```solidity
constructor(address _l1DeployManager, address _router) public
```

### deploy

```solidity
function deploy(struct Types.BytecodeVersion _bytecodeVersion, bytes32 _salt, bytes _constructorParams) external returns (address)
```

Allows anyone to deploy a certain version of bytecode on the current network.

_Bytecode must be sent from the L1DeployManager.
Bytecode will be deployed through the appropriate Factory if it is set. Otherwise, L2DeployManager will try to deploy it via Create2._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _bytecodeVersion | struct Types.BytecodeVersion | A specific version of contract type to deploy. |
| _salt | bytes32 | A value necessary to generate a unique salt for Create2. |
| _constructorParams | bytes | parameters necessary to deploy a specified contract. |

### getVerifiedBytecode

```solidity
function getVerifiedBytecode(struct Types.BytecodeVersion _version) public view returns (bytes)
```

Returns a bytecode of the specified version.

_Can be used to validate if bytecode was sent to the current network._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _version | struct Types.BytecodeVersion | A version of bytecode for which to return bytecode. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bytes | Bytecode of the specified contract type and its version. |

### versionExists

```solidity
function versionExists(struct Types.BytecodeVersion _version) external view returns (bool)
```

### computeAddress

```solidity
function computeAddress(struct Types.BytecodeVersion _bytecodeVersion, bytes32 _salt, bytes _constructorParams, address _deployer) external view returns (address)
```

Computes a pre-deployed addresses of specified contract type and version.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _bytecodeVersion | struct Types.BytecodeVersion |  |
| _salt | bytes32 | A value necessary to generate a unique salt for Create2. |
| _constructorParams | bytes | encoded parameters necessary to deploy a specified contract. |
| _deployer | address | Address of deployer. Necessary for unique salt generation. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | Address of computed pre-deployed smart contract. |

### _ccipReceive

```solidity
function _ccipReceive(struct Client.Any2EVMMessage any2EvmMessage) internal
```

Helper function for receiving messages from L1DeployManager.

_The sender of the message from Ethereum must be L1DeployManager._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| any2EvmMessage | struct Client.Any2EVMMessage | params necessary for the cross-chain message. Data contains bytecode hash and its bytecode. |

