# Solidity API

## CometFactoryV2

This factory contract deploys Compound Comet protocol implementations with version control and timelock governance integration for secure protocol upgrades.
- The contract is specifically designed for Compound V3 Configurator compatibility, enabling seamless integration with existing Compound governance and deployment infrastructure.
- Version management enforces iterative major version upgrades through timelock governance, preventing unauthorized or non-sequential protocol updates.
- Deployment targets the CometWithAssetList implementation, enabling markets with extended asset capacity.
- Automatic salt generation using an internal counter ensures unique deployment addresses while maintaining deterministic behavior for identical configurations.
- Integration with BytecodeRepository ecosystem provides audit verification and cross-chain deployment consistency for Comet protocol implementations.
- Timelock (governance contract) is able to:
  1. Upgrade the factory to use new major versions of Comet implementations following iterative upgrade constraints (N+1 major version only).
  2. Validate that new versions exist in the BytecodeRepository before approval, ensuring only audited implementations are deployed.
  3. Control the pace of protocol upgrades through time-delayed execution and community governance processes.
- Anyone is able to:
  1. Deploy new CometWithAssetList implementations using the current approved version with Compound V3-compatible configuration structures.
  2. Deploy markets with custom configurations including interest rate models, collateral assets, and protocol parameters.
- The contract automatically handles:
  1. Bytecode retrieval from BytecodeProvider with version validation and audit verification integration.
  2. Salt generation using internal counter to ensure unique addresses while maintaining deployment predictability.
  3. Configuration validation and deployment via inherited BaseFactory infrastructure for security and consistency.
  4. Deployment of the CometWithAssetList implementation, providing extended asset capacity.
- Version constraints ensure protocol security by preventing arbitrary version jumps and requiring sequential major version upgrades.
- The factory maintains compatibility with existing Compound tooling while adding BytecodeRepository audit verification and cross-chain deployment capabilities.
- Deployment patterns follow Compound V3 standards for seamless integration with existing governance, monitoring, and operational infrastructure.

### COMET_CT

```solidity
bytes32 COMET_CT
```

The contract type deployed by this factory: CometWithAssetList.

### timelock

```solidity
address timelock
```

Address of timelock which can set the version of the bytecode.

### counters

```solidity
mapping(address => uint256) counters
```

A value used for the salt generation during deployments.

### version

```solidity
struct Types.VersionWithAlternative version
```

Version of the bytecode used for deployments.

### constructor

```solidity
constructor(struct Types.VersionWithAlternative _initialVersion, contract IBytecodeProvider _bytecodeProvider, address _timelock) public
```

### setVersion

```solidity
function setVersion(struct Types.VersionWithAlternative _newVersion) external
```

Sets the version of the contract type used for the deployment.

_Only timelock can call this function.
The new version's major version must be equal to previous version's major version + 1.
New version must can be the same as the current one._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _newVersion | struct Types.VersionWithAlternative | New version of the contract type. |

### clone

```solidity
function clone(struct Configuration config) external returns (address)
```

Deploys a new CometWithAssetList implementation with the current version.

_The function is compatible with the Compound V3 Configurator smart contract._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| config | struct Configuration | constructor argumets for the CometWithAssetList. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | Address of the newly deployed CometWithAssetList implementation. |

