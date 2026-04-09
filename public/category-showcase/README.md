Replace these default artwork files with your real category images using the same filenames:

- `all.svg`
- `tech.svg`
- `fashion.svg`
- `gaming.svg`
- `digital.svg`
- `home.svg`
- `food.svg`

You can also switch to `.jpg/.png/.webp` files by updating `CATEGORY_SHOWCASE_ASSETS` in:

`src/App.tsx`

Example:

```ts
Tech: {
  heroImage: '/category-showcase/tech.webp',
  tileImage: '/category-showcase/tech.webp',
  ...
}
```
