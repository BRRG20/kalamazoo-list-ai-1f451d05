import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function HelpPage() {
  return (
    <AppLayout>
      <div className="h-full overflow-y-auto scrollbar-thin">
        <div className="max-w-3xl mx-auto p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Help</h1>
            <p className="text-muted-foreground mt-1">
              Quick guide to using Kalamazoo Lister effectively.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Getting Started</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none text-foreground">
              <ol className="space-y-3 text-sm">
                <li>
                  <strong>Create a Batch</strong> – Click "New" in the Batches sidebar. Name it something memorable like "Dec 10 Knitwear".
                </li>
                <li>
                  <strong>Upload Images</strong> – Click "Upload Images" and select all photos for that batch. You can upload many at once.
                </li>
                <li>
                  <strong>Set Images per Product</strong> – Enter how many images belong to each product (e.g., 9 if you take 9 photos per item).
                </li>
                <li>
                  <strong>Auto-group</strong> – Click "Auto-group" to automatically create products from your uploaded images.
                </li>
                <li>
                  <strong>Generate AI</strong> – Click "Generate AI for All" to fill in titles, descriptions, and tags for all products.
                </li>
                <li>
                  <strong>Review & Edit</strong> – Click "Edit" on any product to review and adjust the AI-generated details.
                </li>
                <li>
                  <strong>Exclude Images</strong> – Use "Exclude Last 2 Images" to keep label/detail photos from being uploaded to Shopify.
                </li>
                <li>
                  <strong>Create in Shopify</strong> – Select products and click "Create in Shopify" to push them to your store.
                </li>
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Voice Input</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                When editing a product, click "Start Voice Input" to dictate details. Speak naturally, like:
              </p>
              <blockquote className="border-l-2 border-primary pl-3 italic text-foreground">
                "Price is 25 pounds. Women's department. True 90s. Condition very good, minor wear on cuffs. Best for size 12 to 14. Tag it for spring edit and knitwear."
              </blockquote>
              <p>
                Click "Apply Voice to Fields" to have AI parse your speech and update the relevant fields.
              </p>
              <p className="text-xs">
                Note: Voice input requires a modern browser (Chrome, Edge, Safari). If not supported, type notes directly.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Shopify Setup</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>To connect Shopify:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Go to your Shopify Admin</li>
                <li>Navigate to Apps → Develop apps</li>
                <li>Create a new app and configure API access</li>
                <li>Enable "write_products" and "write_inventory" permissions</li>
                <li>Copy your Admin API Access Token</li>
                <li>Paste it in Settings along with your store URL</li>
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Etsy Tags & Crosslist</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                This app doesn't connect directly to Etsy. Instead:
              </p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Create products in Shopify using this app</li>
                <li>Import Shopify products into Crosslist</li>
                <li>Use the "Copy Etsy tags" button in Product Detail</li>
                <li>Paste tags into Crosslist's Etsy tag field</li>
              </ol>
              <p>
                This workflow still saves significant time compared to manual listing.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tips for Best Results</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <ul className="space-y-2">
                <li>
                  <strong>Consistent photo order:</strong> Always photograph items in the same order (e.g., front, back, detail, label) so auto-grouping works correctly.
                </li>
                <li>
                  <strong>Clear label photos:</strong> Include clear photos of labels – AI uses these to extract brand, size, and material.
                </li>
                <li>
                  <strong>Review AI output:</strong> Always review AI-generated content before pushing to Shopify. AI is helpful but not perfect.
                </li>
                <li>
                  <strong>Use voice for speed:</strong> Voice input is faster than typing for describing condition, measurements, and styling notes.
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
