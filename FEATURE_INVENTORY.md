# Kalamazoo Lister - Feature Inventory & Regression Checklist

**Last Updated:** 2024  
**Purpose:** Comprehensive inventory of all features, their implementation locations, and regression test procedures.

---

## Table of Contents

1. [Feature Inventory](#feature-inventory)
2. [Regression Checklist](#regression-checklist)
3. [Last Known Good (LKG) Definition](#last-known-good-lkg-definition)
4. [Incomplete/Unused Features](#incompleteunused-features)

---

## Feature Inventory

### 1. Batches / Batch Switching

**UI Location:**
- Main page: `/` (BatchesPage)
- Batch list sidebar: `src/components/batches/BatchList.tsx`
- Batch detail view: `src/components/batches/BatchDetail.tsx`

**Primary Files:**
- `src/pages/BatchesPage.tsx` - Main batch management page
- `src/components/batches/BatchList.tsx` - Batch selection sidebar
- `src/components/batches/BatchDetail.tsx` - Batch detail view
- `src/hooks/use-database.ts` - Batch CRUD operations (`useBatches`)

**Backend/API:**
- Supabase `batches` table (PostgreSQL)
- No edge functions (direct database operations)

**Success Signal:**
- Batch list loads in sidebar
- Clicking a batch switches view to `BatchDetail`
- Products/images load for selected batch
- Batch name/description editable
- Create/delete batch works
- No UI breaks when switching batches

---

### 2. Camera Batch Capture

**UI Location:**
- Batch detail toolbar: "Batch Capture" button
- Quick Product Shots: "Quick Product (4)" button

**Primary Files:**
- `src/components/camera/QuickProductShotsButton.tsx` - Batch capture & quick product buttons
- `src/components/camera/MobileCaptureInterface.tsx` - Camera capture UI

**Backend/API:**
- No edge functions (client-side camera API)
- Images uploaded via `useImageUpload` hook to Supabase Storage

**Success Signal:**
- Camera opens on mobile/desktop
- Can capture multiple photos
- Photos upload to batch
- Images appear in unassigned pool or assigned to product
- Condition notes can be added per image

---

### 3. Image Upload + Image Expand (9 Shots)

**UI Location:**
- Batch detail: Upload button in toolbar
- Product detail: Image gallery with expand button
- Batch detail: "Expand Images" button for selected products

**Primary Files:**
- `src/components/batches/BatchDetail.tsx` - Upload & expand UI
- `src/components/products/ImageGallery.tsx` - Image gallery with expand
- `src/hooks/use-image-expansion.ts` - Image expansion logic
- `src/components/batches/ExpandModeDialog.tsx` - Expand mode selection

**Backend/API:**
- Edge Function: `supabase/functions/expand-product-images/index.ts`
- Endpoint: `/functions/v1/expand-product-images`
- Supabase Storage: `product-images` bucket

**Success Signal:**
- Upload button accepts files (drag-drop or click)
- Images upload with progress indicator
- Expand button generates additional images (up to 9 total)
- Generated images appear in product gallery
- Expand works for single product or batch selection
- Images maintain quality and correct positioning

---

### 4. Generate AI (Single Product, Edit Panel, Bulk Selected, Whole Batch)

**UI Location:**
- Product card: "Generate AI" button (sparkles icon)
- Product detail panel: "Generate" button in header
- Batch detail: "Generate AI (N)" button with batch size dropdown
- Batch detail: Bulk selection → Generate AI

**Primary Files:**
- `src/components/batches/ProductCard.tsx` - Product card Generate button
- `src/components/products/ProductDetailPanel.tsx` - Edit panel Generate button
- `src/components/batches/BatchDetail.tsx` - Bulk/batch Generate buttons
- `src/hooks/use-ai-generation.ts` - AI generation logic
- `src/pages/BatchesPage.tsx` - Generation orchestration

**Backend/API:**
- Edge Function: `supabase/functions/generate-listing/index.ts`
- Endpoint: `/functions/v1/generate-listing`
- AI Provider: Lovable AI Gateway → Google Gemini 2.5 Flash

**Success Signal:**
- Button clickable (not disabled when images exist)
- Loading spinner shows during generation
- Product fields populate: title, description_main, description_style_a, description_style_b, shopify_tags, etsy_tags, collections_tags
- Title max 80 chars, no punctuation
- Works for single product, edit panel, bulk selected, and whole batch
- Progress indicator for batch operations
- Undo button appears after generation

---

### 5. Parsing (AI Parse, Voice Parse, OCR/Vision Parse)

#### 5a. Voice Parse

**UI Location:**
- Product detail panel: Voice recording button (microphone icon)
- "Start Recording" → Speak → "Stop Recording"

**Primary Files:**
- `src/components/products/ProductDetailPanel.tsx` - Voice recording UI & handler
- `supabase/functions/parse-voice/index.ts` - Voice parsing edge function

**Backend/API:**
- Edge Function: `supabase/functions/parse-voice/index.ts`
- Endpoint: `/functions/v1/parse-voice`
- AI Provider: Lovable AI Gateway → Google Gemini 2.5 Flash

**Success Signal:**
- Start Recording button activates microphone
- Speech recognition captures transcript
- Stop Recording automatically triggers parse
- Parsed fields auto-populate: brand, garment_type, department, era, size_label, condition, colour_main, colour_secondary, pattern, fit, made_in, notes, etc.
- After facts applied, `generate-listing` runs to populate marketing fields (title, tags, descriptions)
- Spinner stops after completion
- No "Apply to fields" button required (auto-apply)

#### 5b. OCR/Vision Parse (Analyze Images)

**UI Location:**
- Product detail panel: "Analyze" button (camera icon) in header
- Triggered after image upload or manually

**Primary Files:**
- `src/components/products/ProductDetailPanel.tsx` - Analyze button & handler
- `supabase/functions/analyze-images/index.ts` - Image analysis edge function

**Backend/API:**
- Edge Function: `supabase/functions/analyze-images/index.ts`
- Endpoint: `/functions/v1/analyze-images`
- AI Provider: Lovable AI Gateway → Google Gemini 2.5 Flash (vision model)

**Success Signal:**
- Analyze button clickable when images exist
- Analyzes up to 4 images
- Extracts: brand, garment_type, department, era, size_label, material, made_in, colour_main, colour_secondary, pattern, condition, fit, style, pop_culture, visual_style
- Fields auto-populate in form
- After facts applied, `generate-listing` runs to populate marketing fields
- Spinner stops after completion

---

### 6. Background Remover (Including Inside Hanger)

**UI Location:**
- Product detail panel: Image gallery → Individual image → "Remove Background" button
- Background removal options: second pass, shadow type (none/light/medium/harsh)

**Primary Files:**
- `src/components/products/ImageGallery.tsx` - Remove background button
- `src/hooks/use-background-removal.ts` - Background removal logic
- `supabase/functions/remove-background/index.ts` - Background removal edge function

**Backend/API:**
- Edge Function: `supabase/functions/remove-background/index.ts`
- Endpoint: `/functions/v1/remove-background`
- AI Provider: Lovable AI Gateway → Background removal service

**Success Signal:**
- Remove Background button appears on each image
- Options dialog: second pass toggle, shadow type selector
- Processing shows progress indicator
- Background removed (white/transparent)
- Handles inside hanger removal correctly
- Processed image replaces original
- Undo button appears after processing

---

### 7. Model Generation + Ghost Mannequin

#### 7a. Model Try-On (AI Model Generation)

**UI Location:**
- Product detail panel: Image gallery → Individual image → "Try On Model" button
- Model selection dialog: 12 models (Alex, Marcus, James, Theo, Ryan, Darnell, Sophie, Zoe, Lily, Mei, Nina, Elena)
- Options: Pose type, Fit style, Outfit style

**Primary Files:**
- `src/components/products/ImageGallery.tsx` - Try On Model button
- `src/components/model-tryon/ModelTryOnDialog.tsx` - Model selection dialog
- `src/hooks/use-model-tryon.ts` - Model try-on logic
- `supabase/functions/model-tryon/index.ts` - Model try-on edge function

**Backend/API:**
- Edge Function: `supabase/functions/model-tryon/index.ts`
- Endpoint: `/functions/v1/model-tryon`
- AI Provider: Lovable AI Gateway → Google Gemini 2.5 Flash Image Preview
- Reference images: `public/models/*-reference.*` (12 model reference images)

**Success Signal:**
- Try On Model button opens dialog
- 12 models selectable (6 male, 6 female)
- Pose options: Front Neutral, 3/4 Angle, Relaxed, Arms Bent, Close-Up Detail, Movement
- Fit styles: Regular, Oversized, Tucked
- Outfit styles: Stylish Casual, Streetwear, Vintage, Hipster, Cool, Vibrant, Chic, Eastern Fusion
- Generated image shows garment on selected model
- Image added to product gallery with "AI Model" badge
- Undo button appears after generation

#### 7b. Ghost Mannequin

**UI Location:**
- Product detail panel: Image gallery → Individual image → "Ghost Mannequin" button (via background removal options)

**Primary Files:**
- `src/hooks/use-background-removal.ts` - Ghost mannequin logic
- `supabase/functions/ghost-mannequin/index.ts` - Ghost mannequin edge function

**Backend/API:**
- Edge Function: `supabase/functions/ghost-mannequin/index.ts`
- Endpoint: `/functions/v1/ghost-mannequin`
- AI Provider: Lovable AI Gateway → Ghost mannequin service

**Success Signal:**
- Ghost Mannequin option available in background removal
- Removes mannequin/hanger, keeps garment shape
- Creates floating garment effect
- Processed image replaces original
- Undo button appears after processing

---

### 8. Export/Upload to Shopify

**UI Location:**
- Product detail panel: "Create in Shopify" button
- Batch detail: Bulk selection → "Create in Shopify"
- Product card: Shopify status badge

**Primary Files:**
- `src/components/products/ProductDetailPanel.tsx` - Create in Shopify button
- `src/components/batches/BatchDetail.tsx` - Bulk Shopify creation
- `src/components/products/ShopifyStatusSection.tsx` - Shopify status display
- `supabase/functions/create-shopify-product/index.ts` - Shopify creation edge function

**Backend/API:**
- Edge Function: `supabase/functions/create-shopify-product/index.ts`
- Endpoint: `/functions/v1/create-shopify-product`
- External API: Shopify Admin API (`/admin/api/2024-01/products.json`)

**Success Signal:**
- Create in Shopify button clickable when Shopify configured
- Product created in Shopify store
- Images uploaded to Shopify (with retry logic)
- `shopify_product_id` stored in database
- Status badge shows "Uploaded" or "Pending"
- Success dialog shows Shopify product URL
- Bulk creation works for selected products

---

### 9. Download ZIP / High-Quality Download

**UI Location:**
- Product detail panel: Image gallery → "Download All" button
- Individual image: "Download" button

**Primary Files:**
- `src/components/products/ImageGallery.tsx` - Download buttons
- `src/lib/image-download.ts` - Download logic (single & ZIP)

**Backend/API:**
- No edge functions (client-side download)
- Fetches images from Supabase Storage URLs

**Success Signal:**
- Download button downloads single image at full quality
- Download All creates ZIP file with all images
- Images downloaded at original quality (no compression)
- ZIP file named appropriately (product SKU or batch name)
- Progress indicator during ZIP creation

---

### 10. Hide/Unhide Images and Image Management

**UI Location:**
- Product card: "Hide" / "Unhide" button (eye icon)
- Batch detail: Bulk selection → "Hide Selected"
- Batch detail: "Show Hidden" toggle
- Image gallery: Delete image button

**Primary Files:**
- `src/components/batches/ProductCard.tsx` - Hide/unhide button
- `src/components/batches/BatchDetail.tsx` - Bulk hide & hidden products panel
- `src/components/products/ImageGallery.tsx` - Image delete
- `src/components/batches/HiddenProductsPanel.tsx` - Hidden products list
- `src/hooks/use-database.ts` - Hide/unhide operations

**Backend/API:**
- Supabase `products` table: `is_hidden` column
- Supabase `images` table: `deleted_at` column (soft delete)

**Success Signal:**
- Hide button sets `is_hidden = true`
- Hidden products filtered from main view (unless "Show Hidden" enabled)
- Unhide button restores product
- Hidden products panel shows all hidden products
- Delete image moves to trash (soft delete)
- Deleted images panel shows trashed images
- Recover image restores from trash
- Permanent delete removes from database

---

## Regression Checklist

### 1. Batches / Batch Switching

**Test:**
1. **Precondition:** Multiple batches exist
2. **Action:** Click different batches in sidebar
3. **Expected:**
   - Batch detail view loads
   - Products load for selected batch
   - Images load for products
   - All buttons remain clickable
   - No UI freezes or errors
   - Generate AI button works after switching

---

### 2. Camera Batch Capture

**Test:**
1. **Precondition:** Batch selected, camera permissions granted
2. **Action:** Click "Batch Capture" → Take 3 photos → Add condition notes → Complete
3. **Expected:**
   - Photos captured
   - Images upload to batch
   - Images appear in unassigned pool or assigned product
   - Condition notes saved

**Test (Quick Product):**
1. **Precondition:** Batch selected
2. **Action:** Click "Quick Product (4)" → Capture Front, Back, Label, Detail → Complete
3. **Expected:**
   - 4 photos captured
   - Images assigned to new product
   - AI expansion triggered (generates up to 8 total images)

---

### 3. Image Upload + Expand

**Test (Upload):**
1. **Precondition:** Batch selected
2. **Action:** Click "Upload" → Select 5 image files → Upload
3. **Expected:**
   - Upload progress shows
   - Images appear in unassigned pool
   - Images can be assigned to products

**Test (Expand Single):**
1. **Precondition:** Product has 2-3 images
2. **Action:** Open product → Click "Expand Images" → Select mode → Confirm
3. **Expected:**
   - Expansion progress shows
   - Additional images generated (up to 9 total)
   - Generated images appear in gallery
   - Images maintain quality

**Test (Expand Batch):**
1. **Precondition:** Multiple products selected (each has 2+ images)
2. **Action:** Select products → Click "Expand Images" → Select mode → Confirm
3. **Expected:**
   - Batch expansion progress shows
   - All selected products expanded
   - No errors or timeouts

---

### 4. Generate AI

**Test (Single Product - Card):**
1. **Precondition:** Product has >= 1 image
2. **Action:** Click "Generate AI" button on product card
3. **Expected:**
   - Button shows loading spinner
   - Network request to `/functions/v1/generate-listing`
   - Product fields populate: title (max 80 chars, no punctuation), description_main, description_style_a, description_style_b, shopify_tags, etsy_tags, collections_tags
   - Undo button appears
   - Console log: `[GENAI] CLICK ProductCard`

**Test (Edit Panel):**
1. **Precondition:** Product open in edit panel, has >= 1 image
2. **Action:** Click "Generate" button in header
3. **Expected:**
   - Button shows loading spinner
   - Network request to `/functions/v1/generate-listing`
   - Fields populate in form
   - Console log: `[GENAI] CLICK DetailPanel`

**Test (Bulk Selected):**
1. **Precondition:** 3 products selected, each has >= 1 image
2. **Action:** Select products → Click "Generate AI (3)" button
3. **Expected:**
   - Batch progress shows (0/3, 1/3, 2/3, 3/3)
   - All products get AI-generated fields
   - No errors or timeouts

**Test (Whole Batch):**
1. **Precondition:** Batch has 10 unprocessed products (each has >= 1 image)
2. **Action:** Click "Generate AI (10)" button
3. **Expected:**
   - Batch progress shows
   - All products processed
   - Unprocessed count decreases
   - No errors or timeouts

**Test (Button Not Disabled When 0 Images):**
1. **Precondition:** Product has 0 images
2. **Action:** Click "Generate AI" button (should be clickable, shows "(0)")
3. **Expected:**
   - Button clickable (not disabled)
   - Toast: "Add at least 1 image before generating AI"
   - No network request

---

### 5. Parsing

#### 5a. Voice Parse

**Test:**
1. **Precondition:** Product open in edit panel
2. **Action:** Click "Start Recording" → Speak: "Ralph Lauren wool sweater size medium blue navy 22 inches pit to pit condition very good made in USA" → Click "Stop Recording"
3. **Expected:**
   - Recording indicator shows
   - Transcript captured
   - Stop Recording automatically triggers parse
   - Network request to `/functions/v1/parse-voice`
   - Fields populate: brand="Ralph Lauren", garment_type="Sweater", material="Wool", size_label="Medium", colour_main="Blue", colour_secondary="Navy", pit_to_pit="22 inches", condition="Very good", made_in="USA"
   - After facts applied, `generate-listing` runs
   - Marketing fields populate: title, tags, descriptions
   - Spinner stops (no infinite "Parsing...")
   - Console logs show transcript, parse response, applied fields

**Test (No Images):**
1. **Precondition:** Product has 0 images
2. **Action:** Voice parse → Stop Recording
3. **Expected:**
   - Parse still works (extracts facts)
   - `generate-listing` may skip or show warning
   - Spinner stops

#### 5b. OCR/Vision Parse

**Test:**
1. **Precondition:** Product has 2-4 images (including label/tag images)
2. **Action:** Click "Analyze" button
3. **Expected:**
   - Button shows loading spinner
   - Network request to `/functions/v1/analyze-images`
   - Fields populate: brand, garment_type, department, era, size_label, material, made_in, colour_main, colour_secondary, pattern, condition, fit
   - After facts applied, `generate-listing` runs
   - Marketing fields populate
   - Spinner stops

---

### 6. Background Remover

**Test (Standard):**
1. **Precondition:** Product has image with background
2. **Action:** Open image → Click "Remove Background" → Select options (second pass: off, shadow: light) → Confirm
3. **Expected:**
   - Processing progress shows
   - Network request to `/functions/v1/remove-background`
   - Background removed (white/transparent)
   - Processed image replaces original
   - Undo button appears

**Test (Inside Hanger):**
1. **Precondition:** Product has image with garment on hanger (inside view)
2. **Action:** Remove Background with second pass enabled
3. **Expected:**
   - Hanger removed correctly
   - Garment shape preserved
   - No artifacts or errors

---

### 7. Model Generation + Ghost Mannequin

#### 7a. Model Try-On

**Test:**
1. **Precondition:** Product has garment image
2. **Action:** Open image → Click "Try On Model" → Select model (e.g., Darnell) → Select pose (Front Neutral) → Select fit (Regular) → Confirm
3. **Expected:**
   - Dialog opens with 12 models
   - Model selection works
   - Processing progress shows
   - Network request to `/functions/v1/model-tryon`
   - Generated image shows garment on selected model
   - Image added to gallery with "AI Model" badge
   - Undo button appears

**Test (Model Consistency):**
1. **Precondition:** Product has garment image
2. **Action:** Generate 5 images with same model (Darnell), different poses
3. **Expected:**
   - All 5 images show same person (consistent identity)
   - Face/body matches Darnell reference
   - Age range 30-35

#### 7b. Ghost Mannequin

**Test:**
1. **Precondition:** Product has image with mannequin/hanger
2. **Action:** Remove Background → Enable Ghost Mannequin option
3. **Expected:**
   - Mannequin/hanger removed
   - Garment shape preserved
   - Floating garment effect created
   - Processed image replaces original

---

### 8. Export/Upload to Shopify

**Test (Single Product):**
1. **Precondition:** Product has title, description, images, Shopify configured
2. **Action:** Click "Create in Shopify" button
3. **Expected:**
   - Button shows loading spinner
   - Network request to `/functions/v1/create-shopify-product`
   - Product created in Shopify
   - Images uploaded to Shopify
   - `shopify_product_id` stored in database
   - Status badge shows "Uploaded"
   - Success dialog shows Shopify URL

**Test (Bulk):**
1. **Precondition:** 3 products selected, all have required fields
2. **Action:** Select products → Click "Create in Shopify"
3. **Expected:**
   - All products created in Shopify
   - Progress indicator shows
   - All status badges update
   - No errors or timeouts

---

### 9. Download ZIP / High-Quality Download

**Test (Single Image):**
1. **Precondition:** Product has images
2. **Action:** Click "Download" on individual image
3. **Expected:**
   - Image downloads at full quality
   - Filename correct
   - No compression artifacts

**Test (ZIP):**
1. **Precondition:** Product has 5 images
2. **Action:** Click "Download All" button
3. **Expected:**
   - ZIP file downloads
   - All 5 images included
   - Images at full quality
   - ZIP filename includes product SKU

---

### 10. Hide/Unhide Images and Image Management

**Test (Hide Product):**
1. **Precondition:** Product visible in batch
2. **Action:** Click "Hide" button on product card
3. **Expected:**
   - Product disappears from main view
   - `is_hidden = true` in database
   - Hidden products panel shows product

**Test (Unhide):**
1. **Precondition:** Product is hidden
2. **Action:** Open hidden products panel → Click "Unhide"
3. **Expected:**
   - Product appears in main view
   - `is_hidden = false` in database

**Test (Delete Image):**
1. **Precondition:** Product has 3 images
2. **Action:** Click "Delete" on image
3. **Expected:**
   - Image moves to trash (soft delete)
   - `deleted_at` set in database
   - Image disappears from gallery
   - Deleted images panel shows image
   - Recover button restores image

---

## Last Known Good (LKG) Definition

**LKG = app is good if and only if ALL of the following are true:**

### Core Generation
- ✅ **Generate AI works across app:**
  - Single product (card button) generates and populates fields
  - Edit panel (Generate button) generates and populates fields
  - Bulk selected products generate successfully
  - Whole batch generation works (batch 1, batch 2, batch 3+)
  - Title max 80 chars, no punctuation
  - All marketing fields populate: title, description_main, description_style_a, description_style_b, shopify_tags, etsy_tags, collections_tags
  - Button clickable even when shows "(0)" (toast on click if no images)

### Batch Switching
- ✅ **Batch switching doesn't break buttons/features:**
  - Switching batches loads products/images correctly
  - Generate AI button works after switching
  - All buttons remain clickable
  - No UI freezes or errors
  - State doesn't leak between batches

### Camera Capture
- ✅ **Camera capture stable:**
  - Batch Capture works (multiple photos)
  - Quick Product (4 shots) works
  - Images upload successfully
  - Condition notes save correctly
  - No crashes or permission errors

### Image Expansion
- ✅ **Expand images works:**
  - Single product expansion generates additional images (up to 9 total)
  - Batch expansion works for selected products
  - Generated images maintain quality
  - No timeouts or errors
  - Images appear in correct order

### Background Remover
- ✅ **Background remover perfect incl inside hanger:**
  - Standard background removal works
  - Inside hanger removal works correctly
  - Second pass option works
  - Shadow options work (none/light/medium/harsh)
  - Processed images replace originals
  - Undo works

### Models + Ghost Mannequin
- ✅ **Models + ghost mannequin correct and fast enough:**
  - Model try-on generates images with correct model identity
  - 12 models selectable and consistent
  - Poses, fit styles, outfit styles work
  - Ghost mannequin removes mannequin/hanger correctly
  - Processing completes within reasonable time (< 30s per image)
  - Undo works

### Parsing
- ✅ **Parse works: generate + voice + OCR:**
  - Voice parse: Stop Recording auto-triggers parse, fields populate, `generate-listing` runs, spinner stops
  - OCR/Vision parse: Analyze button works, fields populate, `generate-listing` runs, spinner stops
  - Both parsers extract facts correctly
  - Marketing fields generated after facts applied
  - No infinite spinners
  - No "Apply to fields" button required (auto-apply)

### Additional Requirements
- ✅ Image upload works (drag-drop and click)
- ✅ Image management works (delete, reorder, move between products)
- ✅ Hide/unhide products works
- ✅ Shopify export works (single and bulk)
- ✅ Download works (single and ZIP)
- ✅ No console errors
- ✅ No network errors (401, 500, etc.)
- ✅ All buttons clickable (no overlay blocking)
- ✅ No UI freezes or hangs

---

## Incomplete/Unused Features

### Autopilot Page (`/autopilot`)
**Status:** Implemented but may be incomplete
**Location:** `src/pages/AutopilotPage.tsx`
**Edge Function:** `supabase/functions/process-autopilot-batch/index.ts`, `supabase/functions/start-autopilot/index.ts`
**Notes:** Autopilot feature exists but may not be fully tested or used in production.

### QC Dashboard Page (`/qc-dashboard`)
**Status:** Implemented but may be incomplete
**Location:** `src/pages/QCDashboardPage.tsx`
**Notes:** QC dashboard exists but may not be fully integrated with main workflow.

### Help Page (`/help`)
**Status:** Basic implementation
**Location:** `src/pages/HelpPage.tsx`
**Notes:** Help page exists but may need content updates.

### Etsy Integration
**Status:** Partially implemented
**Location:** `src/components/settings/EtsyIntegrationSettings.tsx`
**Edge Functions:** 
- `supabase/functions/etsy-oauth-start/index.ts`
- `supabase/functions/etsy-check-credentials/index.ts`
- `supabase/functions/etsy-save-credentials/index.ts`
- `supabase/functions/etsy-test-connection/index.ts`
- `supabase/functions/etsy-disconnect/index.ts`
**Notes:** Etsy integration UI exists but may not be fully functional or tested.

### Image Group Manager
**Status:** Implemented
**Location:** `src/components/batches/ImageGroupManager.tsx`
**Notes:** Image grouping feature exists but may be used infrequently.

### Birds Eye View
**Status:** Implemented
**Location:** `src/components/batches/BirdsEyeView.tsx`
**Notes:** Alternative view mode exists but may not be primary workflow.

### Precision Erase
**Status:** Implemented (Hard Erase only)
**Location:** `src/components/image-edit/ImageEditCanvas.tsx`, `src/hooks/use-precision-erase.ts`
**Edge Function:** `supabase/functions/precision-erase/index.ts`
**Notes:** Hard erase tool works. Smooth/Blend features removed in rollback.

### Image Notes
**Status:** Implemented
**Location:** `src/hooks/use-image-notes.ts`
**Notes:** Image notes feature exists but may be used infrequently.

### Default Tags Manager
**Status:** Implemented
**Location:** `src/components/settings/DefaultTagsManager.tsx`, `src/hooks/use-default-tags.ts`
**Notes:** Default tags feature exists for tag suggestions.

---

## Notes

- All edge functions require authentication (JWT token)
- All AI features use Lovable AI Gateway → Google Gemini 2.5 Flash
- Image storage: Supabase Storage bucket `product-images`
- Database: Supabase PostgreSQL
- Debug logging: Enable with `localStorage.setItem('DEBUG_AI', '1')` in browser console

---

**End of Feature Inventory**
