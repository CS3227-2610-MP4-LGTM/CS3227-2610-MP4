/** Working challenge code. All amounts are whole cents. */
public class DeliveryFee {
    /** Reject negative subtotals; charge 500 cents for orders below 5000. */
    public static long deliveryFee(long subtotalCents) {
        if (subtotalCents < 0) {
            throw new IllegalArgumentException("Subtotal cannot be negative");
        }
        if (subtotalCents == 0) {
            return 0;
        }
        if (subtotalCents >= 5000) {
            return 0;
        }
        return 500;
    }

    /** Return the subtotal plus its delivery fee. */
    public static long orderTotal(long subtotalCents) {
        return subtotalCents + deliveryFee(subtotalCents);
    }

    public static void main(String[] args) {
        long[] subtotals = {0, 1, 4999, 5000, 7500};
        for (long subtotal : subtotals) {
            System.out.println("Subtotal: " + subtotal
                    + ", delivery: " + deliveryFee(subtotal)
                    + ", total: " + orderTotal(subtotal));
        }
    }
}
