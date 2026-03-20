import { Deal, UserLocation } from '../types';

/**
 * Generates a set of realistic demo deals around a center location.
 */
export function generateSeededDeals(center: UserLocation): Deal[] {
  const deals: Deal[] = [
    {
      id: 'seed-1',
      businessName: 'The Local Grind',
      title: 'Flash Coffee Special',
      description: 'Our barista just made too many lattes! Grab any large latte for just $2. First come, first served.',
      offerText: '$2 LARGE LATTES',
      distance: '0.4 miles',
      ...getOffsetLocation(center, 0.4),
      createdAt: Date.now(),
      expiresAt: Date.now() + 20 * 60 * 1000,
      maxClaims: 15,
      currentClaims: 4,
      category: 'Food & Drink'
    },
    {
      id: 'seed-2',
      businessName: 'Burger Bliss',
      title: 'Lunch Rush Bonus',
      description: 'Free side of truffle fries with any signature burger purchase. Mention LiveDrop at the counter.',
      offerText: 'FREE TRUFFLE FRIES',
      distance: '1.2 miles',
      ...getOffsetLocation(center, 1.2),
      createdAt: Date.now(),
      expiresAt: Date.now() + 35 * 60 * 1000,
      maxClaims: 20,
      currentClaims: 18, // Almost sold out
      category: 'Food & Drink'
    },
    {
      id: 'seed-3',
      businessName: 'Zen Yoga Studio',
      title: 'Last Minute Mat Space',
      description: 'We have 3 spots left in our 12:30 PM Vinyasa Flow. Claim this drop for a $10 drop-in rate!',
      offerText: '$10 YOGA CLASS',
      distance: '2.8 miles',
      ...getOffsetLocation(center, 2.8),
      createdAt: Date.now(),
      expiresAt: Date.now() + 45 * 60 * 1000,
      maxClaims: 3,
      currentClaims: 0,
      category: 'Health & Fitness'
    },
    {
      id: 'seed-4',
      businessName: 'Taco Fiesta',
      title: 'Taco Tuesday Early Bird',
      description: 'Get a platter of 4 street tacos and a soda for $8. Valid for the next hour only.',
      offerText: '$8 TACO PLATTER',
      distance: '4.5 miles',
      ...getOffsetLocation(center, 4.5),
      createdAt: Date.now(),
      expiresAt: Date.now() + 60 * 60 * 1000,
      maxClaims: 30,
      currentClaims: 12,
      category: 'Food & Drink'
    },
    {
      id: 'seed-5',
      businessName: 'Clean & Gleam',
      title: 'Express Wash Discount',
      description: 'Drive through now and get our Premium Shine wash for the price of a Basic wash.',
      offerText: 'FREE WASH UPGRADE',
      distance: '7.0 miles',
      ...getOffsetLocation(center, 7.0),
      createdAt: Date.now(),
      expiresAt: Date.now() + 90 * 60 * 1000,
      maxClaims: 10,
      currentClaims: 10, // SOLD OUT
      category: 'Services'
    },
    {
      id: 'seed-6',
      businessName: 'The Book Nook',
      title: 'Mystery Book Drop',
      description: 'We just put out a box of "Blind Date with a Book". Claim this to get one for free with any purchase!',
      offerText: 'FREE MYSTERY BOOK',
      distance: '12.0 miles',
      ...getOffsetLocation(center, 12.0),
      createdAt: Date.now(),
      expiresAt: Date.now() + 120 * 60 * 1000,
      maxClaims: 12,
      currentClaims: 5,
      category: 'Shopping'
    },
    {
      id: 'seed-7',
      businessName: 'Smoothie Station',
      title: 'Post-Workout Refresher',
      description: 'All protein smoothies are 30% off for the next 40 minutes. Refuel your body!',
      offerText: '30% OFF SMOOTHIES',
      distance: '0.8 miles',
      ...getOffsetLocation(center, 0.8),
      createdAt: Date.now(),
      expiresAt: Date.now() + 40 * 60 * 1000,
      maxClaims: 25,
      currentClaims: 2,
      category: 'Food & Drink'
    },
    {
      id: 'seed-8',
      businessName: 'Pet Palace',
      title: 'Treat Jar Refill',
      description: 'Bring your furry friend in and get a free bag of organic treats with any grooming service.',
      offerText: 'FREE DOG TREATS',
      distance: '3.5 miles',
      ...getOffsetLocation(center, 3.5),
      createdAt: Date.now(),
      expiresAt: Date.now() + 180 * 60 * 1000,
      maxClaims: 15,
      currentClaims: 15, // SOLD OUT
      category: 'Shopping'
    }
  ];

  return deals;
}

/**
 * Helper to calculate a lat/lng offset based on miles.
 * This is a rough approximation for demo purposes.
 * 1 degree lat is ~69 miles.
 * 1 degree lng is ~69 * cos(lat) miles.
 */
function getOffsetLocation(center: UserLocation, miles: number): { lat: number; lng: number } {
  const latOffset = (miles / 69) * (Math.random() > 0.5 ? 1 : -1) * (0.7 + Math.random() * 0.3);
  const lngOffset = (miles / (69 * Math.cos(center.lat * Math.PI / 180))) * (Math.random() > 0.5 ? 1 : -1) * (0.7 + Math.random() * 0.3);
  
  return {
    lat: center.lat + latOffset,
    lng: center.lng + lngOffset
  };
}
