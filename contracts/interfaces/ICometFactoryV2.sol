pragma solidity 0.8.30;

interface ICometFactoryV2 {
    event VersionSet(Types.VersionWithAlternative _newVersion);

    error OnlyTimelock();
    error OnlyIterativeUpdate();
    error NonExistingVersion();
}
