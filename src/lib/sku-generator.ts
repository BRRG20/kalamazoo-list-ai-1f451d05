import { supabase } from '@/integrations/supabase/client';

/**
 * APPROVED CATEGORY CODES - DO NOT MODIFY WITHOUT EXPLICIT INSTRUCTION
 * If an item does not match exactly, flag for manual review
 */
export const CATEGORY_CODES: Record<string, string> = {
  // T-Shirts
  't-shirt': 'TS',
  'tee': 'TS',
  'tshirt': 'TS',
  't shirt': 'TS',
  
  // Hoodies
  'hoodie': 'HD',
  
  // Sweaters
  'sweater': 'SW',
  
  // Jumpers
  'jumper': 'JP',
  
  // Fleece
  'fleece': 'FL',
  
  // Coloured Fleece
  'coloured fleece': 'CF',
  'colored fleece': 'CF',
  
  // Jeans
  'jeans': 'JN',
  
  // Jackets
  'jacket': 'JK',
  
  // Flannel Jacket
  'flannel jacket': 'FJ',
  
  // Hawaiian Shirt
  'hawaiian shirt': 'HS',
  'hawaiian': 'HS',
  
  // Band T-Shirt
  'band t-shirt': 'BT',
  'band tee': 'BT',
  'band tshirt': 'BT',
  
  // College Hoodie
  'college hoodie': 'CH',
  
  // Reworked items
  'rework': 'RW-GEN',
  'reworked': 'RW-GEN',
  'reworked item': 'RW-GEN',
};

/**
 * APPROVED STYLE CODES - Based on era or defining features
 * DO NOT INVENT NEW CODES
 */
export const STYLE_CODES: Record<string, string> = {
  // Era-based
  '80s': '80P',       // 80s Pattern
  '90s': '90G',       // 90s Graphic
  'Y2K': 'Y2K',       // Y2K era
  'Modern': '',       // Modern items - no style code
  
  // Feature-based
  'vintage': 'VTG',
  'vtg': 'VTG',
  'university': 'UN',
  'college': 'UN',
  'blue denim': 'BL',
  'vintage graphic': 'VG',
};

/**
 * STANDARDIZED SIZE CODES
 * XS / S / M / L / XL / OS only
 */
export const SIZE_CODES: Record<string, string> = {
  'xs': 'XS',
  'extra small': 'XS',
  'x-small': 'XS',
  's': 'S',
  'small': 'S',
  'm': 'M',
  'medium': 'M',
  'l': 'L',
  'large': 'L',
  'xl': 'XL',
  'extra large': 'XL',
  'x-large': 'XL',
  'xxl': 'XL',     // Map XXL to XL for standardization
  '2xl': 'XL',
  'xxxl': 'XL',
  '3xl': 'XL',
  'os': 'OS',
  'one size': 'OS',
  'onesize': 'OS',
  'free size': 'OS',
};

// Valid standardized sizes
export const VALID_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'OS'] as const;
export type ValidSize = typeof VALID_SIZES[number];

/**
 * Get category code from garment type
 * Returns null if no exact match - flags for manual review
 */
export function getCategoryCode(garmentType: string | undefined | null): string | null {
  if (!garmentType) return null;
  
  const normalizedType = garmentType.toLowerCase().trim();
  
  // Check for compound matches first (e.g., "flannel jacket" before "jacket")
  const compoundKeys = Object.keys(CATEGORY_CODES)
    .filter(k => k.includes(' '))
    .sort((a, b) => b.length - a.length);
  
  for (const key of compoundKeys) {
    if (normalizedType.includes(key)) {
      return CATEGORY_CODES[key];
    }
  }
  
  // Direct match only - no guessing
  if (CATEGORY_CODES[normalizedType]) {
    return CATEGORY_CODES[normalizedType];
  }
  
  // Check single-word matches
  for (const [key, code] of Object.entries(CATEGORY_CODES)) {
    if (!key.includes(' ') && normalizedType === key) {
      return code;
    }
  }
  
  // NO PARTIAL MATCHING - return null for manual review
  return null;
}

/**
 * Get style code from era or features
 * Only uses approved codes - no invention
 */
export function getStyleCode(era: string | undefined | null): string {
  if (!era) return '';
  
  const normalizedEra = era.toLowerCase().trim();
  
  // Direct match
  for (const [key, code] of Object.entries(STYLE_CODES)) {
    if (normalizedEra === key.toLowerCase() || normalizedEra.includes(key.toLowerCase())) {
      return code;
    }
  }
  
  // If era is provided but no match, return empty - don't invent codes
  return '';
}

/**
 * Get standardized size code
 * Uses label size if available, falls back to recommended size
 */
export function getSizeCode(sizeRecommended: string | undefined | null, sizeLabel?: string | undefined | null): string | null {
  // Prefer label size if available and valid
  const sizeToUse = sizeLabel || sizeRecommended;
  
  if (!sizeToUse) return null;
  
  const normalizedSize = sizeToUse.toLowerCase().trim();
  
  // Direct match
  if (SIZE_CODES[normalizedSize]) {
    return SIZE_CODES[normalizedSize];
  }
  
  // Pattern matching for common formats
  if (normalizedSize.match(/^x+s$/i)) return 'XS';
  if (normalizedSize.match(/^s$/i)) return 'S';
  if (normalizedSize.match(/^m$/i)) return 'M';
  if (normalizedSize.match(/^l$/i)) return 'L';
  if (normalizedSize.match(/^x+l$/i)) return 'XL'; // All XL variants map to XL
  
  // Extract size from strings like "Fits like M" or "Medium (M)"
  const sizeMatch = normalizedSize.match(/\b(xs|s|m|l|xl)\b/i);
  if (sizeMatch) {
    return sizeMatch[1].toUpperCase() as ValidSize;
  }
  
  // No valid size found - needs manual review
  return null;
}

export interface SKUValidation {
  isValid: boolean;
  needsManualReview: boolean;
  missingFields: string[];
  flaggedReasons: string[];
  categoryCode: string | null;
  styleCode: string;
  sizeCode: string | null;
}

/**
 * Validate if a product has all required fields for SKU generation
 * Flags items that need manual review instead of guessing
 */
export function validateForSKU(
  garmentType: string | undefined | null,
  sizeRecommended: string | undefined | null,
  era?: string | undefined | null,
  sizeLabel?: string | undefined | null
): SKUValidation {
  const categoryCode = getCategoryCode(garmentType);
  const styleCode = getStyleCode(era);
  const sizeCode = getSizeCode(sizeRecommended, sizeLabel);
  
  const missingFields: string[] = [];
  const flaggedReasons: string[] = [];
  
  if (!garmentType) {
    missingFields.push('garment type');
  } else if (!categoryCode) {
    flaggedReasons.push(`Unknown category: "${garmentType}" - needs manual review`);
  }
  
  if (!sizeRecommended && !sizeLabel) {
    missingFields.push('size (label or recommended)');
  } else if (!sizeCode) {
    flaggedReasons.push(`Unknown size: "${sizeLabel || sizeRecommended}" - needs manual review`);
  }
  
  const needsManualReview = flaggedReasons.length > 0;
  const isValid = missingFields.length === 0 && !needsManualReview;
  
  return {
    isValid,
    needsManualReview,
    missingFields,
    flaggedReasons,
    categoryCode,
    styleCode,
    sizeCode,
  };
}

/**
 * Generate SKU for a product using the database function
 * Format: [CATEGORY]-[STYLE]-[SIZE]-[NUMBER]
 * If style is empty: [CATEGORY]-[SIZE]-[NUMBER]
 * 
 * Returns null and flags for manual review if validation fails
 */
export async function generateSKU(
  garmentType: string | undefined | null,
  sizeRecommended: string | undefined | null,
  era?: string | undefined | null,
  sizeLabel?: string | undefined | null
): Promise<{ sku: string | null; error: string | null; validation: SKUValidation }> {
  const validation = validateForSKU(garmentType, sizeRecommended, era, sizeLabel);
  
  if (!validation.isValid) {
    const errorParts: string[] = [];
    
    if (validation.missingFields.length > 0) {
      errorParts.push(`Missing: ${validation.missingFields.join(', ')}`);
    }
    
    if (validation.flaggedReasons.length > 0) {
      errorParts.push(validation.flaggedReasons.join('; '));
    }
    
    return {
      sku: null,
      error: errorParts.join('. ') || 'Validation failed - needs manual review',
      validation,
    };
  }
  
  try {
    // Call database function which handles auto-increment per category
    const { data, error } = await supabase.rpc('generate_sku', {
      p_category_code: validation.categoryCode!,
      p_era_code: validation.styleCode, // Using styleCode (era-based)
      p_size: validation.sizeCode!,
    });
    
    if (error) {
      console.error('Error generating SKU:', error);
      return {
        sku: null,
        error: error.message,
        validation,
      };
    }
    
    return {
      sku: data,
      error: null,
      validation,
    };
  } catch (err) {
    console.error('Exception generating SKU:', err);
    return {
      sku: null,
      error: 'Failed to generate SKU',
      validation,
    };
  }
}

/**
 * Check if an SKU follows the expected format
 * Valid formats:
 * - CATEGORY-STYLE-SIZE-NNN (e.g., TS-90G-M-001)
 * - CATEGORY-SIZE-NNN (e.g., HD-L-003)
 */
export function isValidSKUFormat(sku: string): boolean {
  // Format with style: CATEGORY-STYLE-SIZE-NNN
  const withStyle = /^[A-Z]{2}(-[A-Z]+)?-[A-Z0-9]{2,4}-[A-Z]{1,2}-\d{3}$/;
  // Format without style: CATEGORY-SIZE-NNN
  const withoutStyle = /^[A-Z]{2}(-[A-Z]+)?-[A-Z]{1,2}-\d{3}$/;
  
  return withStyle.test(sku) || withoutStyle.test(sku);
}

/**
 * Get all valid category codes for display/validation
 */
export function getValidCategoryCodes(): string[] {
  return [...new Set(Object.values(CATEGORY_CODES))];
}

/**
 * Get all valid style codes for display/validation
 */
export function getValidStyleCodes(): string[] {
  return [...new Set(Object.values(STYLE_CODES).filter(Boolean))];
}
