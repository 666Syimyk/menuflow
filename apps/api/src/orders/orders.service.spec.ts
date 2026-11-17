import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  it('rejects an empty order before accessing the database', async () => {
    const service = new OrdersService({} as any, {} as any, {} as any);

    await expect(
      service.createOrder({
        restaurantId: 'restaurant-1',
        tableId: 'table-1',
        items: [],
      }),
    ).rejects.toThrow('at least one item');
  });
});
