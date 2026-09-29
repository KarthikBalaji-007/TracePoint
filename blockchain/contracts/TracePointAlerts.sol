// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Stores only coarse alert coordination metadata. Case data and scores stay off-chain.
contract TracePointAlerts {
    bytes32 public constant ALERT_PUBLISHER_ROLE = keccak256("ALERT_PUBLISHER_ROLE");
    bytes32 public constant ALERT_RESPONDER_ROLE = keccak256("ALERT_RESPONDER_ROLE");
    bytes32 public constant ALERT_REVIEWER_ROLE = keccak256("ALERT_REVIEWER_ROLE");
    bytes32 public constant ALERT_RESOLVER_ROLE = keccak256("ALERT_RESOLVER_ROLE");

    enum Horizon { TWO_HOURS, SIX_HOURS, TWENTY_FOUR_HOURS }
    enum RiskBand { LOW, MEDIUM, HIGH, CRITICAL }
    enum State { NONE, PUBLISHED, ACKNOWLEDGED, ACTION_COMMITTED, RESOLVED, EXPIRED, DISPUTED }

    struct Alert {
        bytes32 jurisdictionId;
        bytes32 zoneId;
        bytes32 snapshotCommitment;
        bytes32 offchainRef;
        bytes32 modelVersion;
        bytes32 fusionVersion;
        address publisher;
        address acknowledger;
        address responder;
        uint64 publishedAt;
        uint64 expiry;
        uint64 responseDeadline;
        Horizon horizon;
        RiskBand riskBand;
        State state;
    }

    address public admin;
    mapping(bytes32 => mapping(address => bool)) private _roles;
    mapping(bytes32 => Alert) private _alerts;

    event RoleGranted(bytes32 indexed role, address indexed account, address indexed grantor);
    event AlertPublished(
        bytes32 indexed alertId,
        address indexed publisher,
        bytes32 indexed zoneId,
        bytes32 jurisdictionId,
        Horizon horizon,
        RiskBand riskBand,
        bytes32 modelVersion,
        bytes32 fusionVersion,
        bytes32 snapshotCommitment,
        bytes32 offchainRef,
        uint64 expiry
    );
    event AlertTransition(
        bytes32 indexed alertId,
        State indexed fromState,
        State indexed toState,
        address actor,
        uint8 coarseCode,
        uint64 occurredAt
    );

    error Unauthorized();
    error InvalidAlert();
    error InvalidTransition();
    error NotExpired();

    constructor() {
        admin = msg.sender;
        _roles[bytes32(0)][msg.sender] = true;
        emit RoleGranted(bytes32(0), msg.sender, msg.sender);
    }

    function hasRole(bytes32 role, address account) external view returns (bool) {
        return _roles[role][account];
    }

    function grantRole(bytes32 role, address account) external {
        if (msg.sender != admin) revert Unauthorized();
        if (account == address(0) || role == bytes32(0)) revert InvalidAlert();
        _roles[role][account] = true;
        emit RoleGranted(role, account, msg.sender);
    }

    function publishAlert(
        bytes32 alertId,
        bytes32 jurisdictionId,
        bytes32 zoneId,
        Horizon horizon,
        RiskBand riskBand,
        bytes32 modelVersion,
        bytes32 fusionVersion,
        bytes32 snapshotCommitment,
        bytes32 offchainRef,
        uint64 expiry,
        uint64 responseDeadline
    ) external {
        _requireRole(ALERT_PUBLISHER_ROLE);
        if (
            alertId == bytes32(0) || jurisdictionId == bytes32(0) || zoneId == bytes32(0)
                || snapshotCommitment == bytes32(0) || offchainRef == bytes32(0)
                || _alerts[alertId].state != State.NONE || expiry <= block.timestamp
                || (responseDeadline != 0 && (responseDeadline <= block.timestamp || responseDeadline > expiry))
        ) revert InvalidAlert();

        Alert storage alert = _alerts[alertId];
        alert.jurisdictionId = jurisdictionId;
        alert.zoneId = zoneId;
        alert.snapshotCommitment = snapshotCommitment;
        alert.offchainRef = offchainRef;
        alert.modelVersion = modelVersion;
        alert.fusionVersion = fusionVersion;
        alert.publisher = msg.sender;
        alert.publishedAt = uint64(block.timestamp);
        alert.expiry = expiry;
        alert.responseDeadline = responseDeadline;
        alert.horizon = horizon;
        alert.riskBand = riskBand;
        alert.state = State.PUBLISHED;

        emit AlertPublished(alertId, msg.sender, zoneId, jurisdictionId, horizon, riskBand,
            modelVersion, fusionVersion, snapshotCommitment, offchainRef, expiry);
    }

    function acknowledge(bytes32 alertId) external {
        _requireRole(ALERT_RESPONDER_ROLE);
        Alert storage alert = _existing(alertId);
        if (alert.state != State.PUBLISHED || block.timestamp >= alert.expiry) revert InvalidTransition();
        alert.acknowledger = msg.sender;
        _transition(alertId, alert, State.ACKNOWLEDGED, 0);
    }

    function commitResponse(bytes32 alertId, uint64 responseDeadline, uint8 coarseCode) external {
        _requireRole(ALERT_RESPONDER_ROLE);
        Alert storage alert = _existing(alertId);
        if (
            alert.state != State.ACKNOWLEDGED || coarseCode > 7 || responseDeadline <= block.timestamp
                || responseDeadline > alert.expiry
        ) revert InvalidTransition();
        alert.responder = msg.sender;
        alert.responseDeadline = responseDeadline;
        _transition(alertId, alert, State.ACTION_COMMITTED, coarseCode);
    }

    function resolve(bytes32 alertId, uint8 coarseCode) external {
        if (!_roles[ALERT_RESOLVER_ROLE][msg.sender] && !_roles[ALERT_REVIEWER_ROLE][msg.sender]) {
            revert Unauthorized();
        }
        Alert storage alert = _existing(alertId);
        if ((alert.state != State.ACTION_COMMITTED && alert.state != State.DISPUTED) || coarseCode > 7) {
            revert InvalidTransition();
        }
        _transition(alertId, alert, State.RESOLVED, coarseCode);
    }

    function dispute(bytes32 alertId, uint8 coarseCode) external {
        _requireRole(ALERT_REVIEWER_ROLE);
        Alert storage alert = _existing(alertId);
        if ((alert.state != State.PUBLISHED && alert.state != State.ACKNOWLEDGED) || coarseCode > 7) {
            revert InvalidTransition();
        }
        _transition(alertId, alert, State.DISPUTED, coarseCode);
    }

    function expire(bytes32 alertId) external {
        Alert storage alert = _existing(alertId);
        bool eligibleState = alert.state == State.PUBLISHED || alert.state == State.ACTION_COMMITTED
            || alert.state == State.DISPUTED;
        bool deadlinePassed = alert.state == State.ACTION_COMMITTED && alert.responseDeadline != 0
            && block.timestamp >= alert.responseDeadline;
        if (!eligibleState || (block.timestamp < alert.expiry && !deadlinePassed)) revert NotExpired();
        _transition(alertId, alert, State.EXPIRED, 0);
    }

    function getAlert(bytes32 alertId) external view returns (Alert memory) {
        return _existingView(alertId);
    }

    function _existing(bytes32 alertId) private view returns (Alert storage alert) {
        alert = _alerts[alertId];
        if (alert.state == State.NONE) revert InvalidAlert();
    }

    function _existingView(bytes32 alertId) private view returns (Alert storage alert) {
        alert = _alerts[alertId];
        if (alert.state == State.NONE) revert InvalidAlert();
    }

    function _requireRole(bytes32 role) private view {
        if (!_roles[role][msg.sender]) revert Unauthorized();
    }

    function _transition(bytes32 alertId, Alert storage alert, State next, uint8 coarseCode) private {
        State previous = alert.state;
        alert.state = next;
        emit AlertTransition(alertId, previous, next, msg.sender, coarseCode, uint64(block.timestamp));
    }
}
