import { useState } from 'react';
import { Plus, Package, MoreHorizontal, Trash2, Edit2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Batch } from '@/types';

interface BatchListProps {
  batches: Batch[];
  selectedBatchId: string | null;
  onSelectBatch: (id: string) => void;
  onCreateBatch: (name: string, notes: string) => void;
  onDeleteBatch: (id: string) => void;
  onUpdateBatch: (id: string, name: string, notes: string) => void;
  productCounts: Record<string, number>;
}

export function BatchList({
  batches,
  selectedBatchId,
  onSelectBatch,
  onCreateBatch,
  onDeleteBatch,
  onUpdateBatch,
  productCounts,
}: BatchListProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null);
  const [newBatchName, setNewBatchName] = useState('');
  const [newBatchNotes, setNewBatchNotes] = useState('');

  const handleCreate = () => {
    if (newBatchName.trim()) {
      onCreateBatch(newBatchName.trim(), newBatchNotes.trim());
      setNewBatchName('');
      setNewBatchNotes('');
      setIsCreateOpen(false);
    }
  };

  const handleEdit = () => {
    if (editingBatch && newBatchName.trim()) {
      onUpdateBatch(editingBatch.id, newBatchName.trim(), newBatchNotes.trim());
      setEditingBatch(null);
      setNewBatchName('');
      setNewBatchNotes('');
      setIsEditOpen(false);
    }
  };

  const openEditDialog = (batch: Batch) => {
    setEditingBatch(batch);
    setNewBatchName(batch.name);
    setNewBatchNotes(batch.notes);
    setIsEditOpen(true);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="h-full flex flex-col border-r border-border bg-card">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="font-semibold text-foreground">Batches</h2>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="default">
              <Plus className="w-4 h-4 mr-1" />
              New
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Batch</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Batch Name</Label>
                <Input
                  id="name"
                  placeholder="e.g. Dec 10 Knitwear"
                  value={newBatchName}
                  onChange={(e) => setNewBatchName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Any notes about this batch..."
                  value={newBatchNotes}
                  onChange={(e) => setNewBatchNotes(e.target.value)}
                  rows={3}
                />
              </div>
              <Button onClick={handleCreate} className="w-full">
                Create Batch
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
        {batches.length === 0 ? (
          <div className="text-center py-8 px-4">
            <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No batches yet. Create one to start listing.
            </p>
          </div>
        ) : (
          <ul className="space-y-1">
            {batches.map((batch) => {
              const productCount = productCounts[batch.id] || 0;
              const isSelected = selectedBatchId === batch.id;

              return (
                <li key={batch.id}>
                  <button
                    onClick={() => onSelectBatch(batch.id)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 rounded-md transition-colors group",
                      isSelected
                        ? "bg-primary/10 text-foreground"
                        : "hover:bg-muted text-foreground"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{batch.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDate(batch.created_at)} · {productCount} product{productCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/10 transition-opacity"
                          >
                            <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditDialog(batch)}>
                            <Edit2 className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => onDeleteBatch(batch.id)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Batch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Batch Name</Label>
              <Input
                id="edit-name"
                value={newBatchName}
                onChange={(e) => setNewBatchName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleEdit()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={newBatchNotes}
                onChange={(e) => setNewBatchNotes(e.target.value)}
                rows={3}
              />
            </div>
            <Button onClick={handleEdit} className="w-full">
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
