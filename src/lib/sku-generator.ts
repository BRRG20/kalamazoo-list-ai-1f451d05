import { supabase } from '@/integrations/supabase/client';

// Category code mappings based on garment type
export const CATEGORY_CODES: Record<string, string> = {
  // T-Shirts
  't-shirt': 'TS',
  'tee': 'TS',
  'tshirt': 'TS',
  
  // Band T-Shirts (detected via brand/tags containing music-related terms)
  'band t-shirt': 'BT',
  'band tee': 'BT',
  
  // Sweaters
  'sweater': 'SW',
  'pullover': 'SW',
  
  // Jumpers
  'jumper': 'JP',
  
  // Hoodies
  'hoodie': 'HD',
  
  // College Hoodies (detected via specific styling)
  'college hoodie': 'CH',
  
  // Fleece
  'fleece': 'FL',
  
  // Coloured Fleece (fleece with non-neutral colors)
  'coloured fleece': 'CF',
  'colored fleece': 'CF',
  
  // Jackets
  'jacket': 'JK',
  'coat': 'JK',
  
  // Flannel Jackets
  'flannel jacket': 'FJ',
  
  // Hawaiian Shirts
  'hawaiian shirt': 'HS',
  
  // Jeans
  'jeans': 'JN',
  'denim': 'JN',
  
  // Vests / Gilets
  'vest': 'VT',
  'gilet': 'VT',
  
  // Flannel Shirts
  'flannel shirt': 'FL',
  'flannel': 'FL',
  
  // Rework items
  'rework': 'RW-GEN',
  'reworked': 'RW-GEN',
  
  // Other common types - map to closest category
  'shirt': 'TS',
  'blouse': 'TS',
  'cardigan': 'SW',
  'trousers': 'JN',
  'shorts': 'JN',
  'dress': 'TS',
  'skirt': 'TS',
};

// Era code mappings
export const ERA_CODES: Record<string, string> = {
  '80s': '80P',
  '90s': '90G', // Default 90s code
  'Y2K': 'UN', // Y2K maps to UN
  'Modern': '', // Modern items don't get era codes
  'vintage': 'VG', // Generic vintage
  'VTG': 'VTG',
};

// Size code mappings
export const SIZE_CODES: Record<string, string> = {
  'xs': 'XS',
  'extra small': 'XS',
  's': 'S',
  'small': 'S',
  'm': 'M',
  'medium': 'M',
  'l': 'L',
  'large': 'L',
  'xl': 'XL',
  'extra large': 'XL',
  'xxl': 'XXL',
  '2xl': 'XXL',
  'xxxl': 'XXXL',
  '3xl': 'XXXL',
  'os': 'OS',
  'one size': 'OS',
  'onesize': 'OS',
};

/**
 * Get category code from garment type
 */
export function getCategoryCode(garmentType: string | undefined | null): string | null {
  if (!garmentType) return null;
  
  const normalizedType = garmentType.toLowerCase().trim();
  
  // Direct match
  if (CATEGORY_CODES[normalizedType]) {
    return CATEGORY_CODES[normalizedType];
  }
  
  // Partial match - check if any key is contained in the garment type
  for (const [key, code] of Object.entries(CATEGORY_CODES)) {
    if (normalizedType.includes(key) || key.includes(normalizedType)) {
      return code;
    }
  }
  
  return null;
}

/**
 * Get era code from era value
 */
export function getEraCode(era: string | undefined | null): string {
  if (!era) return '';
  
  const normalizedEra = era.trim();
  
  // Direct match
  if (ERA_CODES[normalizedEra]) {
    return ERA_CODES[normalizedEra];
  }
  
  // Check for vintage keywords
  if (normalizedEra.toLowerCase().includes('vintage') || 
      normalizedEra.toLowerCase().includes('vtg')) {
    return 'VG';
  }
  
  return '';
}

/**
 * Get size code from recommended size
 */
export function getSizeCode(sizeRecommended: string | undefined | null): string | null {
  if (!sizeRecommended) return null;
  
  const normalizedSize = sizeRecommended.toLowerCase().trim();
  
  // Direct match
  if (SIZE_CODES[normalizedSize]) {
    return SIZE_CODES[normalizedSize];
  }
  
  // Check for size patterns
  if (normalizedSize.match(/^x+s$/i)) return 'XS';
  if (normalizedSize.match(/^s$/i)) return 'S';
  if (normalizedSize.match(/^m$/i)) return 'M';
  if (normalizedSize.match(/^l$/i)) return 'L';
  if (normalizedSize.match(/^x+l$/i)) {
    const xCount = (normalizedSize.match(/x/gi) || []).length;
    if (xCount === 1) return 'XL';
    if (xCount === 2) return 'XXL';
    return 'XXXL';
  }
  
  // Extract size from strings like "Fits like M" or "Medium (M)"
  const sizeMatch = normalizedSize.match(/\b(xs|s|m|l|xl|xxl|xxxl|2xl|3xl)\b/i);
  if (sizeMatch) {
    return SIZE_CODES[sizeMatch[1].toLowerCase()] || sizeMatch[1].toUpperCase();
  }
  
  return null;
}

export interface SKUValidation {
  isValid: boolean;
  missingFields: string[];
  categoryCode: string | null;
  eraCode: string;
  sizeCode: string | null;
}

/**
 * Validate if a product has all required fields for SKU generation
 */
export function validateForSKU(
  garmentType: string | undefined | null,
  sizeRecommended: string | undefined | null,
  era?: string | undefined | null
): SKUValidation {
  const categoryCode = getCategoryCode(garmentType);
  const eraCode = getEraCode(era);
  const sizeCode = getSizeCode(sizeRecommended);
  
  const missingFields: string[] = [];
  
  if (!categoryCode) {
    missingFields.push('garment type');
  }
  
  if (!sizeCode) {
    missingFields.push('recommended size');
  }
  
  return {
    isValid: missingFields.length === 0,
    missingFields,
    categoryCode,
    eraCode,
    sizeCode,
  };
}

/**
 * Generate SKU for a product using the database function
 * Returns the generated SKU or null if validation fails
 */
export async function generateSKU(
  garmentType: string | undefined | null,
  sizeRecommended: string | undefined | null,
  era?: string | undefined | null
): Promise<{ sku: string | null; error: string | null; validation: SKUValidation }> {
  const validation = validateForSKU(garmentType, sizeRecommended, era);
  
  if (!validation.isValid) {
    return {
      sku: null,
      error: `Missing required fields: ${validation.missingFields.join(', ')}`,
      validation,
    };
  }
  
  try {
    const { data, error } = await supabase.rpc('generate_sku', {
      p_category_code: validation.categoryCode!,
      p_era_code: validation.eraCode,
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
 */
export function isValidSKUFormat(sku: string): boolean {
  // Format: CATEGORY-[ERA]-SIZE-NNN or CATEGORY-SIZE-NNN
  const withEra = /^[A-Z]{2,6}(-[A-Z0-9]{2,3})?-[A-Z]{1,4}-\d{3}$/;
  return withEra.test(sku);
}
