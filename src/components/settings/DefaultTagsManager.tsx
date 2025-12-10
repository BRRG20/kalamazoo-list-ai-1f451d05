import { useState } from 'react';
import { Plus, Trash2, Edit2, Check, X, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDefaultTags, DefaultTag } from '@/hooks/use-default-tags';
import { toast } from 'sonner';

// Common garment types for quick selection
const COMMON_GARMENT_TYPES = [
  'T-Shirt', 'Shirt', 'Blouse', 'Jumper', 'Sweater', 'Hoodie', 'Cardigan',
  'Jacket', 'Coat', 'Blazer', 'Vest', 'Dress', 'Skirt', 'Trousers', 'Jeans',
  'Shorts', 'Polo', 'Sweatshirt', 'Fleece', 'Windbreaker', 'Parka'
];

interface TagEditorProps {
  tag?: DefaultTag;
  onSave: (tagName: string, garmentTypes: string[]) => Promise<void>;
  onCancel: () => void;
}

function TagEditor({ tag, onSave, onCancel }: TagEditorProps) {
  const [tagName, setTagName] = useState(tag?.tag_name || '');
  const [selectedTypes, setSelectedTypes] = useState<string[]>(tag?.assigned_garment_types || []);
  const [customType, setCustomType] = useState('');
  const [saving, setSaving] = useState(false);

  const handleToggleType = (type: string) => {
    setSelectedTypes(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  const handleAddCustomType = () => {
    const trimmed = customType.trim();
    if (trimmed && !selectedTypes.includes(trimmed)) {
      setSelectedTypes(prev => [...prev, trimmed]);
      setCustomType('');
    }
  };

  const handleSave = async () => {
    if (!tagName.trim()) {
      toast.error('Tag name is required');
      return;
    }
    setSaving(true);
    await onSave(tagName.trim(), selectedTypes);
    setSaving(false);
  };

  return (
    <Card className="border-primary/20">
      <CardContent className="p-4 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="tag-name">Tag Name</Label>
          <Input
            id="tag-name"
            value={tagName}
            onChange={(e) => setTagName(e.target.value)}
            placeholder="e.g., Vintage Knitwear, Summer Collection"
          />
        </div>

        <div className="space-y-2">
          <Label>Assign to Garment Types</Label>
          <p className="text-xs text-muted-foreground">
            This tag will be automatically added to products with these garment types
          </p>
          
          <div className="flex flex-wrap gap-2 mt-2">
            {COMMON_GARMENT_TYPES.map(type => (
              <Badge
                key={type}
                variant={selectedTypes.includes(type) ? 'default' : 'outline'}
                className="cursor-pointer transition-colors"
                onClick={() => handleToggleType(type)}
              >
                {type}
              </Badge>
            ))}
          </div>

          {/* Show custom types that aren't in the common list */}
          {selectedTypes.filter(t => !COMMON_GARMENT_TYPES.includes(t)).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t">
              {selectedTypes.filter(t => !COMMON_GARMENT_TYPES.includes(t)).map(type => (
                <Badge
                  key={type}
                  variant="default"
                  className="cursor-pointer"
                  onClick={() => handleToggleType(type)}
                >
                  {type} ×
                </Badge>
              ))}
            </div>
          )}

          <div className="flex gap-2 mt-2">
            <Input
              value={customType}
              onChange={(e) => setCustomType(e.target.value)}
              placeholder="Add custom type..."
              onKeyDown={(e) => e.key === 'Enter' && handleAddCustomType()}
              className="flex-1"
            />
            <Button variant="outline" size="sm" onClick={handleAddCustomType}>
              Add
            </Button>
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            <X className="w-4 h-4 mr-1" />
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Check className="w-4 h-4 mr-1" />
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DefaultTagsManager() {
  const { tags, loading, createTag, updateTag, deleteTag } = useDefaultTags();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleCreate = async (tagName: string, garmentTypes: string[]) => {
    const result = await createTag(tagName, garmentTypes);
    if (result) {
      setIsAdding(false);
      toast.success('Default tag created');
    }
  };

  const handleUpdate = async (id: string, tagName: string, garmentTypes: string[]) => {
    const success = await updateTag(id, { tag_name: tagName, assigned_garment_types: garmentTypes });
    if (success) {
      setEditingId(null);
      toast.success('Default tag updated');
    }
  };

  const handleDelete = async (id: string) => {
    const success = await deleteTag(id);
    if (success) {
      toast.success('Default tag deleted');
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/3"></div>
            <div className="h-10 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="p-4 md:p-6">
        <CardTitle className="flex items-center gap-2 text-base md:text-lg">
          <Tag className="w-5 h-5" />
          Default Tags
        </CardTitle>
        <CardDescription className="text-sm">
          Define reusable tags that are automatically assigned to products based on garment type.
          These tags become Shopify collections when products are created.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0 md:pt-0 space-y-4">
        {/* Existing Tags */}
        {tags.length === 0 && !isAdding && (
          <div className="text-center py-6 text-muted-foreground">
            <Tag className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No default tags yet</p>
            <p className="text-xs mt-1">Add tags to automatically categorize your products</p>
          </div>
        )}

        {tags.map(tag => (
          <div key={tag.id}>
            {editingId === tag.id ? (
              <TagEditor
                tag={tag}
                onSave={(name, types) => handleUpdate(tag.id, name, types)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div className="flex items-start justify-between p-3 border rounded-lg bg-card hover:bg-accent/5 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{tag.tag_name}</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {tag.assigned_garment_types.length > 0 ? (
                      tag.assigned_garment_types.map(type => (
                        <Badge key={type} variant="secondary" className="text-xs">
                          {type}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">No garment types assigned</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 ml-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setEditingId(tag.id)}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(tag.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Add New Tag */}
        {isAdding ? (
          <TagEditor
            onSave={handleCreate}
            onCancel={() => setIsAdding(false)}
          />
        ) : (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setIsAdding(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Default Tag
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
