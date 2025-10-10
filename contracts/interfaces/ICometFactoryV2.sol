// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Types } from "./Types.sol";

interface ICometFactoryV2 {
    event VersionSet(Types.VersionWithAlternative _newVersion);

    error OnlyTimelock();
    error OnlyIterativeUpdate();
    error NonExistingVersion();
    error SameVersion();
    error InvalidMinorVersion();
}
