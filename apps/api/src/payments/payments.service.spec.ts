import { Decimal } from '@prisma/client/runtime/library';
import { PaymentMethod } from '@prisma/client';
import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  it('rejects payment below the order total', async () => {
    const transactionClient = {
      order: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'order-1',
          tableId: 'table-1',
          status: 'BILL_REQUESTED',
          total: new Decimal(100),
          payments: [],
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback(transactionClient),
      ),
    };
    const service = new PaymentsService(
      prisma as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.createPayment({
        orderId: 'order-1',
        restaurantId: 'restaurant-1',
        method: PaymentMethod.CASH,
        amount: 99,
        createdById: 'cashier-1',
      }),
    ).rejects.toThrow('below order total');
  });
});
