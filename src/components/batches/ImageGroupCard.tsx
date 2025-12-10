import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronLeft,
  ChevronRight,
  Trash2,
  Plus,
  Check,
  X,
  GripVertical,
  ArrowRightFromLine,
  ImagePlus,
  MoreHorizontal,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { ImageGroup } from './ImageGroupManager';
import { ImagePreviewModal } from './ImagePreviewModal';

interface SortableImageProps {
  url: string;
  isSelected: boolean;
  onToggleSelect: () => void;
  index: number;
  onPreview: () => void;
  onDelete: () => void;
}

function SortableImage({ url, isSelected, onToggleSelect, index, onPreview, onDelete }: SortableImageProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: url });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleImageClick = (e: React.MouseEvent) => {
    // Don't open preview if clicking on checkbox or drag handle area
    const target = e.target as HTMLElement;
    if (target.closest('[data-no-preview]')) return;
    onPreview();
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative group aspect-square rounded-lg overflow-hidden border-2 transition-all cursor-pointer",
        isDragging && "opacity-50 scale-95",
        isSelected ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50"
      )}
      onClick={handleImageClick}
    >
      <img
        src={url}
        alt={`Image ${index + 1}`}
        className="w-full h-full object-cover"
      />
      
      {/* Quick view overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
        <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
      </div>
      
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        data-no-preview
        className="absolute top-1 right-8 p-1 bg-background/80 rounded cursor-grab opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <GripVertical className="w-3 h-3 text-muted-foreground" />
      </div>

      {/* Delete button */}
      <button
        data-no-preview
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute top-1 right-1 p-1 bg-destructive/90 hover:bg-destructive rounded opacity-0 group-hover:opacity-100 transition-opacity"
        title="Delete image"
      >
        <Trash2 className="w-3 h-3 text-destructive-foreground" />
      </button>

      {/* Selection checkbox */}
      <div className="absolute top-1 left-1" data-no-preview onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggleSelect}
          className="bg-background/80 border-2"
        />
      </div>

      {/* Position badge */}
      <div className="absolute bottom-1 left-1 bg-foreground/80 text-background text-xs px-1.5 py-0.5 rounded font-medium">
        {index + 1}
      </div>
    </div>
  );
}

interface ImageGroupCardProps {
  group: ImageGroup;
  groupIndex: number;
  totalGroups: number;
  onToggleImageSelection: (url: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onRemoveSelected: () => void;
  onDeleteSelected: () => void;
  onMoveSelectedToNext: () => void;
  onMoveSelectedToPrevious: () => void;
  onMoveSelectedToNewGroup: () => void;
  onDeleteGroup: () => void;
  onDeleteImage: (url: string) => void;
  onReorder: (oldIndex: number, newIndex: number) => void;
  unassignedImages: string[];
  onAddFromUnassigned: (url: string) => void;
}

export function ImageGroupCard({
  group,
  groupIndex,
  totalGroups,
  onToggleImageSelection,
  onSelectAll,
  onDeselectAll,
  onRemoveSelected,
  onDeleteSelected,
  onMoveSelectedToNext,
  onMoveSelectedToPrevious,
  onMoveSelectedToNewGroup,
  onDeleteGroup,
  onDeleteImage,
  onReorder,
  unassignedImages,
  onAddFromUnassigned,
}: ImageGroupCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showAddPopover, setShowAddPopover] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const hasSelectedImages = group.selectedImages.size > 0;
  const isFirstGroup = groupIndex === 0;
  const isLastGroup = groupIndex === totalGroups - 1;

  return (
    <>
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-3 bg-muted/30 border-b border-border">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-foreground">
              Product {String(group.productNumber).padStart(3, '0')}
            </span>
            <span className="text-sm text-muted-foreground">
              Images ({group.images.length})
            </span>
            {hasSelectedImages && (
              <span className="text-sm text-primary font-medium">
                {group.selectedImages.size} selected
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Quick actions when images are selected */}
            {hasSelectedImages && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onMoveSelectedToPrevious}
                  disabled={isFirstGroup}
                  title="Move to previous group"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onMoveSelectedToNext}
                  disabled={isLastGroup}
                  title="Move to next group"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRemoveSelected}
                  className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950"
                  title="Remove to unassigned"
                >
                  <ArrowRightFromLine className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onDeleteSelected}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  title="Delete selected images"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </>
            )}

            {/* Add image from unassigned */}
            {unassignedImages.length > 0 && (
              <Popover open={showAddPopover} onOpenChange={setShowAddPopover}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" title="Add image from unassigned">
                    <ImagePlus className="w-4 h-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2 bg-popover" align="end">
                  <p className="text-xs text-muted-foreground mb-2">Click an image to add:</p>
                  <div className="grid grid-cols-4 gap-1 max-h-32 overflow-y-auto">
                    {unassignedImages.map((url, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          onAddFromUnassigned(url);
                          setShowAddPopover(false);
                        }}
                        className="aspect-square rounded overflow-hidden border border-border hover:border-primary transition-colors"
                      >
                        <img src={url} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}

            {/* More actions dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover">
                <DropdownMenuItem onSelect={onSelectAll}>
                  <Check className="w-4 h-4 mr-2" />
                  Select all images
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onDeselectAll} disabled={!hasSelectedImages}>
                  <X className="w-4 h-4 mr-2" />
                  Deselect all
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onSelect={onMoveSelectedToNewGroup}
                  disabled={!hasSelectedImages}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Move selected to new group
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => setShowDeleteDialog(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete entire group
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Images grid */}
        <div className="p-3">
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
            {group.images.map((url, index) => (
              <SortableImage
                key={url}
                url={url}
                index={index}
                isSelected={group.selectedImages.has(url)}
                onToggleSelect={() => onToggleImageSelection(url)}
                onPreview={() => setPreviewIndex(index)}
                onDelete={() => onDeleteImage(url)}
              />
            ))}
          </div>

          {group.images.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">No images in this group</p>
              <p className="text-xs mt-1">Drag images here or use the add button</p>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product Group?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete Product {String(group.productNumber).padStart(3, '0')} and move all {group.images.length} images to the unassigned pool. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDeleteGroup}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Image preview modal */}
      <ImagePreviewModal
        images={group.images}
        initialIndex={previewIndex ?? 0}
        open={previewIndex !== null}
        onClose={() => setPreviewIndex(null)}
      />
    </>
  );
}
