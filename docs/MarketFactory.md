# Solidity API

## MarketFactory

### COMET_EXT_CT

```solidity
bytes32 COMET_EXT_CT
```

### COMET_CT

```solidity
bytes32 COMET_CT
```

### bytecodeProvider

```solidity
contract IBytecodeProvider bytecodeProvider
```

### cometProxyAdmin

```solidity
address cometProxyAdmin
```

### constructor

```solidity
constructor(contract IBytecodeProvider _bytecodeProvider, address _cometProxyAdmin) public
```

### deployComet

```solidity
function deployComet(struct IVersionController.VersionWithAlternative _cometExtVersion, struct IVersionController.VersionWithAlternative _cometVersion, bytes _encodedParams, bytes32 _salt) external returns (address, address, address)
```

### deployCometFactory

```solidity
function deployCometFactory() external
```

### addressToBytes32

```solidity
function addressToBytes32(address addr) internal pure returns (bytes32 result)
```

