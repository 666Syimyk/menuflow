import { Role } from '@prisma/client';
import { UsersService } from './users.service';

describe('UsersService', () => {
  it('prevents an admin from creating privileged roles', async () => {
    const service = new UsersService({} as any);

    await expect(
      service.create({
        restaurantId: 'restaurant-1',
        role: Role.SUPER_ADMIN,
        name: 'Invalid user',
        login: 'invalid',
        password: 'secret123',
      }),
    ).rejects.toThrow('ADMIN can create only');
  });
});
