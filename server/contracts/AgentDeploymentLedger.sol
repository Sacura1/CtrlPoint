// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title CtrlPoint Agent Deployment Ledger
/// @notice Append-only public proof layer for x402-paid AI agent deployments.
contract AgentDeploymentLedger {
    enum Status {
        Unknown,
        Paid,
        Delivered,
        Failed
    }

    struct DeploymentProof {
        address payer;
        uint256 amount;
        uint256 paidAt;
        uint256 deliveredAt;
        Status status;
        bytes32 requestHash;
        bytes32 artifactHash;
        bytes32 paymentTxHash;
        string mnsName;
    }

    address public owner;
    mapping(bytes32 => DeploymentProof) public proofs;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event AgentDeploymentPaid(
        bytes32 indexed deploymentId,
        address indexed payer,
        uint256 amount,
        bytes32 indexed requestHash,
        bytes32 paymentTxHash,
        string mnsName,
        uint256 paidAt
    );
    event AgentDeploymentDelivered(
        bytes32 indexed deploymentId,
        bytes32 artifactHash,
        string mnsName,
        uint256 deliveredAt
    );
    event AgentDeploymentFailed(bytes32 indexed deploymentId, bytes32 reasonHash, uint256 failedAt);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(address owner_) {
        require(owner_ != address(0), "zero owner");
        owner = owner_;
        emit OwnershipTransferred(address(0), owner_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function recordPaid(
        bytes32 deploymentId,
        address payer,
        uint256 amount,
        bytes32 requestHash,
        bytes32 paymentTxHash,
        string calldata mnsName,
        uint256 paidAt
    ) external onlyOwner {
        require(deploymentId != bytes32(0), "empty deployment");
        require(payer != address(0), "zero payer");
        DeploymentProof storage proof = proofs[deploymentId];
        require(proof.status == Status.Unknown, "already recorded");

        proof.payer = payer;
        proof.amount = amount;
        proof.paidAt = paidAt == 0 ? block.timestamp : paidAt;
        proof.status = Status.Paid;
        proof.requestHash = requestHash;
        proof.paymentTxHash = paymentTxHash;
        proof.mnsName = mnsName;

        emit AgentDeploymentPaid(deploymentId, payer, amount, requestHash, paymentTxHash, mnsName, proof.paidAt);
    }

    function markDelivered(
        bytes32 deploymentId,
        bytes32 artifactHash,
        string calldata mnsName
    ) external onlyOwner {
        DeploymentProof storage proof = proofs[deploymentId];
        require(proof.status == Status.Paid || proof.status == Status.Delivered, "not paid");
        proof.status = Status.Delivered;
        proof.artifactHash = artifactHash;
        if (bytes(mnsName).length > 0) proof.mnsName = mnsName;
        proof.deliveredAt = block.timestamp;

        emit AgentDeploymentDelivered(deploymentId, artifactHash, proof.mnsName, proof.deliveredAt);
    }

    function markFailed(bytes32 deploymentId, bytes32 reasonHash) external onlyOwner {
        DeploymentProof storage proof = proofs[deploymentId];
        require(proof.status == Status.Paid, "not paid");
        proof.status = Status.Failed;
        emit AgentDeploymentFailed(deploymentId, reasonHash, block.timestamp);
    }
}
