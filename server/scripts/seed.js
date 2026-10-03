/**
 * Seeds the menu with a realistic canteen catalogue.
 *
 * Safe to run repeatedly: items are matched by name, existing rows are updated
 * and missing rows are inserted, so re-running never duplicates anything.
 *
 * Usage:  npm run seed            (only adds what is missing)
 *         npm run seed -- --reset (also removes seed items that no longer exist)
 */
import 'dotenv/config';
import { supabase } from '../config/supabaseClient.js';

const RESET = process.argv.includes('--reset');

/**
 * image_url points at deterministic placeholder art so every card renders with
 * a real picture before anyone uploads photography. Swap these for your own
 * URLs (or Supabase Storage paths) at any time from the admin portal.
 */
const MENU = [
  // ---- breakfast -------------------------------------------------------
  {
    name: 'Masala Chai (kulhad)',
    description: 'Ginger and cardamom tea boiled with whole milk. Served in a clay kulhad.',
    price: 15,
    category: 'breakfast',
    prep_time_minutes: 4,
    is_veg: true,
    is_spicy: false,
    calories: 80,
    tags: ['hot', 'quick'],
    image_url: 'https://images.unsplash.com/photo-1571934811356-5cc061b6821f?w=600&auto=format&fit=crop',
  },
  {
    name: 'Poha with Sev',
    description: 'Flattened rice cooked with onion, mustard seeds and peanuts, topped with crisp sev.',
    price: 40,
    category: 'breakfast',
    prep_time_minutes: 8,
    is_veg: true,
    is_spicy: false,
    calories: 320,
    tags: ['vegetarian', 'filling'],
    image_url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600&auto=format&fit=crop',
  },
  {
    name: 'Masala Dosa',
    description: 'Crisp fermented rice crepe with spiced potato, coconut chutney and sambar.',
    price: 70,
    category: 'breakfast',
    prep_time_minutes: 12,
    is_veg: true,
    is_spicy: false,
    calories: 450,
    tags: ['vegetarian', 'south indian'],
    image_url: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=600&auto=format&fit=crop',
  },
  {
    name: 'Bread Omelette',
    description: 'Two eggs folded with onion and green chilli, served between buttered toast.',
    price: 55,
    category: 'breakfast',
    prep_time_minutes: 10,
    is_veg: false,
    is_spicy: true,
    calories: 380,
    tags: ['eggs', 'protein'],
    image_url: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=600&auto=format&fit=crop',
  },

  // ---- snacks ----------------------------------------------------------
  {
    name: 'Samosa (2 pcs)',
    description: 'Flaky pastry stuffed with spiced potato and peas, fried to order.',
    price: 30,
    category: 'snacks',
    prep_time_minutes: 6,
    is_veg: true,
    is_spicy: true,
    calories: 260,
    tags: ['vegetarian', 'fried'],
    image_url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop',
  },
  {
    name: 'Veg Spring Roll',
    description: 'Crisp rolls packed with julienned vegetables and glass noodles.',
    price: 50,
    category: 'snacks',
    prep_time_minutes: 8,
    is_veg: true,
    is_spicy: false,
    calories: 310,
    tags: ['vegetarian', 'fried'],
    image_url: 'https://images.unsplash.com/photo-1606520697674-4c7d0f0d8b18?w=600&auto=format&fit=crop',
  },
  {
    name: 'Vada Pav',
    description: 'Soft pav bun with a hot spiced potato fritter and dry garlic chutney.',
    price: 35,
    category: 'snacks',
    prep_time_minutes: 5,
    is_veg: true,
    is_spicy: true,
    calories: 290,
    tags: ['vegetarian', 'mumbai', 'quick'],
    image_url: 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=600&auto=format&fit=crop',
  },
  {
    name: 'Grilled Cheese Sandwich',
    description: 'Cheddar and mozzarella pressed between buttered multigrain bread.',
    price: 60,
    category: 'snacks',
    prep_time_minutes: 7,
    is_veg: true,
    is_spicy: false,
    calories: 400,
    tags: ['vegetarian', 'lunch'],
    image_url: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=600&auto=format&fit=crop',
  },
  {
    name: 'French Fries',
    description: 'Double-fried potatoes with a sprinkle of rosemary salt.',
    price: 45,
    category: 'snacks',
    prep_time_minutes: 7,
    is_veg: true,
    is_spicy: false,
    calories: 340,
    tags: ['vegetarian', 'fried', 'sides'],
    image_url: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&auto=format&fit=crop',
  },
  {
    name: 'Samosa Chaat',
    description: 'Broken samosa, chickpeas, yoghurt, tamarind and mint chutney.',
    price: 55,
    category: 'snacks',
    prep_time_minutes: 9,
    is_veg: true,
    is_spicy: true,
    calories: 380,
    tags: ['vegetarian', 'chaat', 'spicy'],
    image_url: 'https://images.unsplash.com/photo-1607330289024-1535c6b4e1c1?w=600&auto=format&fit=crop',
  },
  {
    name: 'Chilli Garlic Momos',
    description: 'Eight steamed dumplings tossed in a fiery chilli-garlic sauce.',
    price: 65,
    category: 'snacks',
    prep_time_minutes: 11,
    is_veg: true,
    is_spicy: true,
    calories: 300,
    tags: ['vegetarian', 'spicy', 'steamed'],
    image_url: 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=600&auto=format&fit=crop',
  },

  // ---- meals -----------------------------------------------------------
  {
    name: 'Veg Thali',
    description: 'Two sabzi, dal, rice, three rotis, salad, papad and gulab jamun.',
    price: 120,
    category: 'meals',
    prep_time_minutes: 18,
    is_veg: true,
    is_spicy: false,
    calories: 720,
    tags: ['vegetarian', 'full meal', 'value'],
    image_url: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=600&auto=format&fit=crop',
  },
  {
    name: 'Paneer Butter Masala with 2 Rotis',
    description: 'Cottage cheese in a rich tomato and cashew gravy, finished with cream.',
    price: 145,
    category: 'meals',
    prep_time_minutes: 20,
    is_veg: true,
    is_spicy: false,
    calories: 680,
    tags: ['vegetarian', 'north indian', 'rich'],
    image_url: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600&auto=format&fit=crop',
  },
  {
    name: 'Chole Bhature',
    description: 'Punjabi chickpeas with a fluffy fried bhatura. Serves one hungry person.',
    price: 110,
    category: 'meals',
    prep_time_minutes: 16,
    is_veg: true,
    is_spicy: true,
    calories: 760,
    tags: ['vegetarian', 'punjabi', 'spicy'],
    image_url: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=600&auto=format&fit=crop',
  },
  {
    name: 'Chicken Biryani',
    description: 'Fragrant basmati layered with chicken, fried onion and mint raita.',
    price: 165,
    category: 'meals',
    prep_time_minutes: 22,
    is_veg: false,
    is_spicy: true,
    calories: 820,
    tags: ['non-veg', 'biryani', 'spicy'],
    image_url: 'https://images.unsplash.com/photo-1563379091339-03246963d51a?w=600&auto=format&fit=crop',
  },
  {
    name: 'Rajma Chawal',
    description: 'Kashmiri kidney beans in a thick onion gravy with steamed rice.',
    price: 95,
    category: 'meals',
    prep_time_minutes: 14,
    is_veg: true,
    is_spicy: true,
    calories: 610,
    tags: ['vegetarian', 'comfort', 'value'],
    image_url: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600&auto=format&fit=crop',
  },
  {
    name: 'Pav Bhaji',
    description: 'Buttery mashed vegetable served with toasted pav and a chopped onion salad.',
    price: 85,
    category: 'meals',
    prep_time_minutes: 15,
    is_veg: true,
    is_spicy: true,
    calories: 590,
    tags: ['vegetarian', 'mumbai', 'spicy'],
    image_url: 'https://images.unsplash.com/photo-1601050690117-94f5f6fa8bd7?w=600&auto=format&fit=crop',
  },

  // ---- combos ----------------------------------------------------------
  {
    name: 'Samosa + Chai Combo',
    description: 'Two hot samosas with a kulhad of masala chai. The 4 pm classic.',
    price: 42,
    category: 'combos',
    prep_time_minutes: 8,
    is_veg: true,
    is_spicy: false,
    calories: 340,
    tags: ['combo', 'value', 'evening'],
    image_url: 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=600&auto=format&fit=crop',
  },
  {
    name: 'Vada Pav + Chai Combo',
    description: 'Spiced potato fritter in a bun with masala chai.',
    price: 45,
    category: 'combos',
    prep_time_minutes: 8,
    is_veg: true,
    is_spicy: true,
    calories: 370,
    tags: ['combo', 'value', 'evening'],
    image_url: 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=600&auto=format&fit=crop',
  },
  {
    name: 'Thali + Sweet',
    description: 'Full veg thali with a hot gulab jamun on the side.',
    price: 140,
    category: 'combos',
    prep_time_minutes: 20,
    is_veg: true,
    is_spicy: false,
    calories: 820,
    tags: ['combo', 'full meal'],
    image_url: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=600&auto=format&fit=crop',
  },

  // ---- beverages -------------------------------------------------------
  {
    name: 'Cold Coffee',
    description: 'Double shot blended with milk and a thick layer of chocolate.',
    price: 60,
    category: 'beverages',
    prep_time_minutes: 6,
    is_veg: true,
    is_spicy: false,
    calories: 250,
    tags: ['cold', 'quick'],
    image_url: 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=600&auto=format&fit=crop',
  },
  {
    name: 'Fresh Lime Soda',
    description: 'Sweet or salted, whisked with ice. Ask the counter for your choice.',
    price: 30,
    category: 'beverages',
    prep_time_minutes: 4,
    is_veg: true,
    is_spicy: false,
    calories: 90,
    tags: ['cold', 'quick', 'summer'],
    image_url: 'https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=600&auto=format&fit=crop',
  },
  {
    name: 'Mango Lassi',
    description: 'Thick alphonso pulp blended with curd and topped with pistachio.',
    price: 55,
    category: 'beverages',
    prep_time_minutes: 5,
    is_veg: true,
    is_spicy: false,
    calories: 210,
    tags: ['cold', 'summer'],
    image_url: 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=600&auto=format&fit=crop',
  },
  {
    name: 'Masala Chai',
    description: 'Ginger and cardamom tea boiled with whole milk. Served in a clay kulhad.',
    price: 15,
    category: 'beverages',
    prep_time_minutes: 4,
    is_veg: true,
    is_spicy: false,
    calories: 80,
    tags: ['hot', 'quick'],
    image_url: 'https://images.unsplash.com/photo-1571934811356-5cc061b6821f?w=600&auto=format&fit=crop',
  },

  // ---- desserts --------------------------------------------------------
  {
    name: 'Gulab Jamun (2 pcs)',
    description: 'Soft milk dumplings soaked in warm cardamom syrup.',
    price: 35,
    category: 'desserts',
    prep_time_minutes: 3,
    is_veg: true,
    is_spicy: false,
    calories: 280,
    tags: ['sweet'],
    image_url: 'https://images.unsplash.com/photo-1601303516534-bf0b1eb4a2e1?w=600&auto=format&fit=crop',
  },
  {
    name: 'Gajar Ka Halwa',
    description: 'Shredded carrot cooked slowly in milk with cardamom and almond.',
    price: 55,
    category: 'desserts',
    prep_time_minutes: 5,
    is_veg: true,
    is_spicy: false,
    calories: 330,
    tags: ['sweet', 'winter'],
    image_url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop',
  },
  {
    name: 'Chocolate Brownie',
    description: 'Dense fudge brownie with a molten centre.',
    price: 60,
    category: 'desserts',
    prep_time_minutes: 4,
    is_veg: true,
    is_spicy: false,
    calories: 350,
    tags: ['sweet'],
    image_url: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&auto=format&fit=crop',
  },
];

async function run() {
  console.log('\nFoodFlow menu seed\n');

  const { data: existing, error: readError } = await supabase
    .from('menu_items')
    .select('id, name');

  if (readError) {
    console.error('Could not read menu_items. Has the schema been applied?\n', readError.message);
    process.exit(1);
  }

  const byName = new Map((existing ?? []).map((row) => [row.name, row]));
  const seedNames = MENU.map((item) => item.name);

  let inserted = 0;
  let updated = 0;
  let removed = 0;

  for (const item of MENU) {
    const match = byName.get(item.name);
    const row = {
      name: item.name,
      description: item.description,
      price: item.price,
      category: item.category,
      image_url: item.image_url,
      is_veg: item.is_veg,
      is_spicy: item.is_spicy,
      prep_time_minutes: item.prep_time_minutes,
      calories: item.calories,
      tags: item.tags,
    };

    if (match) {
      const { error } = await supabase.from('menu_items').update(row).eq('id', match.id);
      if (error) {
        console.error(`  could not update "${item.name}": ${error.message}`);
      } else {
        updated += 1;
      }
    } else {
      const { error } = await supabase.from('menu_items').insert(row);
      if (error) {
        console.error(`  could not insert "${item.name}": ${error.message}`);
      } else {
        inserted += 1;
      }
    }
  }

  if (RESET) {
    const stale = (existing ?? []).filter((row) => !seedNames.includes(row.name));
    for (const row of stale) {
      const { error } = await supabase.from('menu_items').delete().eq('id', row.id);
      if (error) {
        console.error(`  could not remove "${row.name}": ${error.message}`);
      } else {
        removed += 1;
      }
    }
  }

  console.log(`  ${inserted} inserted, ${updated} updated${removed ? `, ${removed} removed` : ''}`);
  console.log(`  ${MENU.length} items in the seed catalogue\n`);
}

run().catch((err) => {
  console.error('\nSeed failed:', err.message);
  process.exit(1);
});