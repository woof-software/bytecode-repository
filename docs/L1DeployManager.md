# Solidity API

## L1DeployManager

This contract orchestrates smart contract deployments on Ethereum L1 and facilitates secure cross-chain bytecode distribution to L2 networks via Chainlink CCIP.
- The contract retrieves audited bytecode from VersionController and deploys contracts using deterministic CREATE2 addresses for multi-chain consistency.
- Cross-chain bytecode transmission uses Chainlink CCIP for cryptographically secure message passing with decentralized validation and replay protection.
- Role-based access control ensures only authorized developers can deploy contracts and initiate cross-chain bytecode synchronization.
- Developers (Key Developer and Sub Developer roles) are able to:
  1. Deploy audited bytecode directly on Ethereum mainnet using CREATE2 for deterministic addresses.
  2. Send verified bytecode to configured L2 networks via Chainlink CCIP for multi-chain deployment consistency.
  3. Compute deployment addresses before actual deployment for predictable multi-chain contract addresses.
  4. Utilize integrated factory contracts for specialized deployment patterns requiring multiple coordinated deployments.
- Governors are able to:
  1. Configure supported L2 networks with their CCIP chain selectors and corresponding L2DeployManager addresses.
  2. Enable or disable cross-chain bytecode transmission to specific networks based on operational requirements.
  3. Withdraw ETH from the contract's balance.
  4. Upgrade the contract implementation via UUPS proxy pattern.
- Anyone is able to:
  1. Donate ETH to the contract to subsidize cross-chain message costs for developers and community deployments.
  2. Query chain configurations and deployment status for transparency and integration planning.
- The contract validates bytecode audit status before deployment, ensuring only auditor-verified contracts reach production networks.
- CCIP message encoding includes bytecode hash and full initCode, with automatic chunking via SSTORE2 for large contracts exceeding network limits.
- Address computation matches L2DeployManager behavior exactly, guaranteeing identical contract addresses across all supported networks.
- The contract serves as the canonical L1 coordinator for the BytecodeRepository ecosystem, bridging audited bytecode storage with multi-chain deployment execution.

### DEFAULT_ADMIN_ROLE

```solidity
bytes32 DEFAULT_ADMIN_ROLE
```

Admin role for AccessControl.

### GUARDIAN_ROLE

```solidity
bytes32 GUARDIAN_ROLE
```

Guardian role for AccessControl.

### versionController

```solidity
contract IVersionController versionController
```

Address of the VersionControlles SC.

### routerClient

```solidity
contract IRouterClient routerClient
```

Address of Chainlink CCIP Router.

### chainConfigs

```solidity
mapping(uint256 => struct IL1DeployManager.ChainConfig) chainConfigs
```

Stores chain config per each supported chain.

### isVersionSentToChain

```solidity
mapping(uint256 => mapping(bytes32 => bool)) isVersionSentToChain
```

Inidicates whether a specific version of contract type was sent to a certain chain.

### constructor

```solidity
constructor(contract IVersionController _versionController, contract IRouterClient _routerClient) public
```

### receive

```solidity
receive() external payable
```

Allows anyone to donate ETH which can later be used by devs to pay for cross-chain messages.

### initialize

```solidity
function initialize() external
```

### onlyGovernor

```solidity
modifier onlyGovernor()
```

Validates that the caller is the Governor.

_The role is checked through the VersionController._

### onlyGuardian

```solidity
modifier onlyGuardian()
```

Validates that the caller is the Guardian.

_The role is checked through the VersionController._

### onlyDeveloperOrGovernor

```solidity
modifier onlyDeveloperOrGovernor()
```

Validates that the caller is developer or governor.

_The role is checked through the VersionController._

### supportedChain

```solidity
modifier supportedChain(uint256 _chainId)
```

Validates that the network with provided chain id is supported.

### setChainConfig

```solidity
function setChainConfig(uint256 _chainId, struct IL1DeployManager.ChainConfig _config) external
```

Sets the chain config necessary for cross-chain messaging.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _chainId | uint256 | ID of a network for which to set the config. |
| _config | struct IL1DeployManager.ChainConfig | parameters necessary for cross-chain messaging with specified network. |

### withdrawETH

```solidity
function withdrawETH() external
```

Allows the Governor to withdraw all the ETH stored on the smart contract's balance.

### revokeDeveloperOnOtherChain

```solidity
function revokeDeveloperOnOtherChain(uint256 _chainId, uint256 _gasLimit, address _account) external payable
```

Revokes developer role on other chain.

_Can only be called by Guardian.
Account to revoke must first be revoked on VersionController._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _chainId | uint256 | ID of the network on which to revoke developer. |
| _gasLimit | uint256 | Gas limit for call on other chain. |
| _account | address | Address of developer to revoke on other chain. |

### sendBytecodeToOtherChain

```solidity
function sendBytecodeToOtherChain(struct Types.BytecodeVersion _bytecodeVersion, uint256 _chainId, uint256 _gasLimit) external payable
```

Allows any developer to initiate sending of specific bytecode version to another network.

_Bytecode can be sent only once to a certain network.
Bytecode must be uploaded and verified in the VersionController.
Developers should provide ETH along with calling this function to pay for cross-chain message
unless the ETH is already donated through the receive() function._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _bytecodeVersion | struct Types.BytecodeVersion | A specific version of contract type. |
| _chainId | uint256 | ID of the network to which to send bytecode. Chain ID must be registered by the Governor. |
| _gasLimit | uint256 | Gas limit for call on other chain. |

### becomeDeveloperOnOtherChain

```solidity
function becomeDeveloperOnOtherChain(uint256 _chainId, uint256 _gasLimit) external payable
```

Allows developer to obtain Developer role on other chain for a 3-month period.

_Caller must be a developer in VersionController._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _chainId | uint256 | ID of other chain. |
| _gasLimit | uint256 | Gas limit for call on other chain. |

### deploy

```solidity
function deploy(struct Types.BytecodeVersion _bytecodeVersion, bytes32 _salt, bytes _constructorParams) external payable returns (address)
```

Allows developers to deploy a certain version of bytecode on the Ethereum.

_Bytecode must be uploaded and verified in the VersionController.
Bytecode is deployed via Create2._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _bytecodeVersion | struct Types.BytecodeVersion | A specific version of contract type to deploy. |
| _salt | bytes32 | A value necessary to generate a unique salt for Create2. |
| _constructorParams | bytes | encoded parameters necessary to deploy a specified contract. |

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

### _authorizeUpgrade

```solidity
function _authorizeUpgrade(address newImplementation) internal
```

_Function that should revert when `msg.sender` is not authorized to upgrade the contract. Called by
{upgradeToAndCall}.

Normally, this function will use an xref:access.adoc[access control] modifier such as {Ownable-onlyOwner}.

```solidity
function _authorizeUpgrade(address) internal onlyOwner {}
```_

