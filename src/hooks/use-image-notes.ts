import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ImageNote {
  imageUrl: string;
  note?: string;
  hasStain?: boolean;
  shotType?: 'front' | 'back' | 'label' | 'detail';
}

// Store notes temporarily in session for matching after upload
// Notes are keyed by filename since we don't have URL until after upload
let pendingNotes: Map<string, { note?: string; hasStain?: boolean; type?: string }> = new Map();

export function useImageNotes() {
  const [notes, setNotes] = useState<Map<string, ImageNote>>(new Map());

  // Store notes by filename before upload
  const storePendingNotes = useCallback((
    notesByFilename: Map<string, { note?: string; hasStain?: boolean; type?: string }>
  ) => {
    pendingNotes = new Map(notesByFilename);
  }, []);

  // After upload, match notes to actual URLs by filename pattern
  const matchNotesToUrls = useCallback((uploadedUrls: string[]) => {
    const matched = new Map<string, ImageNote>();
    
    for (const url of uploadedUrls) {
      // Extract original filename from URL (Supabase storage includes it)
      for (const [filename, noteData] of pendingNotes.entries()) {
        if (url.includes(encodeURIComponent(filename)) || url.includes(filename)) {
          matched.set(url, {
            imageUrl: url,
            note: noteData.note,
            hasStain: noteData.hasStain,
            shotType: noteData.type as 'front' | 'back' | 'label' | 'detail',
          });
          break;
        }
      }
    }
    
    setNotes(matched);
    pendingNotes.clear();
    return matched;
  }, []);

  // Get note for a specific image URL
  const getNote = useCallback((imageUrl: string): ImageNote | undefined => {
    return notes.get(imageUrl);
  }, [notes]);

  // Check if any images have stain markers
  const getStainImages = useCallback((): string[] => {
    return Array.from(notes.entries())
      .filter(([_, note]) => note.hasStain)
      .map(([url]) => url);
  }, [notes]);

  // Get images by shot type (for quick product mode)
  const getImagesByShotType = useCallback((type: 'front' | 'back' | 'label' | 'detail'): string[] => {
    return Array.from(notes.entries())
      .filter(([_, note]) => note.shotType === type)
      .map(([url]) => url);
  }, [notes]);

  // Get all quick product shots in order
  const getQuickProductShots = useCallback((): { front?: string; back?: string; label?: string; detail?: string } => {
    const result: { front?: string; back?: string; label?: string; detail?: string } = {};
    
    for (const [url, note] of notes.entries()) {
      if (note.shotType) {
        result[note.shotType] = url;
      }
    }
    
    return result;
  }, [notes]);

  return {
    notes,
    storePendingNotes,
    matchNotesToUrls,
    getNote,
    getStainImages,
    getImagesByShotType,
    getQuickProductShots,
  };
}