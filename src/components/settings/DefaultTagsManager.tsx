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
      <CardContent className="p-3 space-y-3">
        <div className="space-y-1">
          <Label htmlFor="tag-name" className="text-xs">Tag Name</Label>
          <Input
            id="tag-name"
            value={tagName}
            onChange={(e) => setTagName(e.target.value)}
            placeholder="e.g., Vintage Knitwear"
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Assign to Garment Types</Label>
          
          <div className="flex flex-wrap gap-1">
            {COMMON_GARMENT_TYPES.map(type => (
              <Badge
                key={type}
                variant={selectedTypes.includes(type) ? 'default' : 'outline'}
                className="cursor-pointer transition-colors text-xs py-0 px-2"
                onClick={() => handleToggleType(type)}
              >
                {type}
              </Badge>
            ))}
          </div>

          {selectedTypes.filter(t => !COMMON_GARMENT_TYPES.includes(t)).length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1 border-t">
              {selectedTypes.filter(t => !COMMON_GARMENT_TYPES.includes(t)).map(type => (
                <Badge
                  key={type}
                  variant="default"
                  className="cursor-pointer text-xs py-0 px-2"
                  onClick={() => handleToggleType(type)}
                >
                  {type} ×
                </Badge>
              ))}
            </div>
          )}

          <div className="flex gap-1">
            <Input
              value={customType}
              onChange={(e) => setCustomType(e.target.value)}
              placeholder="Custom type..."
              onKeyDown={(e) => e.key === 'Enter' && handleAddCustomType()}
              className="flex-1 h-7 text-xs"
            />
            <Button variant="outline" size="sm" onClick={handleAddCustomType} className="h-7 text-xs px-2">
              Add
            </Button>
          </div>
        </div>

        <div className="flex gap-1 justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving} className="h-7 text-xs px-2">
            <X className="w-3 h-3 mr-1" />
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 text-xs px-2">
            <Check className="w-3 h-3 mr-1" />
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
      <CardHeader className="p-3 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Tag className="w-4 h-4" />
          Default Tags
        </CardTitle>
        <CardDescription className="text-xs">
          Auto-assign tags to products based on garment type. Tags become Shopify collections.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-3 pt-0 space-y-2">
        {tags.length === 0 && !isAdding && (
          <div className="text-center py-4 text-muted-foreground">
            <Tag className="w-6 h-6 mx-auto mb-1 opacity-50" />
            <p className="text-xs">No default tags yet</p>
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
              <div className="flex items-center justify-between p-2 border rounded bg-card hover:bg-accent/5 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{tag.tag_name}</div>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {tag.assigned_garment_types.length > 0 ? (
                      tag.assigned_garment_types.map(type => (
                        <Badge key={type} variant="secondary" className="text-[10px] py-0 px-1.5">
                          {type}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-[10px] text-muted-foreground">No types assigned</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-0.5 ml-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setEditingId(tag.id)}
                  >
                    <Edit2 className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(tag.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}

        {isAdding ? (
          <TagEditor
            onSave={handleCreate}
            onCancel={() => setIsAdding(false)}
          />
        ) : (
          <Button
            variant="outline"
            className="w-full h-8 text-xs"
            onClick={() => setIsAdding(true)}
          >
            <Plus className="w-3 h-3 mr-1" />
            Add Default Tag
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
