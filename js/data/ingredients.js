/**
 * Ingredient database.
 *
 * Every recipe quantity is stored in the ingredient's BASE unit:
 *   mass  -> grams, volume -> millilitres, count -> "each".
 * Nutrition is per 100 base units (mass/volume) or per 1 each (count).
 * `price` is an *approximate US average* for one `pack` and is a planning
 * estimate only — never a live store price.
 *
 * Flags: M meat, F fish, S shellfish, D dairy, E egg, G gluten, N tree nut,
 *        P peanut, Y soy, X sesame, H honey (animal, non-dairy),
 *        Z seasoning/trace (ignored by carnivore & keto checks).
 */
const RAW = [
  // id, name, aisle, kind, pack, price, kcal, protein, carbs, fat, fiber, flags
  // ---------- Produce
  ['onion', 'Yellow onion', 'Produce', 'count', 1, 0.95, 44, 1.2, 10.3, 0.1, 1.9, ''],
  ['garlic', 'Garlic cloves', 'Produce', 'count', 10, 0.75, 4.5, 0.2, 1, 0, 0.1, ''],
  ['ginger', 'Fresh ginger', 'Produce', 'mass', 100, 1.2, 80, 1.8, 17.8, 0.8, 2, ''],
  ['tomato', 'Tomato', 'Produce', 'count', 1, 0.8, 22, 1.1, 4.8, 0.2, 1.5, ''],
  ['cherry-tomato', 'Cherry tomatoes', 'Produce', 'mass', 284, 3.5, 18, 0.9, 3.9, 0.2, 1.2, ''],
  ['bell-pepper', 'Bell pepper', 'Produce', 'count', 1, 1.2, 31, 1, 7, 0.3, 2.5, ''],
  ['carrot', 'Carrot', 'Produce', 'count', 7, 1.5, 25, 0.6, 5.8, 0.1, 1.7, ''],
  ['potato', 'Potatoes', 'Produce', 'mass', 1360, 3.5, 77, 2, 17, 0.1, 2.2, ''],
  ['sweet-potato', 'Sweet potatoes', 'Produce', 'mass', 900, 3, 86, 1.6, 20, 0.1, 3, ''],
  ['broccoli', 'Broccoli', 'Produce', 'mass', 340, 2.2, 34, 2.8, 6.6, 0.4, 2.6, ''],
  ['cauliflower', 'Cauliflower', 'Produce', 'mass', 600, 3.5, 25, 1.9, 5, 0.3, 2, ''],
  ['spinach', 'Baby spinach', 'Produce', 'mass', 142, 3, 23, 2.9, 3.6, 0.4, 2.2, ''],
  ['kale', 'Kale', 'Produce', 'mass', 200, 3, 35, 2.9, 4.4, 1.5, 4.1, ''],
  ['romaine', 'Romaine lettuce', 'Produce', 'mass', 300, 2.5, 17, 1.2, 3.3, 0.3, 2.1, ''],
  ['cabbage', 'Cabbage', 'Produce', 'mass', 900, 2.5, 25, 1.3, 5.8, 0.1, 2.5, ''],
  ['cucumber', 'Cucumber', 'Produce', 'count', 1, 0.9, 45, 2, 11, 0.3, 1.5, ''],
  ['zucchini', 'Zucchini', 'Produce', 'count', 1, 1, 33, 2.4, 6.1, 0.6, 2, ''],
  ['eggplant', 'Eggplant', 'Produce', 'mass', 450, 2.5, 25, 1, 6, 0.2, 3, ''],
  ['mushroom', 'Mushrooms', 'Produce', 'mass', 227, 2.5, 22, 3.1, 3.3, 0.3, 1, ''],
  ['green-beans', 'Green beans', 'Produce', 'mass', 340, 2.5, 31, 1.8, 7, 0.2, 2.7, ''],
  ['avocado', 'Avocado', 'Produce', 'count', 1, 1.5, 240, 3, 12, 22, 10, ''],
  ['lemon', 'Lemon', 'Produce', 'count', 1, 0.7, 17, 0.6, 5.4, 0.2, 1.6, ''],
  ['lime', 'Lime', 'Produce', 'count', 1, 0.5, 20, 0.5, 7, 0.1, 1.9, ''],
  ['banana', 'Banana', 'Produce', 'count', 5, 1.5, 105, 1.3, 27, 0.4, 3.1, ''],
  ['apple', 'Apple', 'Produce', 'count', 1, 0.9, 95, 0.5, 25, 0.3, 4.4, ''],
  ['orange', 'Orange', 'Produce', 'count', 1, 0.8, 62, 1.2, 15, 0.2, 3.1, ''],
  ['mango', 'Mango', 'Produce', 'count', 1, 1.5, 200, 2.8, 50, 1.3, 5.4, ''],
  ['blueberries', 'Blueberries', 'Produce', 'mass', 170, 3.5, 57, 0.7, 14, 0.3, 2.4, ''],
  ['strawberries', 'Strawberries', 'Produce', 'mass', 454, 3.5, 32, 0.7, 7.7, 0.3, 2, ''],
  ['cilantro', 'Fresh cilantro', 'Produce', 'mass', 30, 1, 23, 2.1, 3.7, 0.5, 2.8, ''],
  ['basil', 'Fresh basil', 'Produce', 'mass', 28, 2.5, 23, 3.2, 2.7, 0.6, 1.6, ''],
  ['parsley', 'Fresh parsley', 'Produce', 'mass', 30, 1.2, 36, 3, 6.3, 0.8, 3.3, ''],
  ['green-onion', 'Green onions', 'Produce', 'count', 6, 1, 5, 0.3, 1.1, 0, 0.4, ''],
  // ---------- Meat & Seafood
  ['chicken-breast', 'Chicken breast', 'Meat & Seafood', 'mass', 680, 6.5, 165, 31, 0, 3.6, 0, 'M'],
  ['chicken-thigh', 'Chicken thighs (boneless)', 'Meat & Seafood', 'mass', 680, 5.5, 177, 24, 0, 8.5, 0, 'M'],
  ['ground-beef', 'Ground beef (85/15)', 'Meat & Seafood', 'mass', 454, 5.5, 215, 18, 0, 15, 0, 'M'],
  ['ground-turkey', 'Ground turkey', 'Meat & Seafood', 'mass', 454, 5, 148, 19, 0, 8, 0, 'M'],
  ['steak', 'Sirloin steak', 'Meat & Seafood', 'mass', 454, 9.5, 183, 27, 0, 7.6, 0, 'M'],
  ['pork-chop', 'Pork chops', 'Meat & Seafood', 'mass', 454, 4.5, 172, 24, 0, 8, 0, 'M'],
  ['bacon', 'Bacon', 'Meat & Seafood', 'mass', 340, 6.5, 541, 37, 1.4, 42, 0, 'M'],
  ['sausage', 'Italian sausage', 'Meat & Seafood', 'mass', 454, 5.5, 300, 14, 2, 26, 0, 'M'],
  ['salmon', 'Salmon fillets', 'Meat & Seafood', 'mass', 340, 9, 208, 20, 0, 13, 0, 'F'],
  ['white-fish', 'Cod fillets', 'Meat & Seafood', 'mass', 454, 8, 82, 18, 0, 0.7, 0, 'F'],
  ['shrimp', 'Shrimp', 'Meat & Seafood', 'mass', 454, 9, 99, 24, 0.2, 0.3, 0, 'S'],
  ['tuna-can', 'Canned tuna', 'Canned & Jarred', 'mass', 142, 1.5, 116, 26, 0, 0.8, 0, 'F'],
  // ---------- Dairy, eggs & alternatives
  ['egg', 'Eggs', 'Dairy & Eggs', 'count', 12, 3.5, 72, 6.3, 0.4, 4.8, 0, 'E'],
  ['milk', 'Milk', 'Dairy & Eggs', 'volume', 1893, 2.6, 61, 3.2, 4.8, 3.3, 0, 'D'],
  ['almond-milk', 'Almond milk', 'Dairy & Eggs', 'volume', 1893, 3, 15, 0.6, 0.3, 1.2, 0.2, 'N'],
  ['butter', 'Butter', 'Dairy & Eggs', 'mass', 454, 5, 717, 0.9, 0.1, 81, 0, 'D'],
  ['cheddar', 'Cheddar cheese', 'Dairy & Eggs', 'mass', 227, 3.5, 403, 25, 1.3, 33, 0, 'D'],
  ['parmesan', 'Parmesan', 'Dairy & Eggs', 'mass', 142, 4.5, 431, 38, 4.1, 29, 0, 'D'],
  ['mozzarella', 'Mozzarella', 'Dairy & Eggs', 'mass', 227, 3.5, 280, 28, 3.1, 17, 0, 'D'],
  ['feta', 'Feta cheese', 'Dairy & Eggs', 'mass', 170, 4, 264, 14, 4, 21, 0, 'D'],
  ['greek-yogurt', 'Plain Greek yogurt', 'Dairy & Eggs', 'mass', 680, 4.5, 73, 10, 3.9, 1.9, 0, 'D'],
  ['cottage-cheese', 'Cottage cheese', 'Dairy & Eggs', 'mass', 454, 3.2, 98, 11, 3.4, 4.3, 0, 'D'],
  ['heavy-cream', 'Heavy cream', 'Dairy & Eggs', 'volume', 473, 4, 340, 2.1, 2.8, 36, 0, 'D'],
  ['tofu', 'Firm tofu', 'Dairy & Eggs', 'mass', 397, 2.5, 76, 8, 1.9, 4.8, 0.3, 'Y'],
  // ---------- Bakery
  ['bread', 'Whole-wheat bread (slice)', 'Bakery', 'count', 20, 3.5, 80, 4, 14, 1, 2, 'G'],
  ['tortilla', 'Flour tortillas', 'Bakery', 'count', 10, 3, 130, 3.5, 22, 3, 1.5, 'G'],
  ['corn-tortilla', 'Corn tortillas', 'Bakery', 'count', 30, 3, 52, 1.4, 11, 0.7, 1.5, ''],
  ['pita', 'Pita bread', 'Bakery', 'count', 6, 2.8, 165, 5.5, 33, 0.7, 1.3, 'G'],
  // ---------- Grains & pasta
  ['rice', 'White rice (dry)', 'Grains & Pasta', 'mass', 907, 3, 365, 7, 80, 0.7, 1.3, ''],
  ['brown-rice', 'Brown rice (dry)', 'Grains & Pasta', 'mass', 907, 3.3, 370, 7.5, 77, 2.9, 3.5, ''],
  ['pasta', 'Pasta (dry)', 'Grains & Pasta', 'mass', 454, 1.8, 371, 13, 75, 1.5, 3.2, 'G'],
  ['quinoa', 'Quinoa (dry)', 'Grains & Pasta', 'mass', 454, 5.5, 368, 14, 64, 6, 7, ''],
  ['oats', 'Rolled oats', 'Grains & Pasta', 'mass', 510, 4, 389, 17, 66, 7, 10.6, ''],
  ['flour', 'All-purpose flour', 'Spices & Baking', 'mass', 2270, 4, 364, 10, 76, 1, 2.7, 'G'],
  ['soba', 'Soba noodles', 'Grains & Pasta', 'mass', 227, 3.5, 336, 14, 74, 0.7, 2, 'G'],
  ['rice-noodles', 'Rice noodles', 'Grains & Pasta', 'mass', 227, 3, 364, 3.4, 80, 0.6, 1, ''],
  ['panko', 'Panko breadcrumbs', 'Grains & Pasta', 'mass', 227, 3, 395, 13, 72, 5, 3, 'G'],
  ['granola', 'Granola', 'Grains & Pasta', 'mass', 340, 4.5, 471, 10, 64, 20, 7, 'G N'],
  // ---------- Canned, jarred, legumes
  ['chickpeas', 'Chickpeas (canned)', 'Canned & Jarred', 'mass', 425, 1.1, 139, 7, 22, 2.6, 6, ''],
  ['black-beans', 'Black beans (canned)', 'Canned & Jarred', 'mass', 425, 1.1, 132, 8.9, 24, 0.5, 8.7, ''],
  ['white-beans', 'White beans (canned)', 'Canned & Jarred', 'mass', 425, 1.2, 139, 9.7, 25, 0.4, 6.3, ''],
  ['lentils', 'Dry lentils', 'Grains & Pasta', 'mass', 454, 2.5, 352, 25, 63, 1.1, 11, ''],
  ['canned-tomatoes', 'Canned diced tomatoes', 'Canned & Jarred', 'mass', 411, 1.3, 21, 1.1, 4.6, 0.1, 1.9, ''],
  ['tomato-paste', 'Tomato paste', 'Canned & Jarred', 'mass', 170, 1.4, 82, 4.3, 19, 0.5, 4, ''],
  ['marinara', 'Marinara sauce', 'Canned & Jarred', 'mass', 680, 3, 50, 1.5, 9, 1, 2, ''],
  ['chicken-broth', 'Chicken broth', 'Canned & Jarred', 'volume', 946, 2.5, 5, 0.5, 0.4, 0.2, 0, 'M'],
  ['veg-broth', 'Vegetable broth', 'Canned & Jarred', 'volume', 946, 2.5, 5, 0.1, 0.9, 0, 0, ''],
  ['coconut-milk', 'Coconut milk (canned)', 'Canned & Jarred', 'volume', 400, 2, 197, 2, 2.8, 21, 0, ''],
  ['salsa', 'Salsa', 'Canned & Jarred', 'mass', 454, 3, 36, 1.5, 7, 0.2, 1.6, ''],
  ['peanut-butter', 'Peanut butter', 'Canned & Jarred', 'mass', 454, 3.5, 588, 25, 20, 50, 6, 'P'],
  ['almond-butter', 'Almond butter', 'Canned & Jarred', 'mass', 340, 7, 614, 21, 19, 56, 10, 'N'],
  ['tahini', 'Tahini', 'Canned & Jarred', 'mass', 454, 7, 595, 17, 21, 54, 9, 'X'],
  ['olives', 'Olives', 'Canned & Jarred', 'mass', 170, 3, 115, 0.8, 6, 11, 3, ''],
  ['curry-paste', 'Thai red curry paste', 'Canned & Jarred', 'mass', 112, 3.2, 120, 3, 15, 5, 3, 'S'],
  ['hummus', 'Hummus', 'Canned & Jarred', 'mass', 283, 3.5, 166, 8, 14, 10, 6, 'X'],
  ['pesto', 'Basil pesto', 'Canned & Jarred', 'mass', 190, 4, 400, 5, 7, 38, 2, 'D N'],
  // ---------- Oils & condiments
  ['olive-oil', 'Olive oil', 'Oils & Condiments', 'volume', 500, 7.5, 884, 0, 0, 100, 0, ''],
  ['veg-oil', 'Vegetable oil', 'Oils & Condiments', 'volume', 1420, 4, 884, 0, 0, 100, 0, ''],
  ['sesame-oil', 'Toasted sesame oil', 'Oils & Condiments', 'volume', 250, 5, 884, 0, 0, 100, 0, 'X'],
  ['soy-sauce', 'Soy sauce', 'Oils & Condiments', 'volume', 296, 2.8, 53, 8, 4.9, 0.6, 0.8, 'Y G'],
  ['fish-sauce', 'Fish sauce', 'Oils & Condiments', 'volume', 200, 3, 35, 5, 4, 0, 0, 'F'],
  ['rice-vinegar', 'Rice vinegar', 'Oils & Condiments', 'volume', 355, 2.5, 18, 0, 4, 0, 0, ''],
  ['balsamic', 'Balsamic vinegar', 'Oils & Condiments', 'volume', 250, 3.5, 88, 0.5, 17, 0, 0, ''],
  ['mayo', 'Mayonnaise', 'Oils & Condiments', 'mass', 443, 3.5, 680, 1, 0.6, 75, 0, 'E'],
  ['mustard', 'Dijon mustard', 'Oils & Condiments', 'mass', 226, 1.5, 66, 4, 6, 4, 3, ''],
  ['honey', 'Honey', 'Oils & Condiments', 'mass', 340, 4.5, 304, 0.3, 82, 0, 0, 'H'],
  ['maple-syrup', 'Maple syrup', 'Oils & Condiments', 'volume', 250, 5.5, 260, 0, 67, 0.1, 0, ''],
  ['gochujang', 'Gochujang', 'Oils & Condiments', 'mass', 200, 4.5, 200, 4, 40, 3, 2, 'Y G'],
  ['miso', 'Miso paste', 'Oils & Condiments', 'mass', 200, 4.5, 199, 12, 26, 6, 5, 'Y'],
  // ---------- Spices & baking
  ['salt', 'Salt', 'Spices & Baking', 'mass', 737, 1.2, 0, 0, 0, 0, 0, 'Z'],
  ['pepper', 'Black pepper', 'Spices & Baking', 'mass', 50, 3, 251, 10, 64, 3, 25, 'Z'],
  ['cumin', 'Ground cumin', 'Spices & Baking', 'mass', 45, 3, 375, 18, 44, 22, 11, 'Z'],
  ['paprika', 'Paprika', 'Spices & Baking', 'mass', 60, 3, 282, 14, 54, 13, 35, 'Z'],
  ['chili-powder', 'Chili powder', 'Spices & Baking', 'mass', 50, 3, 282, 13, 50, 14, 35, 'Z'],
  ['garlic-powder', 'Garlic powder', 'Spices & Baking', 'mass', 90, 3, 331, 17, 73, 0.7, 9, 'Z'],
  ['italian-seasoning', 'Italian seasoning', 'Spices & Baking', 'mass', 20, 2.5, 265, 9, 69, 4, 40, 'Z'],
  ['curry-powder', 'Curry powder', 'Spices & Baking', 'mass', 85, 3.5, 325, 14, 58, 14, 53, 'Z'],
  ['garam-masala', 'Garam masala', 'Spices & Baking', 'mass', 40, 4, 379, 14, 50, 15, 30, 'Z'],
  ['turmeric', 'Ground turmeric', 'Spices & Baking', 'mass', 50, 3, 312, 10, 67, 3, 23, 'Z'],
  ['cinnamon', 'Ground cinnamon', 'Spices & Baking', 'mass', 60, 3, 247, 4, 81, 1.2, 53, 'Z'],
  ['oregano', 'Dried oregano', 'Spices & Baking', 'mass', 14, 2.5, 265, 9, 69, 4, 43, 'Z'],
  ['red-pepper-flakes', 'Red pepper flakes', 'Spices & Baking', 'mass', 40, 2.5, 318, 12, 57, 17, 28, 'Z'],
  ['vanilla', 'Vanilla extract', 'Spices & Baking', 'volume', 59, 7, 288, 0.1, 13, 0.1, 0, 'Z'],
  ['baking-powder', 'Baking powder', 'Spices & Baking', 'mass', 227, 2.5, 53, 0, 28, 0, 0.2, 'Z'],
  ['sugar', 'Granulated sugar', 'Spices & Baking', 'mass', 1360, 3.2, 387, 0, 100, 0, 0, ''],
  ['brown-sugar', 'Brown sugar', 'Spices & Baking', 'mass', 907, 3, 380, 0, 98, 0, 0, ''],
  ['cornstarch', 'Cornstarch', 'Spices & Baking', 'mass', 454, 2, 381, 0.3, 91, 0.1, 0.9, ''],
  ['cocoa', 'Unsweetened cocoa', 'Spices & Baking', 'mass', 227, 5, 228, 20, 58, 14, 33, ''],
  ['choc-chips', 'Chocolate chips', 'Spices & Baking', 'mass', 340, 4, 480, 4, 63, 30, 5, 'D'],
  ['chia', 'Chia seeds', 'Spices & Baking', 'mass', 340, 6, 486, 17, 42, 31, 34, ''],
  ['protein-powder', 'Whey protein powder', 'Spices & Baking', 'mass', 907, 32, 380, 78, 8, 5, 0, 'D'],
  // ---------- Nuts, seeds & snacks
  ['almonds', 'Almonds', 'Nuts & Snacks', 'mass', 227, 5, 579, 21, 22, 50, 12.5, 'N'],
  ['walnuts', 'Walnuts', 'Nuts & Snacks', 'mass', 170, 4.5, 654, 15, 14, 65, 6.7, 'N'],
  ['peanuts', 'Peanuts', 'Nuts & Snacks', 'mass', 340, 3.5, 567, 26, 16, 49, 8.5, 'P'],
  ['sesame-seeds', 'Sesame seeds', 'Nuts & Snacks', 'mass', 90, 3, 573, 18, 23, 50, 12, 'X'],
  ['dark-chocolate', 'Dark chocolate (70%)', 'Nuts & Snacks', 'mass', 100, 3, 598, 8, 46, 43, 11, ''],
  ['tortilla-chips', 'Tortilla chips', 'Nuts & Snacks', 'mass', 340, 3.5, 503, 7, 63, 25, 5, ''],
  // ---------- Frozen
  ['frozen-berries', 'Frozen mixed berries', 'Frozen', 'mass', 340, 3.5, 50, 0.8, 12, 0.3, 3, ''],
  ['frozen-peas', 'Frozen peas', 'Frozen', 'mass', 340, 1.8, 81, 5.4, 14, 0.4, 5.7, ''],
];

export const INGREDIENTS = Object.fromEntries(
  RAW.map(([id, name, aisle, kind, pack, price, kcal, pro, carb, fat, fiber, flags]) => [
    id,
    { id, name, aisle, kind, pack, price, kcal, pro, carb, fat, fiber, flags: flags.split(' ').filter(Boolean) },
  ])
);

/** Default prep verb used when building meal-prep sheets. */
export const PREP_VERB = {
  onion: 'dice', garlic: 'mince', ginger: 'grate', tomato: 'chop', 'cherry-tomato': 'halve',
  'bell-pepper': 'slice', carrot: 'peel and slice', potato: 'cube', 'sweet-potato': 'cube',
  broccoli: 'cut into florets', cauliflower: 'cut into florets', cabbage: 'shred', kale: 'strip and chop',
  romaine: 'wash and chop', cucumber: 'slice', zucchini: 'slice', eggplant: 'cube', mushroom: 'slice',
  'green-beans': 'trim', cilantro: 'chop', parsley: 'chop', basil: 'tear', 'green-onion': 'slice',
  lemon: 'zest and juice', lime: 'juice', avocado: 'halve and pit', 'chicken-breast': 'trim and slice',
  'chicken-thigh': 'trim', mozzarella: 'slice', cheddar: 'shred', apple: 'core and slice',
};

export const AISLE_ORDER = [
  'Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Bakery', 'Grains & Pasta', 'Canned & Jarred',
  'Oils & Condiments', 'Spices & Baking', 'Nuts & Snacks', 'Frozen', 'Other',
];

export const ALLERGENS = [
  { id: 'G', label: 'Gluten' }, { id: 'D', label: 'Dairy' }, { id: 'E', label: 'Eggs' },
  { id: 'P', label: 'Peanuts' }, { id: 'N', label: 'Tree nuts' }, { id: 'Y', label: 'Soy' },
  { id: 'F', label: 'Fish' }, { id: 'S', label: 'Shellfish' }, { id: 'X', label: 'Sesame' },
];

export const ingredientList = () => Object.values(INGREDIENTS).sort((a, b) => a.name.localeCompare(b.name));
