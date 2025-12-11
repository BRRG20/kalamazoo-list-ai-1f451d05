import { useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { Plus, Images, Layers, Grid3X3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ImageGroupCard } from './ImageGroupCard';
import { UnassignedImagePool } from './UnassignedImagePool';
import type { Product, ProductImage } from '@/types';

export interface ImageGroup {
  productId: string;
  productNumber: number;
  images: string[]; // URLs
  selectedImages: Set<string>;
}

interface ImageGroupManagerProps {
  groups: ImageGroup[];
  unassignedImages: string[];
  onUpdateGroups: (groups: ImageGroup[]) => void;
  onUpdateUnassigned: (images: string[]) => void;
  onCreateNewGroup: (images: string[]) => void;
  onDeleteGroup: (productId: string) => void;
  onDeleteImage: (url: string) => void;
  onSaveGroups: () => void;
  imagesPerProduct: number;
  onRegroupUnassigned?: (imagesPerProduct: number) => void;
}

export function ImageGroupManager({
  groups,
  unassignedImages,
  onUpdateGroups,
  onUpdateUnassigned,
  onCreateNewGroup,
  onDeleteGroup,
  onDeleteImage,
  onSaveGroups,
  imagesPerProduct,
  onRegroupUnassigned,
}: ImageGroupManagerProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<{ type: 'group' | 'unassigned'; groupId?: string } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);
    
    // Determine source
    const sourceGroup = groups.find(g => g.images.includes(active.id as string));
    if (sourceGroup) {
      setActiveSource({ type: 'group', groupId: sourceGroup.productId });
    } else if (unassignedImages.includes(active.id as string)) {
      setActiveSource({ type: 'unassigned' });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || !activeSource) {
      setActiveId(null);
      setActiveSource(null);
      return;
    }

    const activeUrl = active.id as string;
    const overId = over.id as string;

    // Determine destination
    let destGroupId: string | null = null;
    let destIsUnassigned = false;
    let destIsNewGroup = false;

    if (overId === 'unassigned-pool') {
      destIsUnassigned = true;
    } else if (overId === 'new-group-dropzone') {
      destIsNewGroup = true;
    } else {
      // Check if dropped on a group or an image within a group
      const destGroup = groups.find(g => 
        g.productId === overId || g.images.includes(overId)
      );
      if (destGroup) {
        destGroupId = destGroup.productId;
      }
    }

    // Handle movement
    if (activeSource.type === 'unassigned') {
      if (destIsNewGroup) {
        // Create new group from unassigned image
        onUpdateUnassigned(unassignedImages.filter(url => url !== activeUrl));
        onCreateNewGroup([activeUrl]);
      } else if (destGroupId) {
        // Move from unassigned to group
        onUpdateUnassigned(unassignedImages.filter(url => url !== activeUrl));
        const newGroups = groups.map(g => {
          if (g.productId === destGroupId) {
            return { ...g, images: [...g.images, activeUrl] };
          }
          return g;
        });
        onUpdateGroups(newGroups);
      }
    } else if (activeSource.groupId) {
      if (destIsNewGroup) {
        // Move from group to new group
        const newGroups = groups.map(g => {
          if (g.productId === activeSource.groupId) {
            return { 
              ...g, 
              images: g.images.filter(url => url !== activeUrl),
              selectedImages: new Set([...g.selectedImages].filter(url => url !== activeUrl))
            };
          }
          return g;
        });
        onUpdateGroups(newGroups);
        onCreateNewGroup([activeUrl]);
      } else if (destIsUnassigned) {
        // Move from group to unassigned
        const newGroups = groups.map(g => {
          if (g.productId === activeSource.groupId) {
            return { 
              ...g, 
              images: g.images.filter(url => url !== activeUrl),
              selectedImages: new Set([...g.selectedImages].filter(url => url !== activeUrl))
            };
          }
          return g;
        });
        onUpdateGroups(newGroups);
        onUpdateUnassigned([...unassignedImages, activeUrl]);
      } else if (destGroupId && destGroupId !== activeSource.groupId) {
        // Move between groups
        const newGroups = groups.map(g => {
          if (g.productId === activeSource.groupId) {
            return { 
              ...g, 
              images: g.images.filter(url => url !== activeUrl),
              selectedImages: new Set([...g.selectedImages].filter(url => url !== activeUrl))
            };
          }
          if (g.productId === destGroupId) {
            return { ...g, images: [...g.images, activeUrl] };
          }
          return g;
        });
        onUpdateGroups(newGroups);
      } else if (destGroupId === activeSource.groupId) {
        // Reorder within same group
        const group = groups.find(g => g.productId === destGroupId);
        if (group) {
          const oldIndex = group.images.indexOf(activeUrl);
          const newIndex = group.images.indexOf(overId);
          if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
            const newImages = [...group.images];
            newImages.splice(oldIndex, 1);
            newImages.splice(newIndex, 0, activeUrl);
            const newGroups = groups.map(g => 
              g.productId === destGroupId ? { ...g, images: newImages } : g
            );
            onUpdateGroups(newGroups);
          }
        }
      }
    }

    setActiveId(null);
    setActiveSource(null);
  };

  const handleToggleImageSelection = (groupId: string, imageUrl: string) => {
    const newGroups = groups.map(g => {
      if (g.productId === groupId) {
        const newSelected = new Set(g.selectedImages);
        if (newSelected.has(imageUrl)) {
          newSelected.delete(imageUrl);
        } else {
          newSelected.add(imageUrl);
        }
        return { ...g, selectedImages: newSelected };
      }
      return g;
    });
    onUpdateGroups(newGroups);
  };

  const handleSelectAll = (groupId: string) => {
    const newGroups = groups.map(g => {
      if (g.productId === groupId) {
        return { ...g, selectedImages: new Set(g.images) };
      }
      return g;
    });
    onUpdateGroups(newGroups);
  };

  const handleDeselectAll = (groupId: string) => {
    const newGroups = groups.map(g => {
      if (g.productId === groupId) {
        return { ...g, selectedImages: new Set<string>() };
      }
      return g;
    });
    onUpdateGroups(newGroups);
  };

  const handleRemoveSelected = (groupId: string) => {
    const group = groups.find(g => g.productId === groupId);
    if (!group || group.selectedImages.size === 0) return;

    const selectedUrls = [...group.selectedImages];
    const newGroups = groups.map(g => {
      if (g.productId === groupId) {
        return {
          ...g,
          images: g.images.filter(url => !g.selectedImages.has(url)),
          selectedImages: new Set<string>(),
        };
      }
      return g;
    });
    onUpdateGroups(newGroups);
    onUpdateUnassigned([...unassignedImages, ...selectedUrls]);
  };

  const handleMoveSelectedToNext = (groupId: string) => {
    const groupIndex = groups.findIndex(g => g.productId === groupId);
    if (groupIndex === -1 || groupIndex === groups.length - 1) return;
    
    const currentGroup = groups[groupIndex];
    const nextGroup = groups[groupIndex + 1];
    const selectedUrls = [...currentGroup.selectedImages];
    
    if (selectedUrls.length === 0) return;

    const newGroups = groups.map((g, i) => {
      if (i === groupIndex) {
        return {
          ...g,
          images: g.images.filter(url => !g.selectedImages.has(url)),
          selectedImages: new Set<string>(),
        };
      }
      if (i === groupIndex + 1) {
        return { ...g, images: [...g.images, ...selectedUrls] };
      }
      return g;
    });
    onUpdateGroups(newGroups);
  };

  const handleMoveSelectedToPrevious = (groupId: string) => {
    const groupIndex = groups.findIndex(g => g.productId === groupId);
    if (groupIndex <= 0) return;
    
    const currentGroup = groups[groupIndex];
    const selectedUrls = [...currentGroup.selectedImages];
    
    if (selectedUrls.length === 0) return;

    const newGroups = groups.map((g, i) => {
      if (i === groupIndex) {
        return {
          ...g,
          images: g.images.filter(url => !g.selectedImages.has(url)),
          selectedImages: new Set<string>(),
        };
      }
      if (i === groupIndex - 1) {
        return { ...g, images: [...g.images, ...selectedUrls] };
      }
      return g;
    });
    onUpdateGroups(newGroups);
  };

  const handleMoveSelectedToNewGroup = (groupId: string) => {
    const group = groups.find(g => g.productId === groupId);
    if (!group || group.selectedImages.size === 0) return;

    const selectedUrls = [...group.selectedImages];
    const newGroups = groups.map(g => {
      if (g.productId === groupId) {
        return {
          ...g,
          images: g.images.filter(url => !g.selectedImages.has(url)),
          selectedImages: new Set<string>(),
        };
      }
      return g;
    });
    onUpdateGroups(newGroups);
    onCreateNewGroup(selectedUrls);
  };

  const handleReorderWithinGroup = (groupId: string, oldIndex: number, newIndex: number) => {
    const newGroups = groups.map(g => {
      if (g.productId === groupId) {
        const newImages = [...g.images];
        const [removed] = newImages.splice(oldIndex, 1);
        newImages.splice(newIndex, 0, removed);
        return { ...g, images: newImages };
      }
      return g;
    });
    onUpdateGroups(newGroups);
  };

  const handleAddFromUnassigned = (groupId: string, imageUrl: string) => {
    onUpdateUnassigned(unassignedImages.filter(url => url !== imageUrl));
    const newGroups = groups.map(g => {
      if (g.productId === groupId) {
        return { ...g, images: [...g.images, imageUrl] };
      }
      return g;
    });
    onUpdateGroups(newGroups);
  };

  const handleCreateGroupFromUnassigned = (selectedUrls: string[]) => {
    onUpdateUnassigned(unassignedImages.filter(url => !selectedUrls.includes(url)));
    onCreateNewGroup(selectedUrls);
  };

  const handleDeleteImageFromGroup = (groupId: string, imageUrl: string) => {
    const newGroups = groups.map(g => {
      if (g.productId === groupId) {
        return {
          ...g,
          images: g.images.filter(url => url !== imageUrl),
          selectedImages: new Set([...g.selectedImages].filter(url => url !== imageUrl)),
        };
      }
      return g;
    });
    onUpdateGroups(newGroups);
    onDeleteImage(imageUrl);
  };

  const handleDeleteImageFromUnassigned = (imageUrl: string) => {
    onUpdateUnassigned(unassignedImages.filter(url => url !== imageUrl));
    onDeleteImage(imageUrl);
  };

  const handleDeleteSelectedFromGroup = (groupId: string) => {
    const group = groups.find(g => g.productId === groupId);
    if (!group || group.selectedImages.size === 0) return;

    const selectedUrls = [...group.selectedImages];
    const newGroups = groups.map(g => {
      if (g.productId === groupId) {
        return {
          ...g,
          images: g.images.filter(url => !g.selectedImages.has(url)),
          selectedImages: new Set<string>(),
        };
      }
      return g;
    });
    onUpdateGroups(newGroups);
    // Delete each selected image
    selectedUrls.forEach(url => onDeleteImage(url));
  };

  const activeImageUrl = activeId;

  // Drop zone component for creating new groups
  const NewGroupDropZone = () => {
    const { isOver, setNodeRef } = useDroppable({
      id: 'new-group-dropzone',
    });

    return (
      <div
        ref={setNodeRef}
        className={`
          border-2 border-dashed rounded-lg p-6 transition-all
          flex items-center justify-center gap-2
          ${isOver 
            ? 'border-primary bg-primary/10 text-primary' 
            : 'border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/50'
          }
        `}
      >
        <Plus className="w-5 h-5" />
        <span className="text-sm font-medium">
          {isOver ? 'Drop to create new product' : 'Drag image here to create new product'}
        </span>
      </div>
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-4">
        {/* Summary bar */}
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg flex-wrap gap-2">
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5">
              <Images className="w-4 h-4 text-primary" />
              <strong>{groups.length}</strong> product groups
            </span>
            {unassignedImages.length > 0 && (
              <span className="text-amber-600 dark:text-amber-400">
                <strong>{unassignedImages.length}</strong> unassigned images
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Regroup unassigned dropdown */}
            {unassignedImages.length > 0 && onRegroupUnassigned && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Grid3X3 className="w-4 h-4 mr-2" />
                    Auto-group ({unassignedImages.length})
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Images per product</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15].map((num) => (
                    <DropdownMenuItem
                      key={num}
                      onClick={() => onRegroupUnassigned(num)}
                    >
                      {num} images per product
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button size="sm" onClick={onSaveGroups}>
              Confirm Grouping
            </Button>
          </div>
        </div>

        {/* Unassigned Images Pool */}
        {unassignedImages.length > 0 && (
          <UnassignedImagePool
            images={unassignedImages}
            onCreateGroup={handleCreateGroupFromUnassigned}
            onAddToGroup={(url, groupId) => handleAddFromUnassigned(groupId, url)}
            onDeleteImage={handleDeleteImageFromUnassigned}
            groups={groups}
          />
        )}

        {/* Product Groups */}
        <div className="space-y-4">
          {groups.map((group, index) => (
            <ImageGroupCard
              key={group.productId}
              group={group}
              groupIndex={index}
              totalGroups={groups.length}
              onToggleImageSelection={(url) => handleToggleImageSelection(group.productId, url)}
              onSelectAll={() => handleSelectAll(group.productId)}
              onDeselectAll={() => handleDeselectAll(group.productId)}
              onRemoveSelected={() => handleRemoveSelected(group.productId)}
              onDeleteSelected={() => handleDeleteSelectedFromGroup(group.productId)}
              onMoveSelectedToNext={() => handleMoveSelectedToNext(group.productId)}
              onMoveSelectedToPrevious={() => handleMoveSelectedToPrevious(group.productId)}
              onMoveSelectedToNewGroup={() => handleMoveSelectedToNewGroup(group.productId)}
              onDeleteGroup={() => onDeleteGroup(group.productId)}
              onDeleteImage={(url) => handleDeleteImageFromGroup(group.productId, url)}
              onReorder={(oldIndex, newIndex) => handleReorderWithinGroup(group.productId, oldIndex, newIndex)}
              unassignedImages={unassignedImages}
              onAddFromUnassigned={(url) => handleAddFromUnassigned(group.productId, url)}
            />
          ))}
        </div>

        {/* Drop zone to create new group */}
        <NewGroupDropZone />
      </div>

      <DragOverlay>
        {activeImageUrl ? (
          <div className="w-16 h-16 rounded-lg overflow-hidden shadow-lg ring-2 ring-primary">
            <img
              src={activeImageUrl}
              alt="Dragging"
              className="w-full h-full object-cover"
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
