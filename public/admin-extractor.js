(function () {
  const scriptEl = document.currentScript;
  const scriptSrc = scriptEl && scriptEl.src ? scriptEl.src : '';
  const hashIndex = scriptSrc.indexOf('#');
  const nonce = hashIndex >= 0 ? decodeURIComponent(scriptSrc.slice(hashIndex + 1)) : '';
  let targetOrigin = '*';

  try {
    if (scriptSrc) {
      targetOrigin = new URL(scriptSrc).origin;
    }
  } catch {
    targetOrigin = '*';
  }

  const debug = {
    matches: {},
    missing: [],
    warnings: [],
  };

  const cleanText = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

  const recordMatch = (field, value, source) => {
    if (value) {
      debug.matches[field] = source || 'text';
    } else {
      debug.missing.push(field);
    }
  };

  const selectText = (selectors, root) => {
    for (const selector of selectors) {
      const element = root.querySelector(selector);
      const text = cleanText(element ? element.textContent : '');
      if (text) {
        return { value: text, selector };
      }
    }
    return null;
  };

  const selectMeta = (selector, attr) => {
    const element = document.querySelector(selector);
    const value = cleanText(element ? element.getAttribute(attr) : '');
    return value ? { value, selector } : null;
  };

  const parsePrice = (value) => {
    if (!value) return null;
    const match = value.replace(/,/g, '').match(/(\d{1,5}(?:\.\d{1,2})?)/);
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const selectPrice = (selectors, root) => {
    for (const selector of selectors) {
      const element = root.querySelector(selector);
      const text = cleanText(element ? element.textContent : '');
      const price = parsePrice(text);
      if (price !== null) {
        return { value: price, text, selector };
      }
    }
    return null;
  };

  const findStrikethroughPrice = (root) => {
    const candidates = Array.from(root.querySelectorAll('s, del, strike, .price--strike, .list-price, .was-price'));
    for (const element of candidates) {
      const text = cleanText(element.textContent || '');
      const price = parsePrice(text);
      if (price !== null) {
        return { value: price, text, selector: element.tagName.toLowerCase() };
      }
    }
    return null;
  };

  const selectPercent = (root) => {
    const percentSelectors = [
      '[class*="discount"]',
      '[class*="saving"]',
      '[data-testid*="discount"]',
      '[aria-label*="%"]',
    ];
    for (const selector of percentSelectors) {
      const element = root.querySelector(selector);
      const text = cleanText(element ? element.textContent : '');
      const match = text.match(/(\d{1,3})\s*%/);
      if (match) {
        return { value: Number(match[1]), text, selector };
      }
    }

    const fallbackMatch = cleanText(root.textContent || '').match(/(\d{1,3})\s*%\s*(off|save|discount)?/i);
    if (fallbackMatch) {
      return { value: Number(fallbackMatch[1]), text: fallbackMatch[0], selector: 'text-search' };
    }

    return null;
  };

  const pickMainImage = (root) => {
    const selectors = [
      '#landingImage',
      'img#imgBlkFront',
      'img[data-old-hires]',
      'img[data-a-dynamic-image]',
      'img[data-testid="hero-image"]',
      '.product-image img',
      'img',
    ];
    for (const selector of selectors) {
      const element = root.querySelector(selector);
      const src =
        (element && element.getAttribute && element.getAttribute('src')) ||
        (element && element.getAttribute && element.getAttribute('data-old-hires')) ||
        '';
      if (src && !src.startsWith('data:')) {
        return { value: src, selector };
      }
    }

    const metaImage = selectMeta('meta[property="og:image"]', 'content');
    if (metaImage) return metaImage;
    return null;
  };

  const findBreadcrumb = (root) => {
    const selectors = [
      'nav[aria-label="Breadcrumb"] a',
      '.breadcrumb a',
      '#wayfinding-breadcrumbs_container a',
      '[data-testid="breadcrumbs"] a',
    ];
    for (const selector of selectors) {
      const items = Array.from(root.querySelectorAll(selector)).map((item) => cleanText(item.textContent || '')).filter(Boolean);
      if (items.length > 0) {
        return { value: items[items.length - 1], selector };
      }
    }
    return null;
  };

  const findSavingsText = (root) => {
    const patterns = [/save/i, /coupon/i, /deal/i, /savings?/i, /promo/i];
    const candidates = Array.from(root.querySelectorAll('[class*="coupon"], [class*="saving"], [class*="deal"], [data-testid*="coupon"], [data-testid*="deal"]'));
    for (const element of candidates) {
      const text = cleanText(element.textContent || '');
      if (text && patterns.some((pattern) => pattern.test(text))) {
        return { value: text, selector: element.className || element.tagName.toLowerCase() };
      }
    }

    const textContent = cleanText(root.textContent || '');
    const match = textContent.match(/(save\s+\$?\d+.*|coupon.*|savings?.*|deal.*)/i);
    if (match) {
      return { value: match[0], selector: 'text-search' };
    }

    return null;
  };

  const rootCandidates = [
    document.querySelector('#dp'),
    document.querySelector('[data-testid="product"]'),
    document.querySelector('main'),
    document.querySelector('#main'),
  ].filter(Boolean);

  const root = rootCandidates.length > 0 ? rootCandidates[0] : document.body;

  const titleCandidate =
    selectText(['#productTitle', 'h1', '[data-testid="product-title"]', '[itemprop="name"]'], root)
    || selectMeta('meta[property="og:title"]', 'content')
    || selectMeta('meta[name="title"]', 'content');

  const merchantCandidate =
    selectText(['#bylineInfo', '[data-testid="product-brand"]', '.brand', '[itemprop="brand"]'], root)
    || selectMeta('meta[property="og:site_name"]', 'content');

  const currentPriceCandidate =
    selectPrice(
      [
        '#priceblock_dealprice',
        '#priceblock_ourprice',
        '[data-testid="price"]',
        '.price-current',
        '.price--current',
        '.sales-price',
        '.price',
      ],
      root,
    )
    || selectPrice(['meta[itemprop="price"]', 'meta[property="product:price:amount"]'], document);

  const originalPriceCandidate =
    findStrikethroughPrice(root)
    || selectPrice(
      [
        '.priceBlockStrikePriceString',
        '.list-price',
        '.price--was',
        '.price--original',
      ],
      root,
    );

  const percentCandidate = selectPercent(root);
  let discountPercent = percentCandidate ? percentCandidate.value : null;

  if (discountPercent === null && currentPriceCandidate && originalPriceCandidate) {
    const original = originalPriceCandidate.value;
    const current = currentPriceCandidate.value;
    if (original > 0 && current > 0 && original > current) {
      discountPercent = Math.round(((original - current) / original) * 100);
    }
  }

  const imageCandidate = pickMainImage(root);
  const categoryCandidate = findBreadcrumb(root);
  const badgeCandidate =
    selectText(['[class*="badge"]', '[class*="deal"]', '[data-testid*="badge"]'], root)
    || selectText(['.badge', '.deal-badge'], root);
  const savingsCandidate = findSavingsText(root);
  const descriptionCandidate =
    selectText(['#productDescription', '#feature-bullets', '[itemprop="description"]', '.product-description'], root)
    || selectMeta('meta[name="description"]', 'content');

  recordMatch('title', titleCandidate?.value, titleCandidate?.selector);
  recordMatch('merchant', merchantCandidate?.value, merchantCandidate?.selector);
  recordMatch('currentPrice', currentPriceCandidate?.text, currentPriceCandidate?.selector);
  recordMatch('originalPrice', originalPriceCandidate?.text, originalPriceCandidate?.selector);
  recordMatch('discountPercent', discountPercent ? String(discountPercent) : '', percentCandidate?.selector);
  recordMatch('badgeText', badgeCandidate?.value, badgeCandidate?.selector);
  recordMatch('savingsText', savingsCandidate?.value, savingsCandidate?.selector);
  recordMatch('imageUrl', imageCandidate?.value, imageCandidate?.selector);
  recordMatch('category', categoryCandidate?.value, categoryCandidate?.selector);
  recordMatch('description', descriptionCandidate?.value, descriptionCandidate?.selector);

  const payload = {
    title: titleCandidate ? titleCandidate.value : '',
    merchant: merchantCandidate ? merchantCandidate.value : '',
    currentPrice: currentPriceCandidate ? currentPriceCandidate.value : null,
    currentPriceText: currentPriceCandidate ? currentPriceCandidate.text : '',
    originalPrice: originalPriceCandidate ? originalPriceCandidate.value : null,
    originalPriceText: originalPriceCandidate ? originalPriceCandidate.text : '',
    discountPercent: discountPercent,
    badgeText: badgeCandidate ? badgeCandidate.value : '',
    savingsText: savingsCandidate ? savingsCandidate.value : '',
    imageUrl: imageCandidate ? imageCandidate.value : '',
    productUrl: window.location.href,
    category: categoryCandidate ? categoryCandidate.value : '',
    description: descriptionCandidate ? descriptionCandidate.value : '',
    source: window.location.hostname.replace(/^www\./, ''),
  };

  const message = {
    type: 'livedrop-admin-extract',
    source: 'livedrop-admin-extractor',
    nonce,
    payload,
    debug,
  };

  const sendMessage = (targetWindow) => {
    try {
      targetWindow.postMessage(message, targetOrigin === '*' ? '*' : targetOrigin);
      return true;
    } catch (error) {
      debug.warnings.push('Failed to post message to admin window.');
      return false;
    }
  };

  let target = null;
  if (window.opener && !window.opener.closed) {
    target = window.opener;
  } else if (targetOrigin !== '*') {
    target = window.open(`${targetOrigin}/admin#scan`, 'livedrop_admin_scan');
  }

  if (target && sendMessage(target)) {
    return;
  }

  alert('LiveDrop admin window not found. Open the admin portal, then run the LiveDrop scan again.');
})();
