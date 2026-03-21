export const CATEGORY_ICONS: Record<string, string> = {
  'Fast Food': '🍔',
  Coffee: '☕',
  Fitness: '💪',
  Pet: '🐶',
  Home: '🏠',
  Beauty: '💄',
};

export function getCategoryLabel(category: string): string {
  const icon = CATEGORY_ICONS[category];
  return icon ? `${icon} ${category}` : category;
}
