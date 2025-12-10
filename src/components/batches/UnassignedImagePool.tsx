import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { AlertTriangle, Plus, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { ImageGroup } from './ImageGroupManager';

interface UnassignedImagePoolProps {
  images: string[];
  onCreateGroup: (selectedUrls: string[]) => void;
  onAddToGroup: (url: string, groupId: string) => void;
  groups: ImageGroup[];
}

export function UnassignedImagePool({
  images,
  onCreateGroup,
  onAddToGroup,
  groups,
}: UnassignedImagePoolProps) {
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [targetGroupId, setTargetGroupId] = useState<string>('');

  const { setNodeRef, isOver } = useDroppable({
    id: 'unassigned-pool',
  });

  const toggleImageSelection = (url: string) => {
    setSelectedImages(prev => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else {
        next.add(url);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedImages(new Set(images));
  };

  const deselectAll = () => {
    setSelectedImages(new Set());
  };

  const handleCreateGroup = () => {
    if (selectedImages.size === 0) return;
    onCreateGroup([...selectedImages]);
    setSelectedImages(new Set());
  };

  const handleAddToExistingGroup = () => {
    if (selectedImages.size === 0 || !targetGroupId) return;
    [...selectedImages].forEach(url => {
      onAddToGroup(url, targetGroupId);
    });
    setSelectedImages(new Set());
    setTargetGroupId('');
  };

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "border-2 border-dashed rounded-lg p-4 transition-colors",
        isOver 
          ? "border-primary bg-primary/5" 
          : "border-amber-400 bg-amber-50/50 dark:bg-amber-950/20"
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <span className="font-medium text-foreground">
            Unassigned Images ({images.length})
          </span>
          {selectedImages.size > 0 && (
            <span className="text-sm text-primary font-medium">
              {selectedImages.size} selected
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={selectAll}>
            <Check className="w-4 h-4 mr-1" />
            All
          </Button>
          <Button variant="ghost" size="sm" onClick={deselectAll} disabled={selectedImages.size === 0}>
            <X className="w-4 h-4 mr-1" />
            None
          </Button>
        </div>
      </div>

      {/* Images grid */}
      <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2 mb-4">
        {images.map((url, index) => (
          <div
            key={index}
            className={cn(
              "relative group aspect-square rounded-lg overflow-hidden border-2 cursor-pointer transition-all",
              selectedImages.has(url) 
                ? "border-primary ring-2 ring-primary/30" 
                : "border-border hover:border-primary/50"
            )}
            onClick={() => toggleImageSelection(url)}
          >
            <img
              src={url}
              alt={`Unassigned ${index + 1}`}
              className="w-full h-full object-cover"
            />
            <div className="absolute top-1 left-1">
              <Checkbox
                checked={selectedImages.has(url)}
                onCheckedChange={() => toggleImageSelection(url)}
                className="bg-background/80 border-2"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      {selectedImages.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-border">
          <Button size="sm" onClick={handleCreateGroup}>
            <Plus className="w-4 h-4 mr-1" />
            Create New Product ({selectedImages.size} images)
          </Button>

          {groups.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">or add to:</span>
              <Select value={targetGroupId} onValueChange={setTargetGroupId}>
                <SelectTrigger className="w-40 h-8 bg-background">
                  <SelectValue placeholder="Select group" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  {groups.map((group) => (
                    <SelectItem key={group.productId} value={group.productId}>
                      Product {String(group.productNumber).padStart(3, '0')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={handleAddToExistingGroup}
                disabled={!targetGroupId}
              >
                Add
              </Button>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-3">
        Drag images here to unassign them, or select images and create new products.
      </p>
    </div>
  );
}
