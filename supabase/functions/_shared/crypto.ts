// Shared encryption utilities using AES-256-GCM
// This module provides secure encryption/decryption for sensitive credentials

const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12; // 96 bits for GCM
const KEY_LENGTH = 32; // 256 bits

// Get or derive encryption key from environment
async function getEncryptionKey(): Promise<CryptoKey> {
  const keyString = Deno.env.get('CREDENTIAL_ENCRYPTION_KEY');
  
  // If no key is set, use a derived key from service role key
  // This is a fallback - production should have a dedicated key
  const keyMaterial = keyString || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  
  // Hash the key material to ensure consistent length
  const encoder = new TextEncoder();
  const data = encoder.encode(keyMaterial);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  
  return await crypto.subtle.importKey(
    'raw',
    hashBuffer,
    { name: ALGORITHM },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a plaintext string using AES-256-GCM
 * Returns a base64-encoded string containing IV + ciphertext
 */
export async function encryptCredential(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  
  // Generate random IV for each encryption
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    data
  );
  
  // Combine IV and ciphertext
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  // Encode as base64 for storage
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a ciphertext string that was encrypted with encryptCredential
 * Input should be a base64-encoded string containing IV + ciphertext
 */
export async function decryptCredential(ciphertext: string): Promise<string> {
  const key = await getEncryptionKey();
  
  // Decode from base64
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  
  // Extract IV and ciphertext
  const iv = combined.slice(0, IV_LENGTH);
  const encrypted = combined.slice(IV_LENGTH);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    encrypted
  );
  
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Check if a ciphertext appears to be in the new encrypted format
 * (vs the old base64-only format)
 */
export function isNewEncryptionFormat(ciphertext: string): boolean {
  try {
    const decoded = atob(ciphertext);
    // Old format was "user_id:credential", new format is binary IV+ciphertext
    // Binary data won't contain valid UUID characters in expected positions
    return decoded.length > IV_LENGTH && !decoded.includes(':');
  } catch {
    return false;
  }
}
