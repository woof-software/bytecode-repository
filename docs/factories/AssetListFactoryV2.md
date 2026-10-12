# Solidity API

## AssetListFactoryV2

This factory contract deploys Compound AssetList implementations with version control and timelock governance integration for secure protocol upgrades.
- The contract is a drop-in replacement for Compound's AssetListFactory: it exposes the same `createAssetList` function and `AssetListCreated` event, so it can be set as the asset list factory of a Comet proxy in the Compound V3 Configurator and called through its `deployAssetList` function.
- Version management enforces iterative major version upgrades through timelock governance, preventing unauthorized or non-sequential protocol updates.
- Deployment targets the AssetList contract type, which stores collateral asset configurations of markets with extended asset capacity. A deployed AssetList is an implementation with disabled initializers, intended to be used through the AssetList proxy of a Comet.
- Only the immutable part of asset configurations (asset, decimals, price feed) is passed to the AssetList constructor. Collateral factors and supply caps are not handled by this factory: they are kept in the storage of the AssetList proxy.
- Automatic salt generation using an internal counter ensures unique deployment addresses while maintaining deterministic behavior for identical configurations.
- Integration with BytecodeRepository ecosystem provides audit verification and cross-chain deployment consistency for AssetList implementations.
- Timelock (governance contract) is able to:
  1. Upgrade the factory to use new major versions of AssetList following iterative upgrade constraints (N+1 major version only).
  2. Validate that new versions exist in the BytecodeRepository before approval, ensuring only audited implementations are deployed.
  3. Control the pace of protocol upgrades through time-delayed execution and community governance processes.
- Anyone is able to:
  1. Deploy new AssetList implementations using the current approved version with the immutable part of Compound V3 asset configurations.
- The contract automatically handles:
  1. Bytecode retrieval from BytecodeProvider with version validation and audit verification integration.
  2. Salt generation using internal counter to ensure unique addresses while maintaining deployment predictability.
  3. Deployment via inherited BaseFactory infrastructure for security and consistency.
- Version constraints ensure protocol security by preventing arbitrary version jumps and requiring sequential major version upgrades.

### ASSET_LIST_CT

```solidity
bytes32 ASSET_LIST_CT
```

The contract type deployed by this factory: AssetList.

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
New version must be released._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _newVersion | struct Types.VersionWithAlternative | New version of the contract type. |

### createAssetList

```solidity
function createAssetList(struct IAssetListStructs.ImmutableAssetConfig[] assetConfigs) external returns (address assetList)
```

Deploys a new AssetList implementation with the current version.

_The function is compatible with Compound's AssetListFactory interface used by the Compound V3 Configurator.
Factors and supply caps are not part of the AssetList constructor, they are kept in the storage of the AssetList proxy._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| assetConfigs | struct IAssetListStructs.ImmutableAssetConfig[] | The immutable part of the asset configurations passed to the AssetList constructor. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| assetList | address | Address of the newly deployed AssetList implementation. |

