/**
 * SAMPLE restaurants — entirely fictional, included so the discovery features
 * work on first launch. They are clearly badged "Sample" in the UI and can be
 * deleted. Real nearby places come from the OpenStreetMap lookup or are added
 * by the user. No prices, ratings, hours or availability here are live data.
 */
const d = (name, price, desc, tags = [], diet = []) => ({ name, price, desc, tags, diet });

export const SAMPLE_RESTAURANTS = [
  { id: 'sample-basil-ember', name: 'Basil & Ember', cuisine: 'Italian', price: 2, rating: 4.5, distance: 1.2, tags: ['hearty', 'creamy', 'tangy'],
    dishes: [d('Wood-fired Margherita', 15, 'San Marzano tomato, mozzarella, basil.', ['hearty', 'tangy'], ['vegetarian']), d('Cacio e Pepe', 17, 'Pecorino, black pepper, hand-cut tonnarelli.', ['creamy', 'savory'], ['vegetarian']), d('Burrata & Peach Salad', 14, 'Burrata, grilled peach, arugula.', ['fresh', 'sweet'], ['vegetarian', 'gluten-free'])] },
  { id: 'sample-lotus-garden', name: 'Lotus Garden', cuisine: 'Chinese', price: 2, rating: 4.3, distance: 2.4, tags: ['umami', 'savory', 'sweet'],
    dishes: [d('Pork & Chive Dumplings', 11, 'Pan-fried, chili-vinegar dip.', ['umami', 'savory'], []), d('Dan Dan Noodles', 14, 'Sesame, chili oil, minced pork.', ['spicy', 'umami'], []), d('Mapo Tofu', 15, 'Silken tofu in fiery bean sauce.', ['spicy', 'umami'], ['vegetarian'])] },
  { id: 'sample-casa-verde', name: 'Casa Verde', cuisine: 'Mexican', price: 1, rating: 4.4, distance: 0.8, tags: ['spicy', 'tangy', 'fresh'],
    dishes: [d('Carne Asada Tacos', 13, 'Grilled steak, onion, cilantro, lime.', ['smoky', 'tangy'], ['gluten-free']), d('Roasted Veggie Burrito', 12, 'Black beans, peppers, salsa verde.', ['fresh', 'hearty'], ['vegetarian']), d('Ceviche Tostada', 14, 'Citrus-cured fish, avocado.', ['fresh', 'tangy'], ['pescatarian'])] },
  { id: 'sample-spice-route', name: 'Spice Route Kitchen', cuisine: 'Indian', price: 2, rating: 4.6, distance: 3.1, tags: ['spicy', 'creamy', 'hearty'],
    dishes: [d('Butter Chicken', 18, 'Tomato-cream sauce, basmati rice.', ['creamy', 'spicy'], ['gluten-free']), d('Chana Masala', 15, 'Chickpeas in tomato-ginger gravy.', ['spicy', 'hearty'], ['vegan', 'gluten-free']), d('Garlic Naan', 4, 'Tandoor-baked flatbread.', ['savory'], ['vegetarian'])] },
  { id: 'sample-sakura-counter', name: 'Sakura Counter', cuisine: 'Japanese', price: 3, rating: 4.7, distance: 2.0, tags: ['umami', 'fresh', 'light'],
    dishes: [d('Chef’s Nigiri Set (8 pc)', 28, 'Seasonal fish over seasoned rice.', ['fresh', 'umami'], ['pescatarian']), d('Tonkotsu Ramen', 17, 'Pork broth, chashu, soft egg.', ['umami', 'hearty'], []), d('Vegetable Tempura Udon', 15, 'Warm dashi broth.', ['light', 'umami'], ['vegetarian'])] },
  { id: 'sample-olive-thyme', name: 'Olive & Thyme', cuisine: 'Mediterranean', price: 2, rating: 4.4, distance: 1.7, tags: ['fresh', 'tangy', 'light'],
    dishes: [d('Mezze Platter', 19, 'Hummus, baba ganoush, tabbouleh, pita.', ['fresh', 'tangy'], ['vegan']), d('Grilled Branzino', 26, 'Lemon, herbs, roasted potatoes.', ['light', 'fresh'], ['pescatarian', 'gluten-free']), d('Lamb Kofta Plate', 21, 'Spiced lamb, yogurt sauce, rice.', ['smoky', 'hearty'], [])] },
  { id: 'sample-smoke-salt', name: 'Smoke & Salt BBQ', cuisine: 'American', price: 2, rating: 4.5, distance: 4.5, tags: ['smoky', 'hearty'],
    dishes: [d('Brisket Plate', 22, '14-hour smoked brisket, two sides.', ['smoky', 'hearty'], ['gluten-free']), d('Smoked Chicken Sandwich', 14, 'Pickles, slaw, brioche bun.', ['smoky', 'tangy'], []), d('Mac & Cheese', 8, 'Three-cheese bake.', ['creamy', 'hearty'], ['vegetarian'])] },
  { id: 'sample-daily-bowl', name: 'The Daily Bowl', cuisine: 'American', price: 1, rating: 4.2, distance: 0.5, tags: ['fresh', 'light', 'hearty'],
    dishes: [d('Chicken Grain Bowl', 13, 'Quinoa, roasted veg, tahini dressing.', ['fresh', 'hearty'], ['gluten-free']), d('Green Goddess Salad', 12, 'Kale, avocado, seeds.', ['fresh', 'light'], ['vegan', 'gluten-free']), d('Turkey Avocado Wrap', 11, 'Whole-wheat tortilla, greens.', ['light'], [])] },
  { id: 'sample-seoul-fire', name: 'Seoul Fire', cuisine: 'Korean', price: 2, rating: 4.6, distance: 3.6, tags: ['spicy', 'umami', 'smoky'],
    dishes: [d('Bulgogi Bibimbap', 16, 'Marinated beef, vegetables, gochujang.', ['umami', 'spicy'], []), d('Kimchi Jjigae', 15, 'Spicy fermented-cabbage stew.', ['spicy', 'umami'], []), d('Tofu Bibimbap', 15, 'Crispy tofu, rice, vegetables.', ['umami', 'fresh'], ['vegetarian'])] },
  { id: 'sample-bangkok-alley', name: 'Bangkok Alley', cuisine: 'Thai', price: 2, rating: 4.5, distance: 2.8, tags: ['spicy', 'fresh', 'sweet'],
    dishes: [d('Pad Thai', 15, 'Rice noodles, tamarind, peanuts.', ['sweet', 'tangy'], ['gluten-free']), d('Green Curry', 17, 'Coconut milk, Thai basil, bamboo.', ['spicy', 'creamy'], ['gluten-free']), d('Papaya Salad', 11, 'Lime, chili, peanuts.', ['fresh', 'spicy'], ['gluten-free'])] },
  { id: 'sample-petit-four', name: 'Le Petit Four', cuisine: 'French', price: 3, rating: 4.4, distance: 5.2, tags: ['creamy', 'hearty', 'savory'],
    dishes: [d('Croque Madame', 16, 'Ham, gruyère, béchamel, fried egg.', ['creamy', 'savory'], []), d('Steak Frites', 29, 'Hanger steak, shallot butter.', ['hearty', 'savory'], []), d('French Onion Soup', 13, 'Gratinéed with gruyère.', ['hearty', 'savory'], ['vegetarian'])] },
  { id: 'sample-harvest-table', name: 'Harvest Table', cuisine: 'American', price: 2, rating: 4.3, distance: 1.9, tags: ['fresh', 'light'],
    dishes: [d('Roasted Cauliflower Steak', 18, 'Romesco, herbs.', ['smoky', 'fresh'], ['vegan', 'gluten-free']), d('Lentil Walnut Burger', 15, 'Brioche-free, lettuce wrap option.', ['hearty'], ['vegan']), d('Seasonal Grain Salad', 14, 'Farro, roasted squash.', ['fresh', 'light'], ['vegan'])] },
  { id: 'sample-nile-grill', name: 'Nile Grill', cuisine: 'Middle Eastern', price: 1, rating: 4.5, distance: 2.2, tags: ['smoky', 'fresh', 'tangy'],
    dishes: [d('Chicken Shawarma Plate', 15, 'Garlic sauce, pickles, rice.', ['smoky', 'tangy'], ['gluten-free']), d('Falafel Wrap', 10, 'Tahini, tomato, cucumber.', ['fresh', 'tangy'], ['vegan']), d('Lentil Soup', 6, 'Lemon, cumin.', ['hearty', 'light'], ['vegan', 'gluten-free'])] },
  { id: 'sample-athena', name: 'Athena Taverna', cuisine: 'Greek', price: 2, rating: 4.3, distance: 3.9, tags: ['fresh', 'tangy', 'hearty'],
    dishes: [d('Chicken Souvlaki Plate', 19, 'Pita, tzatziki, lemon potatoes.', ['tangy', 'hearty'], []), d('Spanakopita', 12, 'Spinach & feta in phyllo.', ['savory'], ['vegetarian']), d('Horiatiki Salad', 13, 'Tomato, cucumber, olives, feta.', ['fresh', 'tangy'], ['vegetarian', 'gluten-free'])] },
  { id: 'sample-catch', name: 'The Daily Catch', cuisine: 'Mediterranean', price: 3, rating: 4.6, distance: 6.0, tags: ['fresh', 'light', 'umami'],
    dishes: [d('Garlic Shrimp & Linguine', 27, 'White wine, chili, parsley.', ['savory'], ['pescatarian']), d('Seared Salmon', 29, 'Lemon-caper sauce, greens.', ['light', 'fresh'], ['pescatarian', 'gluten-free']), d('Clam Chowder', 12, 'New England style.', ['creamy', 'hearty'], ['pescatarian'])] },
];

/** Typical dishes by cuisine — used as "look for…" ideas on real (OpenStreetMap) restaurants. NOT menu data. */
export const DISH_IDEAS = {
  Italian: [d('Margherita pizza', 0, '', ['hearty', 'tangy'], ['vegetarian']), d('Pasta alla carbonara', 0, '', ['creamy', 'savory'], []), d('Minestrone soup', 0, '', ['light', 'hearty'], ['vegan'])],
  Mexican: [d('Tacos al pastor', 0, '', ['smoky', 'tangy'], []), d('Bean & veggie burrito', 0, '', ['hearty'], ['vegetarian']), d('Chicken tortilla soup', 0, '', ['spicy', 'hearty'], [])],
  Thai: [d('Pad Thai', 0, '', ['sweet', 'tangy'], []), d('Green or red curry', 0, '', ['spicy', 'creamy'], []), d('Papaya salad', 0, '', ['fresh', 'spicy'], ['vegan'])],
  Indian: [d('Chicken tikka masala', 0, '', ['creamy', 'spicy'], []), d('Chana masala', 0, '', ['spicy', 'hearty'], ['vegan']), d('Saag paneer', 0, '', ['creamy'], ['vegetarian'])],
  Japanese: [d('Sushi or sashimi set', 0, '', ['fresh', 'umami'], ['pescatarian']), d('Ramen', 0, '', ['umami', 'hearty'], []), d('Teriyaki bowl', 0, '', ['sweet', 'umami'], [])],
  Chinese: [d('Dumplings', 0, '', ['umami', 'savory'], []), d('Kung pao chicken', 0, '', ['spicy', 'sweet'], []), d('Stir-fried greens & tofu', 0, '', ['light', 'savory'], ['vegan'])],
  Korean: [d('Bibimbap', 0, '', ['umami', 'spicy'], []), d('Korean BBQ', 0, '', ['smoky', 'umami'], []), d('Kimchi stew', 0, '', ['spicy'], [])],
  Mediterranean: [d('Mezze platter', 0, '', ['fresh', 'tangy'], ['vegan']), d('Grilled fish', 0, '', ['light', 'fresh'], ['pescatarian']), d('Grain bowl', 0, '', ['fresh', 'hearty'], ['vegetarian'])],
  Greek: [d('Gyro or souvlaki', 0, '', ['tangy', 'hearty'], []), d('Greek salad', 0, '', ['fresh', 'tangy'], ['vegetarian']), d('Spanakopita', 0, '', ['savory'], ['vegetarian'])],
  'Middle Eastern': [d('Shawarma', 0, '', ['smoky', 'tangy'], []), d('Falafel wrap', 0, '', ['fresh', 'tangy'], ['vegan']), d('Hummus & pita', 0, '', ['fresh'], ['vegan'])],
  French: [d('Croque monsieur', 0, '', ['creamy', 'savory'], []), d('Onion soup', 0, '', ['hearty'], ['vegetarian']), d('Quiche & salad', 0, '', ['light', 'savory'], ['vegetarian'])],
  American: [d('Burger', 0, '', ['hearty', 'smoky'], []), d('Grilled chicken sandwich', 0, '', ['hearty'], []), d('Big salad with protein', 0, '', ['fresh', 'light'], [])],
};

/** Map OpenStreetMap `cuisine=*` values to FOODIE cuisines. */
export const OSM_CUISINE_MAP = {
  italian: 'Italian', pizza: 'Italian', pasta: 'Italian', mexican: 'Mexican', tacos: 'Mexican', thai: 'Thai', indian: 'Indian', japanese: 'Japanese',
  sushi: 'Japanese', ramen: 'Japanese', chinese: 'Chinese', korean: 'Korean', mediterranean: 'Mediterranean', greek: 'Greek', lebanese: 'Middle Eastern',
  turkish: 'Middle Eastern', kebab: 'Middle Eastern', middle_eastern: 'Middle Eastern', arab: 'Middle Eastern', french: 'French', american: 'American',
  burger: 'American', bbq: 'American', barbecue: 'American', steak_house: 'American', sandwich: 'American', chicken: 'American', seafood: 'Mediterranean',
};
