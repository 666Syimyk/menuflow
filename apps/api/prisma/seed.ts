import {
  OrderStatus,
  PrismaClient,
  RestaurantStatus,
  Role,
  TableStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Запуск seed...');

  // ─── Супер-админ ─────────────────────────────────────────────────────────
  const superAdmin = await prisma.user.upsert({
    where: { login: 'superadmin' },
    update: {},
    create: {
      login: 'superadmin',
      passwordHash: await bcrypt.hash('superadmin123', 12),
      name: 'Супер Администратор',
      role: Role.SUPER_ADMIN,
    },
  });
  console.log('✅ Super admin:', superAdmin.login);

  // ─── Тарифы ──────────────────────────────────────────────────────────────
  const plans = await Promise.all([
    prisma.plan.upsert({
      where: { id: 'plan-start' },
      update: {},
      create: {
        id: 'plan-start',
        name: 'Start',
        price: 2990,
        periodDays: 30,
        limits: { tables: 10, staff: 5, photos: false, analytics: false },
        isActive: true,
      },
    }),
    prisma.plan.upsert({
      where: { id: 'plan-pro' },
      update: {},
      create: {
        id: 'plan-pro',
        name: 'Pro',
        price: 5990,
        periodDays: 30,
        limits: { tables: 30, staff: 20, photos: true, analytics: true },
        isActive: true,
      },
    }),
    prisma.plan.upsert({
      where: { id: 'plan-business' },
      update: {},
      create: {
        id: 'plan-business',
        name: 'Business',
        price: 9990,
        periodDays: 30,
        limits: { tables: 100, staff: 100, photos: true, analytics: true },
        isActive: true,
      },
    }),
  ]);
  console.log('✅ Тарифы:', plans.map((p) => p.name).join(', '));

  // ─── Демо-ресторан ────────────────────────────────────────────────────────
  const restaurant = await prisma.restaurant.upsert({
    where: { slug: 'demo-restaurant' },
    update: {},
    create: {
      name: 'Демо Ресторан',
      slug: 'demo-restaurant',
      phone: '+996 700 123 456',
      address: 'г. Бишкек, ул. Чуй 100',
      currency: 'KGS',
      isOpen: true,
      status: RestaurantStatus.ACTIVE,
      workingHours: {
        mon: { open: '09:00', close: '22:00' },
        tue: { open: '09:00', close: '22:00' },
        wed: { open: '09:00', close: '22:00' },
        thu: { open: '09:00', close: '22:00' },
        fri: { open: '09:00', close: '23:00' },
        sat: { open: '10:00', close: '23:00' },
        sun: { open: '10:00', close: '22:00' },
      },
    },
  });
  console.log('✅ Ресторан:', restaurant.name);

  // ─── Подписка ─────────────────────────────────────────────────────────────
  await prisma.subscription.upsert({
    where: { id: 'sub-demo' },
    update: {},
    create: {
      id: 'sub-demo',
      restaurantId: restaurant.id,
      planId: 'plan-pro',
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: 'ACTIVE',
    },
  });

  // ─── Сотрудники ───────────────────────────────────────────────────────────
  const [admin, waiter1, waiter2, cook, cashier] = await Promise.all([
    prisma.user.upsert({
      where: { login: 'admin_demo' },
      update: {},
      create: {
        login: 'admin_demo',
        passwordHash: await bcrypt.hash('admin123', 12),
        name: 'Администратор',
        role: Role.ADMIN,
        restaurantId: restaurant.id,
      },
    }),
    prisma.user.upsert({
      where: { login: 'waiter1' },
      update: {},
      create: {
        login: 'waiter1',
        passwordHash: await bcrypt.hash('waiter123', 12),
        name: 'Айгерим Садырова',
        role: Role.WAITER,
        restaurantId: restaurant.id,
      },
    }),
    prisma.user.upsert({
      where: { login: 'waiter2' },
      update: {},
      create: {
        login: 'waiter2',
        passwordHash: await bcrypt.hash('waiter123', 12),
        name: 'Тимур Асанов',
        role: Role.WAITER,
        restaurantId: restaurant.id,
      },
    }),
    prisma.user.upsert({
      where: { login: 'cook1' },
      update: {},
      create: {
        login: 'cook1',
        passwordHash: await bcrypt.hash('cook123', 12),
        name: 'Бакыт Жумалиев',
        role: Role.COOK,
        restaurantId: restaurant.id,
      },
    }),
    prisma.user.upsert({
      where: { login: 'cashier1' },
      update: {},
      create: {
        login: 'cashier1',
        passwordHash: await bcrypt.hash('cashier123', 12),
        name: 'Нурзат Карибаева',
        role: Role.CASHIER,
        restaurantId: restaurant.id,
      },
    }),
  ]);
  console.log('✅ Сотрудники созданы');

  // ─── Залы и столы ─────────────────────────────────────────────────────────
  const mainHall = await prisma.hall.upsert({
    where: { id: 'hall-main' },
    update: {},
    create: { id: 'hall-main', restaurantId: restaurant.id, name: 'Основной зал' },
  });
  const terraceHall = await prisma.hall.upsert({
    where: { id: 'hall-terrace' },
    update: {},
    create: { id: 'hall-terrace', restaurantId: restaurant.id, name: 'Терраса' },
  });

  // Создаём столы 1–10 в основном зале
  for (let i = 1; i <= 10; i++) {
    const tableId = `table-${i}`;
    const table = await prisma.table.upsert({
      where: { restaurantId_number: { restaurantId: restaurant.id, number: i } },
      update: {},
      create: {
        id: tableId,
        restaurantId: restaurant.id,
        hallId: i <= 7 ? mainHall.id : terraceHall.id,
        number: i,
        waiterId: i <= 5 ? waiter1.id : waiter2.id,
        status: TableStatus.FREE,
      },
    });

    // QR для каждого стола
    const existingQr = await prisma.qrCode.findFirst({ where: { tableId: table.id, isActive: true } });
    if (!existingQr) {
      const { customAlphabet } = await import('nanoid');
      const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 24);
      await prisma.qrCode.create({
        data: { tableId: table.id, token: `demo-table-${i}-${nanoid()}` },
      });
    }
  }
  console.log('✅ Столы и QR-коды созданы');

  // ─── Меню ─────────────────────────────────────────────────────────────────
  const [catHot, catSalads, catSoups, catDesserts, catDrinks] = await Promise.all([
    prisma.menuCategory.upsert({
      where: { id: 'cat-hot' },
      update: {},
      create: { id: 'cat-hot', restaurantId: restaurant.id, name: 'Горячие блюда', sortOrder: 1 },
    }),
    prisma.menuCategory.upsert({
      where: { id: 'cat-salads' },
      update: {},
      create: { id: 'cat-salads', restaurantId: restaurant.id, name: 'Салаты', sortOrder: 2 },
    }),
    prisma.menuCategory.upsert({
      where: { id: 'cat-soups' },
      update: {},
      create: { id: 'cat-soups', restaurantId: restaurant.id, name: 'Супы', sortOrder: 3 },
    }),
    prisma.menuCategory.upsert({
      where: { id: 'cat-desserts' },
      update: {},
      create: { id: 'cat-desserts', restaurantId: restaurant.id, name: 'Десерты', sortOrder: 4 },
    }),
    prisma.menuCategory.upsert({
      where: { id: 'cat-drinks' },
      update: {},
      create: { id: 'cat-drinks', restaurantId: restaurant.id, name: 'Напитки', sortOrder: 5 },
    }),
  ]);
  console.log('✅ Категории меню созданы');

  const dishes = [
    { id: 'd1', categoryId: catHot.id, name: 'Бешбармак', description: 'Традиционное кыргызское блюдо с мясом и тестом', price: 850, weight: 450, cookTimeMin: 20 },
    { id: 'd2', categoryId: catHot.id, name: 'Плов', description: 'Узбекский плов с говядиной и морковью', price: 650, weight: 400, cookTimeMin: 15 },
    { id: 'd3', categoryId: catHot.id, name: 'Шашлык из баранины', description: '300г отборной баранины на мангале', price: 990, weight: 300, cookTimeMin: 25 },
    { id: 'd4', categoryId: catHot.id, name: 'Куурдак', description: 'Жареное мясо с картофелем и луком', price: 750, weight: 380, cookTimeMin: 20 },
    { id: 'd5', categoryId: catSalads.id, name: 'Цезарь с курицей', description: 'Листья романо, куриное филе, пармезан, крутоны', price: 490, weight: 280, cookTimeMin: 10 },
    { id: 'd6', categoryId: catSalads.id, name: 'Греческий салат', description: 'Помидоры, огурцы, оливки, фета', price: 420, weight: 250, cookTimeMin: 8 },
    { id: 'd7', categoryId: catSoups.id, name: 'Шорпо', description: 'Традиционный кыргызский суп с бараниной', price: 380, weight: 350, cookTimeMin: 12 },
    { id: 'd8', categoryId: catSoups.id, name: 'Лагман', description: 'Густой суп-лапша с говядиной и овощами', price: 420, weight: 400, cookTimeMin: 15 },
    { id: 'd9', categoryId: catDesserts.id, name: 'Чак-чак', description: 'Традиционная восточная сладость', price: 250, weight: 150, cookTimeMin: 5 },
    { id: 'd10', categoryId: catDesserts.id, name: 'Медовик', description: 'Классический медовый торт', price: 320, weight: 180, cookTimeMin: 5 },
    { id: 'd11', categoryId: catDrinks.id, name: 'Максым', description: 'Традиционный кыргызский напиток', price: 150, weight: 400, cookTimeMin: 2 },
    { id: 'd12', categoryId: catDrinks.id, name: 'Свежевыжатый сок', description: 'Апельсиновый или яблочный, на выбор', price: 290, weight: 350, cookTimeMin: 5 },
    { id: 'd13', categoryId: catHot.id, name: 'Chicken steak', description: 'Grilled chicken with seasonal vegetables', price: 720, weight: 360, cookTimeMin: 20 },
    { id: 'd14', categoryId: catHot.id, name: 'Beef noodles', description: 'House noodles with beef and vegetables', price: 590, weight: 380, cookTimeMin: 18 },
    { id: 'd15', categoryId: catSalads.id, name: 'Warm beef salad', description: 'Beef, greens, tomatoes and sesame dressing', price: 560, weight: 260, cookTimeMin: 12 },
    { id: 'd16', categoryId: catSalads.id, name: 'Fresh vegetable salad', description: 'Tomatoes, cucumbers, herbs and house oil', price: 310, weight: 240, cookTimeMin: 7 },
    { id: 'd17', categoryId: catSoups.id, name: 'Lentil soup', description: 'Creamy lentil soup with toasted bread', price: 330, weight: 350, cookTimeMin: 10 },
    { id: 'd18', categoryId: catDesserts.id, name: 'Chocolate fondant', description: 'Warm chocolate cake with ice cream', price: 390, weight: 170, cookTimeMin: 12 },
    { id: 'd19', categoryId: catDrinks.id, name: 'Berry lemonade', description: 'House berry lemonade', price: 240, weight: 450, cookTimeMin: 3 },
    { id: 'd20', categoryId: catDrinks.id, name: 'Cappuccino', description: 'Double espresso with steamed milk', price: 220, weight: 250, cookTimeMin: 4 },
  ];

  for (const dish of dishes) {
    await prisma.dish.upsert({
      where: { id: dish.id },
      update: {},
      create: {
        ...dish,
        restaurantId: restaurant.id,
        isActive: true,
        isVisible: true,
        inStoplist: false,
      },
    });
  }

  // Добавляем варианты к шашлыку
  const shashlik = await prisma.dish.findUnique({ where: { id: 'd3' } });
  if (shashlik) {
    await prisma.dishVariant.upsert({
      where: { id: 'v1' },
      update: {},
      create: { id: 'v1', dishId: 'd3', name: '300г', priceDelta: 0 },
    });
    await prisma.dishVariant.upsert({
      where: { id: 'v2' },
      update: {},
      create: { id: 'v2', dishId: 'd3', name: '500г', priceDelta: 400 },
    });
  }

  // Добавляем добавки к Цезарю
  await prisma.dishAddon.upsert({
    where: { id: 'a1' },
    update: {},
    create: { id: 'a1', dishId: 'd5', name: 'Дополнительный соус', price: 80 },
  });
  await prisma.dishAddon.upsert({
    where: { id: 'a2' },
    update: {},
    create: { id: 'a2', dishId: 'd5', name: 'Бекон', price: 150 },
  });

  console.log('✅ Меню создано');

  const demoOrders = [
    { id: 'demo-order-new', tableId: 'table-1', status: OrderStatus.NEW, dishId: 'd1', qty: 1, total: 850 },
    { id: 'demo-order-accepted', tableId: 'table-2', status: OrderStatus.ACCEPTED, dishId: 'd5', qty: 2, total: 980 },
    { id: 'demo-order-cooking', tableId: 'table-3', status: OrderStatus.COOKING, dishId: 'd7', qty: 2, total: 760 },
  ];

  for (const demo of demoOrders) {
    const dish = await prisma.dish.findUniqueOrThrow({
      where: { id: demo.dishId },
      select: { price: true },
    });
    await prisma.order.upsert({
      where: { id: demo.id },
      update: {
        waiterId: waiter1.id,
        status: demo.status,
        total: demo.total,
      },
      create: {
        id: demo.id,
        restaurantId: restaurant.id,
        tableId: demo.tableId,
        waiterId: waiter1.id,
        status: demo.status,
        total: demo.total,
        items: {
          create: {
            dishId: demo.dishId,
            qty: demo.qty,
            priceAtMoment: dish.price,
          },
        },
        statusHistory: {
          create: {
            toStatus: demo.status,
            changedById: admin.id,
          },
        },
      },
    });
  }

  await Promise.all([
    prisma.table.update({
      where: { id: 'table-1' },
      data: { status: TableStatus.OCCUPIED },
    }),
    prisma.table.update({
      where: { id: 'table-2' },
      data: { status: TableStatus.OCCUPIED },
    }),
    prisma.table.update({
      where: { id: 'table-3' },
      data: { status: TableStatus.ORDER_COOKING },
    }),
  ]);
  console.log('Demo orders created');

  // ─── Итог ─────────────────────────────────────────────────────────────────
  console.log('\n🎉 Seed завершён!\n');
  console.log('═══════════════════════════════════════');
  console.log('Логины для входа:');
  console.log('  Супер-admin:  superadmin / superadmin123');
  console.log('  Admin:        admin_demo / admin123');
  console.log('  Официант 1:   waiter1 / waiter123');
  console.log('  Официант 2:   waiter2 / waiter123');
  console.log('  Повар:        cook1 / cook123');
  console.log('  Кассир:       cashier1 / cashier123');
  console.log('═══════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed ошибка:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
