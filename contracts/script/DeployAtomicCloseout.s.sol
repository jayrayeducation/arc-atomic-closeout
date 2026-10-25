// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AtomicCloseout} from "../AtomicCloseout.sol";

/// @notice Owner-run deployment of AtomicCloseout to Arc Testnet (5042002) or Arc Mainnet (5042).
/// @dev Nothing here runs automatically. Mainnet additionally requires CONFIRM_MAINNET=I_UNDERSTAND_THIS_USES_REAL_USDC.
///      Never pass a raw private key on the command line: use a Foundry keystore (`--account`) or a hardware wallet.
///      Dry run (no broadcast):  forge script contracts/script/DeployAtomicCloseout.s.sol --rpc-url $ARC_RPC_URL
///      Broadcast (you decide):   add `--broadcast --account <keystore-name>`
contract DeployAtomicCloseout is Script {
    /// Arc's ERC-20 interface for USDC (6 decimals). Same address on mainnet and testnet per docs.arc.io.
    address internal constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    function run() external returns (AtomicCloseout deployed) {
        require(block.chainid == 5042002 || block.chainid == 5042, "Unsupported chain: use Arc Testnet or Arc Mainnet");
        if (block.chainid == 5042) {
            require(
                keccak256(bytes(vm.envOr("CONFIRM_MAINNET", string("")))) == keccak256(bytes("I_UNDERSTAND_THIS_USES_REAL_USDC")),
                "Mainnet deploy not confirmed"
            );
        }
        address usdc = vm.envOr("USDC_ADDRESS", ARC_USDC);
        require(usdc == ARC_USDC, "USDC_ADDRESS must be Arc's USDC ERC-20 interface");
        console.log("Deploying AtomicCloseout on chain", block.chainid);
        vm.startBroadcast();
        deployed = new AtomicCloseout(IERC20(usdc));
        vm.stopBroadcast();
        console.log("AtomicCloseout:", address(deployed));
    }
}
