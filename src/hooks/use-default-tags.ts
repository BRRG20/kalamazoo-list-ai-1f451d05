import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface DefaultTag {
  id: string;
  tag_name: string;
  assigned_garment_types: string[];
  created_at: string;
  updated_at: string;
}

async function getCurrentUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
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
    
    setTags(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const createTag = async (tagName: string, assignedGarmentTypes: string[] = []) => {
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
        user_id: userId 
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating default tag:', error);
      toast.error('Failed to create default tag');
      return null;
    }
    
    setTags(prev => [...prev, data].sort((a, b) => a.tag_name.localeCompare(b.tag_name)));
    return data;
  };

  const updateTag = async (id: string, updates: { tag_name?: string; assigned_garment_types?: string[] }) => {
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

  // Get all tags that should be applied for a given garment type
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

  return { 
    tags, 
    loading, 
    createTag, 
    updateTag, 
    deleteTag, 
    refetch: fetchTags,
    getTagsForGarmentType 
  };
}
