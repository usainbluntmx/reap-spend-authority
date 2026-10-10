// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title SpendAuthority
/// @notice Politica de gasto onchain para un agente de IA que compra con una tarjeta Reap.
/// El dueño fija los limites; el agente (gateway) debe reservar contra la politica
/// ANTES de abrir el checkout en Reap y confirmar o liberar despues.
/// Los montos van en centavos de USD (43.67 USD = 4367).
contract SpendAuthority {
    enum ReservationStatus {
        None,
        Reserved,
        Confirmed,
        Released
    }

    enum Check {
        Ok,
        PolicyNotFound,
        Revoked,
        Expired,
        MerchantNotAllowed,
        OverPerPurchaseCap,
        MaxChargesReached,
        OverTotalCap
    }

    struct Policy {
        address owner;
        uint64 expiresAt;
        uint32 maxCharges;
        address agent;
        uint32 charges;
        bool revoked;
        uint128 totalCap;
        uint128 perPurchaseCap;
        uint128 spent;
    }

    struct Reservation {
        uint256 policyId;
        uint128 amount;
        ReservationStatus status;
    }

    uint256 public policyCount;
    uint256 public reservationCount;

    mapping(uint256 => Policy) private _policies;
    mapping(uint256 => mapping(bytes32 => bool)) private _merchantAllowed;
    mapping(uint256 => Reservation) private _reservations;

    event PolicyCreated(uint256 indexed policyId, address indexed owner, address indexed agent);
    event PolicyTerms(
        uint256 indexed policyId,
        uint128 totalCap,
        uint128 perPurchaseCap,
        uint32 maxCharges,
        uint64 expiresAt
    );
    event MerchantAllowed(uint256 indexed policyId, bytes32 indexed merchant);
    event PolicyRevoked(uint256 indexed policyId, address indexed owner);
    event PurchaseReserved(
        uint256 indexed policyId,
        uint256 indexed reservationId,
        bytes32 indexed merchant,
        uint128 amount,
        string quoteId
    );
    event PurchaseConfirmed(
        uint256 indexed policyId,
        uint256 indexed reservationId,
        uint128 chargedAmount,
        string checkoutId,
        string orderId
    );
    event PurchaseReleased(
        uint256 indexed policyId,
        uint256 indexed reservationId,
        uint128 amount,
        string reason
    );

    error NotOwner();
    error NotAgent();
    error InvalidPolicy();
    error NoMerchants();
    error ZeroAmount();
    error PolicyRejected(Check reason);
    error BadReservationState();
    error ChargeExceedsReservation();

    // ---------------------------------------------------------------- owner

    function createPolicy(
        address agent,
        uint128 totalCap,
        uint128 perPurchaseCap,
        uint64 expiresAt,
        uint32 maxCharges,
        bytes32[] memory merchants
    ) external returns (uint256 policyId) {
        if (
            agent == address(0) ||
            totalCap == 0 ||
            perPurchaseCap == 0 ||
            perPurchaseCap > totalCap ||
            maxCharges == 0 ||
            expiresAt <= block.timestamp
        ) revert InvalidPolicy();
        if (merchants.length == 0) revert NoMerchants();

        policyId = ++policyCount;
        Policy storage p = _policies[policyId];
        p.owner = msg.sender;
        p.agent = agent;
        p.expiresAt = expiresAt;
        p.maxCharges = maxCharges;
        p.totalCap = totalCap;
        p.perPurchaseCap = perPurchaseCap;

        _allowMerchants(policyId, merchants);

        emit PolicyCreated(policyId, msg.sender, agent);
        emit PolicyTerms(policyId, totalCap, perPurchaseCap, maxCharges, expiresAt);
    }

    function revokePolicy(uint256 policyId) external {
        Policy storage p = _policies[policyId];
        if (p.owner == address(0) || msg.sender != p.owner) revert NotOwner();
        p.revoked = true;
        emit PolicyRevoked(policyId, msg.sender);
    }

    function _allowMerchants(uint256 policyId, bytes32[] memory merchants) private {
        for (uint256 i = 0; i < merchants.length; i++) {
            _merchantAllowed[policyId][merchants[i]] = true;
            emit MerchantAllowed(policyId, merchants[i]);
        }
    }

    // ---------------------------------------------------------------- agent

    /// @notice Reserva presupuesto para una compra. Llamar con el finalAmount del quote de Reap.
    function reserve(
        uint256 policyId,
        bytes32 merchant,
        uint128 amount,
        string calldata quoteId
    ) external returns (uint256 reservationId) {
        Policy storage p = _policies[policyId];
        if (msg.sender != p.agent) revert NotAgent();
        if (amount == 0) revert ZeroAmount();

        Check c = check(policyId, merchant, amount);
        if (c != Check.Ok) revert PolicyRejected(c);

        p.spent += amount;
        p.charges += 1;

        reservationId = ++reservationCount;
        _reservations[reservationId] = Reservation(policyId, amount, ReservationStatus.Reserved);

        emit PurchaseReserved(policyId, reservationId, merchant, amount, quoteId);
    }

    /// @notice Registra el cobro real. Si Reap cobro menos de lo reservado, la diferencia vuelve al presupuesto.
    function confirm(
        uint256 reservationId,
        uint128 chargedAmount,
        string calldata checkoutId,
        string calldata orderId
    ) external {
        Reservation storage r = _reservations[reservationId];
        if (r.status != ReservationStatus.Reserved) revert BadReservationState();
        Policy storage p = _policies[r.policyId];
        if (msg.sender != p.agent) revert NotAgent();
        if (chargedAmount > r.amount) revert ChargeExceedsReservation();

        p.spent -= (r.amount - chargedAmount);
        r.status = ReservationStatus.Confirmed;

        emit PurchaseConfirmed(r.policyId, reservationId, chargedAmount, checkoutId, orderId);
    }

    /// @notice Libera una reserva cuando el checkout falla, expira o se cancela.
    function release(uint256 reservationId, string calldata reason) external {
        Reservation storage r = _reservations[reservationId];
        if (r.status != ReservationStatus.Reserved) revert BadReservationState();
        Policy storage p = _policies[r.policyId];
        if (msg.sender != p.agent) revert NotAgent();

        r.status = ReservationStatus.Released;
        p.spent -= r.amount;
        p.charges -= 1;

        emit PurchaseReleased(r.policyId, reservationId, r.amount, reason);
    }

    // ---------------------------------------------------------------- views

    /// @notice Evalua la politica sin gastar gas. El gateway lo usa para explicar rechazos.
    function check(uint256 policyId, bytes32 merchant, uint128 amount) public view returns (Check) {
        Policy storage p = _policies[policyId];
        if (p.owner == address(0)) return Check.PolicyNotFound;
        if (p.revoked) return Check.Revoked;
        if (block.timestamp >= p.expiresAt) return Check.Expired;
        if (!_merchantAllowed[policyId][merchant]) return Check.MerchantNotAllowed;
        if (amount > p.perPurchaseCap) return Check.OverPerPurchaseCap;
        if (p.charges >= p.maxCharges) return Check.MaxChargesReached;
        if (uint256(p.spent) + amount > p.totalCap) return Check.OverTotalCap;
        return Check.Ok;
    }

    function remaining(uint256 policyId) external view returns (uint256) {
        Policy storage p = _policies[policyId];
        return p.totalCap - p.spent;
    }

    function isMerchantAllowed(uint256 policyId, bytes32 merchant) external view returns (bool) {
        return _merchantAllowed[policyId][merchant];
    }

    function getPolicy(uint256 policyId) external view returns (Policy memory) {
        return _policies[policyId];
    }

    function getReservation(uint256 reservationId) external view returns (Reservation memory) {
        return _reservations[reservationId];
    }
}