import {
  runImportPipeline,
  type MerchantSource,
  type ValidationResult,
} from './import-pipeline.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

type FinderRequest = {
  phase?: 'search' | 'extract' | 'generate';
  keyword?: string;
  url?: string;
  affiliateUrl?: string;
  merchant?: MerchantSource;
  category?: string;
  maxPrice?: number | null;
  minDiscount?: number | null;
  enhance?: boolean;
};

const errorResponse = (status: number, message: string, details?: string, stage?: string) =>
  json(
    {
      error: message,
      details: details ?? null,
      stage: stage ?? null,
    },
    status,
  );

const normalizeOptionalHttpUrl = (value?: string | null) => {
  if (!value?.trim()) return null;

  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
};

const buildMissingGroups = (validationResult: ValidationResult) => ({
  required: validationResult.missingRequiredFields,
  optional: validationResult.warnings
    .filter((warning) => warning.severity !== 'error')
    .map((warning) => warning.field),
  filled: validationResult.fieldStates
    .filter((state) => state.status === 'ready')
    .map((state) => state.field),
});

const buildExtractionDebug = (
  pipelineResult: Awaited<ReturnType<typeof runImportPipeline>>,
) => ({
  sourceUrl: pipelineResult.scanResult.sourceUrl,
  cleanedProductUrl: pipelineResult.scanResult.cleanedSourceUrl,
  fetchAttempted: true,
  fetchSucceeded: pipelineResult.scanResult.fetchSucceeded,
  responseStatus: pipelineResult.scanResult.fetchSucceeded ? 200 : null,
  finalUrl: pipelineResult.scanResult.finalUrl,
  contentType: pipelineResult.scanResult.contentType,
  htmlLength: pipelineResult.scanResult.htmlLength,
  extractedFlags: {
    title: Boolean(pipelineResult.scanResult.fields.title.value),
    image: Boolean(pipelineResult.scanResult.fields.mainImage.value),
    price: pipelineResult.scanResult.fields.currentPrice.value != null,
    canonicalUrl: Boolean(pipelineResult.scanResult.cleanedSourceUrl),
  },
  matchedSelectors: {
    title: pipelineResult.scanResult.fields.title.source,
    image: pipelineResult.scanResult.fields.mainImage.source,
    price: pipelineResult.scanResult.fields.currentPrice.source,
    canonicalUrl: pipelineResult.scanResult.cleanedSourceUrl ? 'normalized:sourceUrl' : null,
  },
  failedFields: pipelineResult.validationResult.warnings.map((warning) => warning.field),
  failureReason: pipelineResult.failureReason,
});

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let currentStep = 'request-start';

  try {
    currentStep = 'parse-request-body';
    const body = (await request.json()) as FinderRequest;
    const phase = body.phase ?? 'extract';
    const sourceUrl = body.url?.trim() ?? '';
    const affiliateUrl = normalizeOptionalHttpUrl(body.affiliateUrl);

    console.info('[LiveDrop][ai-deal-finder] Incoming request', {
      phase,
      sourceUrl,
      affiliateUrl,
      merchant: body.merchant ?? null,
      category: body.category ?? null,
      maxPrice: body.maxPrice ?? null,
      minDiscount: body.minDiscount ?? null,
    });

    if (!sourceUrl) {
      return errorResponse(
        400,
        'Paste the full product page URL to continue.',
        'The importer now requires a direct source product URL for the scan stage.',
        'validate-input',
      );
    }

    currentStep = 'run-import-pipeline';
    const pipelineResult = await runImportPipeline({
      sourceUrl,
      affiliateUrl,
      merchantHint: body.merchant ?? null,
      categoryHint: body.category ?? null,
      maxPrice: body.maxPrice ?? null,
      minDiscount: body.minDiscount ?? null,
    });

    currentStep = 'build-response';
    const generatedJson = phase === 'generate'
      ? JSON.stringify(pipelineResult.mappedForm.draft, null, 2)
      : '';
    const missingGroups = buildMissingGroups(pipelineResult.validationResult);
    const extractionDebug = buildExtractionDebug(pipelineResult);
    const sourceAssets = {
      websiteUrl: pipelineResult.mappedForm.payload.websiteUrl || null,
      productUrl: pipelineResult.normalizedDigest.sourceUrl,
      affiliateUrl: pipelineResult.normalizedDigest.affiliateUrl,
      imageUrl: pipelineResult.normalizedDigest.image,
    };

    return json({
      normalizedDeal: pipelineResult.mappedForm.draft,
      generatedJson,
      missingFields: pipelineResult.validationResult.missingRequiredFields,
      blockingIssues: pipelineResult.validationResult.blockingIssues,
      dealScore: pipelineResult.dealScore,
      summary: pipelineResult.normalizedDigest.summary ?? pipelineResult.normalizedDigest.description,
      resultQuality: pipelineResult.resultQuality,
      partialData: pipelineResult.partialData,
      enrichmentError: pipelineResult.failureReason,
      completionPercent: pipelineResult.validationResult.completionPercent,
      missingGroups,
      sourceAssets,
      extractionStatus: pipelineResult.extractionStatus,
      extractionDebug,
      requestPayload: {
        query: null,
        url: sourceUrl,
        affiliateUrl,
        merchant: body.merchant ?? null,
        category: body.category ?? null,
        maxPrice: body.maxPrice ?? null,
        minDiscount: body.minDiscount ?? null,
      },
      responseMeta: {
        responseStatus: pipelineResult.scanResult.fetchSucceeded ? 200 : 0,
        rawResultCount: 1,
        filteredResultCount: 1,
      },
      appliedFilters: {
        merchant: body.merchant ?? null,
        category: body.category ?? null,
        maxPrice: body.maxPrice ?? null,
        minDiscount: body.minDiscount ?? null,
      },
      provider: pipelineResult.scanResult.provider,
      searchStatus: 'Direct URL mode',
      searchQuery: pipelineResult.scanResult.cleanedSourceUrl ?? sourceUrl,
      queryAttempts: [],
      searchCandidates: [],
      validProductCandidates: [],
      rejectedCandidates: [],
      searchStats: {
        totalResults: 1,
        validProductPages: pipelineResult.scanResult.fetchSucceeded ? 1 : 0,
        rejectedNonProductPages: pipelineResult.scanResult.fetchSucceeded ? 0 : 1,
        selectedSource: sourceUrl,
      },
      scanResult: pipelineResult.scanResult,
      normalizedDigest: pipelineResult.normalizedDigest,
      validationResult: pipelineResult.validationResult,
      mappedForm: pipelineResult.mappedForm,
      message: pipelineResult.extractionStatus === 'Extraction succeeded'
        ? 'Pipeline completed. Review the scan, normalized digest, validation, and mapped form output below.'
        : 'Pipeline completed with blocking validation issues. Review the validation step before filling the portal.',
      functionName: 'ai-deal-finder',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to import product data.';
    console.error('[LiveDrop][ai-deal-finder] Failure', {
      step: currentStep,
      error,
    });
    return errorResponse(500, message, `The Edge Function failed during ${currentStep}.`, currentStep);
  }
});
