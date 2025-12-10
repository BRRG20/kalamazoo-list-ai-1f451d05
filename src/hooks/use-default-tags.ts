import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type GenderType = 'men' | 'women' | 'both';

export interface DefaultTag {
  id: string;
  tag_name: string;
  assigned_garment_types: string[];
  gender: GenderType;
  keywords: string[];
  created_at: string;
  updated_at: string;
}

export interface ProductMatchData {
  garmentType?: string;
  department?: string;
  title?: string;
  description?: string;
  notes?: string;
}

async function getCurrentUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// Helper to detect gender from department
function detectGender(department?: string): 'men' | 'women' | null {
  if (!department) return null;
  const normalized = department.toLowerCase().trim();
  if (normalized === 'men' || normalized === 'mens') return 'men';
  if (normalized === 'women' || normalized === 'womens' || normalized === 'ladies') return 'women';
  return null;
}

// Helper to check if keywords match in product data
function keywordsMatch(keywords: string[], productData: ProductMatchData): boolean {
  if (keywords.length === 0) return true; // No keywords = always match
  
  // Build searchable text from all product fields
  const searchText = [
    productData.title,
    productData.description,
    productData.notes,
    productData.garmentType
  ].filter(Boolean).join(' ').toLowerCase();
  
  // Check if ANY keyword matches (OR logic)
  return keywords.some(keyword => 
    searchText.includes(keyword.toLowerCase().trim())
  );
}

export function useDefaultTags() {
  const [tags, setTags] = useState<DefaultTag[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTags = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('default_tags')
      .select('*')
      .order('tag_name', { ascending: true });
    
    if (error) {
      console.error('Error fetching default tags:', error);
      toast.error('Failed to load default tags');
      setLoading(false);
      return;
    }
    
    // Map database response to include new fields with defaults
    const mappedTags: DefaultTag[] = (data || []).map(row => ({
      id: row.id,
      tag_name: row.tag_name,
      assigned_garment_types: row.assigned_garment_types || [],
      gender: (row.gender as GenderType) || 'both',
      keywords: row.keywords || [],
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
    
    setTags(mappedTags);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const createTag = async (
    tagName: string, 
    assignedGarmentTypes: string[] = [],
    gender: GenderType = 'both',
    keywords: string[] = []
  ) => {
    const userId = await getCurrentUserId();
    if (!userId) {
      toast.error('You must be logged in');
      return null;
    }

    const { data, error } = await supabase
      .from('default_tags')
      .insert({ 
        tag_name: tagName.trim(), 
        assigned_garment_types: assignedGarmentTypes,
        gender,
        keywords,
        user_id: userId 
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating default tag:', error);
      toast.error('Failed to create default tag');
      return null;
    }
    
    const newTag: DefaultTag = {
      id: data.id,
      tag_name: data.tag_name,
      assigned_garment_types: data.assigned_garment_types || [],
      gender: (data.gender as GenderType) || 'both',
      keywords: data.keywords || [],
      created_at: data.created_at,
      updated_at: data.updated_at
    };
    
    setTags(prev => [...prev, newTag].sort((a, b) => a.tag_name.localeCompare(b.tag_name)));
    return newTag;
  };

  const updateTag = async (id: string, updates: { 
    tag_name?: string; 
    assigned_garment_types?: string[];
    gender?: GenderType;
    keywords?: string[];
  }) => {
    const { error } = await supabase
      .from('default_tags')
      .update(updates)
      .eq('id', id);
    
    if (error) {
      console.error('Error updating default tag:', error);
      toast.error('Failed to update default tag');
      return false;
    }
    
    setTags(prev => prev.map(t => 
      t.id === id ? { ...t, ...updates } : t
    ).sort((a, b) => a.tag_name.localeCompare(b.tag_name)));
    return true;
  };

  const deleteTag = async (id: string) => {
    const { error } = await supabase
      .from('default_tags')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error deleting default tag:', error);
      toast.error('Failed to delete default tag');
      return false;
    }
    
    setTags(prev => prev.filter(t => t.id !== id));
    return true;
  };

  // Legacy function - get tags only by garment type (backwards compatible)
  const getTagsForGarmentType = useCallback((garmentType: string): string[] => {
    if (!garmentType) return [];
    
    const normalizedGarmentType = garmentType.toLowerCase().trim();
    
    return tags
      .filter(tag => 
        tag.assigned_garment_types.some(gt => 
          gt.toLowerCase().trim() === normalizedGarmentType
        )
      )
      .map(tag => tag.tag_name);
  }, [tags]);

  // New function - get tags matching garment type, gender, AND keywords
  const getMatchingTags = useCallback((productData: ProductMatchData): string[] => {
    const { garmentType, department } = productData;
    
    // Detect gender from department
    const detectedGender = detectGender(department);
    
    return tags
      .filter(tag => {
        // 1. Match garment type (if tag has any assigned)
        if (tag.assigned_garment_types.length > 0) {
          const normalizedGarmentType = (garmentType || '').toLowerCase().trim();
          const garmentMatches = tag.assigned_garment_types.some(gt => 
            gt.toLowerCase().trim() === normalizedGarmentType
          );
          if (!garmentMatches) return false;
        }
        
        // 2. Match gender
        if (tag.gender !== 'both' && detectedGender) {
          if (tag.gender !== detectedGender) return false;
        }
        
        // 3. Match keywords (if any)
        if (!keywordsMatch(tag.keywords, productData)) return false;
        
        return true;
      })
      .map(tag => tag.tag_name);
  }, [tags]);

  return { 
    tags, 
    loading, 
    createTag, 
    updateTag, 
    deleteTag, 
    refetch: fetchTags,
    getTagsForGarmentType,
    getMatchingTags
  };
}
