"""Working challenge code. All amounts are whole cents."""


def delivery_fee(subtotal_cents: int) -> int:
    """Reject negative subtotals; charge 500 cents for orders below 5000."""
    if subtotal_cents < 0:
        raise ValueError("Subtotal cannot be negative")
    if subtotal_cents == 0:
        return 0
    if subtotal_cents >= 5000:
        return 0
    return 500


def order_total(subtotal_cents: int) -> int:
    """Return the subtotal plus its delivery fee."""
    return subtotal_cents + delivery_fee(subtotal_cents)


if __name__ == "__main__":
    for subtotal in [0, 1, 4999, 5000, 7500]:
        print(f"Subtotal: {subtotal}, delivery: {delivery_fee(subtotal)}, "
              f"total: {order_total(subtotal)}")
