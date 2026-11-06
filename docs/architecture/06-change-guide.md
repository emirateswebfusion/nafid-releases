# 6. Change guide

## 6.1 Where does my code go?

| You are adding / changing… | Put it in | Notes |
|---|---|---|
| A new screen | `src/components/<Feature>.tsx` + `src/components/<feature>/{views,modals,ui}` | Register navigation in `App.tsx`; wrap with `PermissionGuard` if gated |
| A section of an existing big screen | a new file under `components/<feature>/views/` | Pass data + callbacks as props; do not grow the screen file |
| A dialog | `components/<feature>/modals/` | Use `ui/Modal` |
| A reusable visual primitive | `components/ui/` | No business logic |
| State shared by several screens | `src/store/<name>Store.ts` | Selectors only in consumers |
| A calculation (money, tax, pricing, numbering, permission) | `src/utils/<topic>.ts` + `tests/unit/<topic>.test.ts` | Check [04-business-rules](04-business-rules.md) first — it may already exist |
| State + effects + handlers for one section of a big screen | `components/<feature>/hooks/use<Section>.ts`; pure matching/lookup rules it uses in `components/<feature>/<topic>.ts` + a unit test | Hand views the hook's result as one prop (`customerFields={customerFields}`), not its members. Feature-specific, so not `src/hooks/` |
| A use-case combining data calls + a rule (e.g. "find scrap credit") | `components/<feature>/<useCase>.ts` | Calls `src/data/*`; tested with `vi.mock` |
| Reading/writing local data | `src/data/<domain>.ts` | Existing channel → just call `<domain>Api`; new channel → the 5-step recipe in [03](03-data-access.md#adding-or-changing-an-ipc-channel-5-steps-one-change) |
| Listening to main-process events | `src/data/events.ts` (`bridgeEvents`) | Return the unsubscribe from your effect |
| Login, cloud recovery or session expiry | `src/store/authStore.ts`, `components/auth/LoginScreen.tsx`, `components/app/hooks/useScreenEvents.ts`; main `syncTransport.ts` / `syncWorker.ts` | Preserve ordinary offline access and require online/persisted credentials for cloud recovery. Keep expiry event payloads aligned in preload, `global.d.ts`, `data/auth.ts` and `bridgeEvents`. See [recovery contract](03-data-access.md#cloud-session-recovery); run recovery tests plus sync login/no-login and LAN characterization when touching sync |
| A cloud (online-only) call | `src/data/cloud/<domain>.ts` (`cloudFetch` / `cloudRequest`) | Verify the server route exists |
| SQL | `electron/db/statements/<domain>.ts` | Intent-named factory `(db: Db) => db.prepare(…)`; bind user values with `?` |
| Schema / migration | `electron/db/migrations/NNN-*.ts` + `migrations/index.ts` | A new numbered migration (runs once, recorded in `schema_migrations`); never grow the startup baseline (guard R10); mirror synced columns in the server migrations; see 03-data-access §3.4 |
| A main-process use-case | `electron/services/<domain>Service.ts` | Validates, applies rules, runs statements in `db.transaction`; never imports `electron/ipc/` |
| An IPC channel | `electron/ipc/<domain>Handlers.ts` | One line: `handle('db:doThing', domainService.doThing)` |
| Printer / scale / scanner / WhatsApp behaviour | `electron/hardware/*`, `electron/whatsapp/*` | Adapters only |
| UAE printed wording (a label, its Arabic, a document title) | `src/utils/print/uaeLabels.ts` | The only copy of the English/Arabic pairs and the Tax Invoice rule; update the UAE section of `printGenerators.characterization.test.ts` and [vat-uae-integration §9](vat-uae-integration.md) |
| A card terminal acquirer (ECR) | `electron/hardware/cardTerminal/adapters/<provider>.ts` + `registry.ts` + the `TerminalProvider` unions (main and `src/data/cardTerminal.ts`) | Implement `PaymentTerminal` from the acquirer's spec; never log or store more than the last 4 card digits; add frame encode/decode tests; flows stay in `cardTerminalService` / `components/app/cardTerminalStep.ts` ([design](card-terminal-design.md)) |
| A synced table or column | `electron/sync/entities/*Sync.ts` + `nafid-server/src/routes/sync/*` + server migration | A new synced table needs: add it to `SYNCED_TABLES` and a migration that re-creates the outbox triggers. Characterization test first; update both repos and the docs together |
| Restaurant mode (tables, orders, KOT, kitchen display) | Renderer `src/components/restaurant/` + `src/data/restaurant.ts`; main `electron/services/restaurant*.ts`, `electron/db/statements/restaurant.ts`; sync `electron/sync/entities/restaurantSync.ts` ↔ `nafid-server/src/routes/sync/restaurant.ts` | Keep it behind the `restaurant_mode` flag; settle orders only through the normal checkout (`restaurantBillHandover.ts`); keep status changes forward-only on both sides; country rules live in `restaurantRules.ts` ([design](restaurant-mode-design.md)) |
| UAE e-invoicing (Peppol PINT AE) | Server: `nafid-server/src/services/einvoice/` (generator, validation, ASP adapters). Terminal: `electron/sync/einvoiceSync.ts`, `src/data/einvoice.ts`, `src/data/cloud/einvoiceCloud.ts`, `src/utils/einvoice/` | Never build or send e-invoices on the terminal (checkout must not wait). A new ASP = one adapter in `services/einvoice/adapters/` + registry entry. See [uae-einvoicing-design](uae-einvoicing-design.md) |
| Release notes / "What's New" cards | `src/components/settings/releaseNotesUtils.ts` + `whatsNew.ts` | **Never hardcode release notes in source code.** Features are sourced dynamically from GitHub Releases via `updateInfo.releaseNotes`, parsed and sanitized into rich cards with `releaseNotesToCards()` (filtering out developer verification/CI lines, separating clean titles, and mapping bilingual domain tags), and cached in `localStorage`. `whatsNew.ts` provides `getWhatsNewItems()` and evergreen fallback only |
| Updater / install behaviour | `electron/services/updaterService.ts` (+ `src/store/updateStore.ts`, `src/components/settings/hooks/useSettingsUpdater.ts`) | Register channels only in `electron/ipc/updaterHandlers.ts`; service functions own the use-cases. Only install from the `downloaded` state; never force-exit when the installer fails; await Windows process creation via `windowsUpdateInstaller.ts`; preserve a verified installer on launch failure and return `{ success, error, installerReady }` for retry. See ADR 0006 |

## 6.2 Workflow for any change

1. **Locate the owner.** Use the table above and [02-codebase-map](02-codebase-map.md). One change belongs to one layer.
2. **Read before you write.** Find every caller of what you change (`grep` the function/channel name across `src/` and
   `electron/`; for sync/REST also grep `nafid-server`).
3. **Rules first.** Write or change the pure function and its test before wiring UI.
4. **Data second.** Reuse the domain repository; add a channel only if none fits.
5. **UI last, in small files.** Extract instead of growing a screen.
6. **Verify:** `npm run verify` (must pass), and run the app for UI changes (`npm run dev`) — exercise the screen you changed
   and one neighbouring flow (for billing: create a bill, hold/recall, print preview).
7. **Document:** update these docs if you changed a contract, a layer, a rule module or a convention.
8. **Clean up branches and worktrees:** If a dedicated branch or worktree (`C:\nafid-wt\...`) was used, once merged into `main` and verified through gates, promptly delete the worktree and branch so no dead branches or orphaned worktrees remain.

### Thermal receipt paper layout

USB/system receipts use `electron/hardware/receiptHtml.ts` (the React print-route view is not used by this path).
Keep page padding at zero and apply the 2 mm vertical / 3 mm horizontal body padding once.
Physical USB jobs pass `systemPrinter: true` to `buildReceiptHtml`. CSS supplies zero page margins and no paper size;
native printing also omits custom `pageSize` and uses the configured thermal driver's roll form at 100% scale (`usePrinterDefaultPageSize: true`). Do not submit measured custom lengths or dynamic `pageSize` objects to thermal drivers: Windows GDI drivers reject arbitrary custom heights, causing driver fallback that adds vertical blank margins (~40 mm top gap), clips outer left/right table borders, and halts/truncates printing prematurely (e.g., stopping at ~200 mm / item 18). For continuous multi-item printing without mid-bill cuts, the driver's cutter action should be set to "Document Cut" (cut at end of document/job) rather than "Page Cut" (cut after every 200 mm page break). 80mm rolls apply the stored `leftMarginOffsetMm` to `#receipt-root` (auto-profiled once on printer selection in Settings: 0mm for flush models like Epson/TVS, -3.5mm for offset models like Xprinter/POS-80) to guarantee zero clipping on flush printers and symmetric ~8mm margins on offset printers with 0 runtime overhead. Text uses `11.5px` monospace, `1.22` line height, `font-weight: 800`, and `-webkit-text-stroke: 0.25px #000` to ensure solid, high-density black strokes on 203 DPI thermal print heads without faint gray dithering.
Do not submit measured custom lengths to thermal drivers: Epson APD can substitute its 80 x 297 mm form and feed
the length difference before the bill (reproduced as 193 mm leading blank on a short v2.2.2 receipt).
Keep the driver configured for the selected roll width and continuous/long receipt paper; do not change the user's
printer defaults from Nafid. A4 and barcode jobs retain their explicit sizes and existing fallback behavior.
Windows receipt jobs query the selected queue's current GDI device caps in `hardware/windowsPrintArea.ts`:
`HORZRES`, `LOGPIXELSX`, `PHYSICALWIDTH`, `PHYSICALOFFSETX`. No printer-model lookup or fixed 58/80 mm
printable width is assumed. `usePrinterDefaultPageSize` selects that queue's form; no custom height is submitted.
`receiptHtml.ts` positions the border ink inside those physical bounds, accounting for the existing 3 mm body
padding and two CSS pixels of raster rounding allowance. Positive calibration reduces width, preserving the right
edge; negative offsets are clamped at zero for measured Windows geometry to avoid entering the hardware margin.
The HTML page width follows the driver while the app's width remains the receipt column/font-format preference.
An 80 mm text layout on a 58 mm queue therefore fits rather than losing its Amount column. Invalid/non-thermal
caps or a failed Windows query stop before printing; errors request driver settings/retry instead of guessing.
Non-Windows system printers retain legacy geometry. PDF/WhatsApp geometry is unchanged.
Sources: [Windows GetDeviceCaps](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-getdevicecaps),
[Electron 42.4.1 printing API](https://github.com/electron/electron/blob/v42.4.1/docs/api/web-contents.md#contentsprintoptions-callback).
`hardware/receiptLayout.ts` owns physical text fitting and the final main-process preflight. It measures real DOM
text ranges, not canvas, uses container units for width changes, corrects hinted-font glyph bounds, and re-fits on
font readiness, container resize and `beforeprint`. The same preparation runs from main immediately before spooling;
it recovers when the HTML inline script did not execute, and rejects missing/overflowing layout instead of printing.
PDF/WhatsApp retain their existing fitting path. Actual renderer coverage is `tests/characterization/receipt-layout.cjs`
(54 receipts / 162 assertions with canvas disabled across nine styles, three fonts and 58/80 mm, including late
narrowing). Native driver coverage includes unavailable canvas and removed inline scripts; the photographed five-item
layout is a synthetic fixture. Merely removing body/page margins was tested and clipped both borders on the Epson
APD queue, so do not assume driver defaults alone contain fixed-width HTML text.
Rows fit available width after assets load, before `printReady(height)` signals content readiness. Height is a
readiness/validity check only for physical jobs, not their paper length. Missing readiness messages recover by
measuring that same window directly. Invalid direct measurements report a retry error; never feed guessed paper.
Each USB job captures its receipt text before printer discovery. Receipt failures never retry on a different/default
printer. PDF/WhatsApp callers keep their original body geometry and dynamic CSS page sizing.

Unit coverage: `tests/unit/windowsPrintArea.test.ts`, `thermalPrint.test.ts`, `printerPromise.test.ts`, `whatsappPdfDelivery.test.ts`.
Windows driver/emulator gate: `tests/characterization/thermal-driver.cjs` (see its README). Unlike `printToPDF`, this
runs real Windows spooling through a thermal driver into local emupos, checking short and 60-item bills for one
cut-delimited receipt, <= 8 mm leading blank, and visible ink bounds inside both edges. The Epson APD 5.13 / TM-T88V
Receipt5 test queues were validated at 180 dpi: 80 mm / 512 dots and 58 mm / 360 dots. Emulator output does not verify physical cutter,
mechanics, or every driver/firmware; other printer configurations still need targeted checks.

## 6.3 Modifying an existing feature safely

- **Billing / checkout:** line money math is in `utils/pricing/linePricing.ts` and `utils/pricing/checkoutLines.ts`; totals in
  `store/cartStore.ts`; deduction lookups in `components/billing/deductionLookup.ts`. Change those, not inline copies.
- **Big screens** (`BillingPage`, `SalesHistory`, `PurchaseBillManager`, `CashierSettlement`, `CustomersPage`):
  extract the block you need to change into `views/` or a hook first (move code verbatim, compile, then edit), so the
  change is reviewable and the screen shrinks.
- **Main process:** change the use-case in `electron/services/` and the SQL in `electron/db/statements/`; handlers stay
  one-liners. When you touch a legacy inline filter builder, move it to `db/statements` (the guard locks in the gain).
  Prove moves with `tests/characterization/`.
- **Sync, numbering, stock, ledger:** add a characterization test that captures current behaviour, then change.

## 6.4 Definition of done

- [ ] `npm run verify` passes (tsc app, tsc electron, unit tests, architecture guard).
- [ ] `npm run lint:ratchet` does not report growth.
- [ ] No new `window.electronAPI` outside `src/data/`, no new `any`, no file over budget, baselines did not grow.
- [ ] New/changed rules have unit tests; nothing was copy-pasted.
- [ ] Manual check of the affected screen in `npm run dev`.
- [ ] Docs updated for contract/structure changes. Commit only when asked; one slice per commit.

## 6.5 Commands

```bash
npm run dev            # vite + electron
npm run verify         # tsc -b + electron typecheck + vitest + architecture guard
npm test               # vitest run
npm run check:arch     # architecture guard only
npm run lint:ratchet   # lint debt must not grow (npm run lint alone is not a gate)
npm run build          # tsc + vite build + electron tsc
npm run package:win    # rebuild natives + build + electron-builder
```

## 6.6 Current hot spots and next refactors

| Item | State | Next step |
|---|---|---|
| `BillingPage.tsx` (1.6k lines, ~45 `useState`) | Views (cart, totals, payment, search bar, customer details, ERP grid layout, header, toasts, deduction dropdowns), modals, deduction editor, pricing/checkout line builders, the checkout use-case and the customer fields (`billing/hooks/useCustomerDirectory`, `useCustomerFieldState`, `useCustomerFieldHandlers`; rules in `billing/customerDirectory.ts` + tests) extracted; product search state (`useProductSearchState`), its loaders (`useSearchResultsLoader`) and matching rules (`billing/productSearch.ts` + tests) and the selection/keyboard handlers (`useSearchSelection`) extracted; tab number previews in `billing/numberReservation.ts` (tested); keyboard shortcuts in `useBillingShortcuts`; deduction/loyalty state passed as one typed `deductions` object (`DeductionState`); documents handed over from other screens (edit bill, return, quotation edit/new) in `useIncomingDocuments`; quick product form state in `useProductFormState` (CreateProductModal takes `productForm`, 60 -> 12 props) and its actions in `useProductFormHandlers`; billing configuration in `useBillingSettings` (state) + `useBillingSettingsLoader` (initial load, `settings:updated`); cart line key handlers in `useCartKeyboard` and cart focus movement in `useCartFocus`; held bills (list, hold, recall, release) in `useHeldBills`; WhatsApp send in `useWhatsAppSend`, save quotation in `useSaveQuotation`, return from cart in `useReturnFromCart`; mount/unmount tab handling in `useBillingEntry`, reserved-number refresh in `useTabNumberRefresh`, scrap invoice edit loading in `useScrapInvoiceEdit`; pricing tiers in `usePricingTier`, customer tier/loyalty auto-match in `useCustomerAutoMatch`, hardware barcode scans in `useHardwareBarcodeScanner`, most-sold products in `useMostSoldProducts` | ERP grid (51 props) and totals panel (66): group cart and payment state the same way as `deductions` |
| `SalesHistory.tsx` (714 lines, under the cap) | Display helpers in `sales/salesHistoryFormat.ts`, row/badges in `sales/views/InvoiceRow`, `StatCard`; CSV export, reprint, WhatsApp send and invoice details (with cache), the list loader and the GST conversion preview in `sales/hooks/`; loose row types in one place (`sales/salesTypes.ts`); views `SalesHistoryHeader`, `InvoiceDetailModal` (+ `InvoiceItemsTable`), `CollectPaymentModal`, `ConversionModal`, `SalesBillsView`, `SalesAnalyticsView`; linked-invoice view and collect payment in `useLinkedInvoiceView`, `useCollectPayment` | The React Compiler lint now analyses the file and reports 4 existing `set-state-in-effect` patterns (filter-reset and initial-search effects); fixing them changes behaviour, so they are baseline debt |
| `PurchaseBillManager.tsx` (772 lines, under the cap) | Types in `purchase/purchaseTypes.ts` (incl. `PurchaseFormItem`), helpers in `purchaseFormat.ts`; hooks: list summaries, print, CSV export, quick product create, and the product form state (`usePurchaseProductFormState`, passed to views as one `productForm`); views: bill list, bill detail dialog, supplier dialog, product search (+ product dialog), add-grade and cleanup dialogs, bill items table; `purchase/PurchaseBillFormSection.tsx` (one GST / estimate bill form) with its save, product actions, edit-load and search-results hooks | — |
| `CashierSettlement.tsx` (750 lines, under the cap) | Helpers in `cashier/cashierFormat.ts`, loose rows named in `cashier/cashierTypes.ts`; hooks: drawer actions, invoice view, settlement amount editing; 11 views (header, pending settlement, cash register, history, invoice / split / transaction / day-close / reopen / delete dialogs, loading skeleton). `InvoiceTypeBadge` / `getInvoiceTypeInfo` now come from `sales/` (were identical copies) | Consolidate deliberately (behaviour decisions): Cashier and Sales History keep separate payment label sets (Sales has SPLIT) and separate MRP-enrichment implementations that have diverged |
| `CustomersPage.tsx` (795 lines, under the cap) | Types in `customers/customerTypes.ts`, helpers in `customerFormat.tsx`; hooks: data loading, add/edit/points, customer actions, invoice exports; views: list, detail, invoice dialog, add and edit dialogs | Add and edit dialogs are near-duplicates (kept as is); type the auth store (see Type safety) |
| Type safety | `useAuthStore` is now explicitly typed: its initializer calls `useAuthStore.getState()`, and with `noImplicitAny` off tsc had inferred the whole store as `any`, so the gate never type-checked `tenantId` / `userId` / `role` (this hid the customers refresh bug and the `user` field bug). The other stores were already typed. Session values passed to APIs that require a string now carry type-only `as string` casts (logged-in screens; runtime unchanged) | Replace the casts with a typed session accessor; **product decision:** the biller-only options OPT_VIEW_GST / OPT_VIEW_GST_INVOICES_ONLY are checked against role 'BILLER', which never occurs (roles are normalised to STAFF), so they are not enforced (`isLegacyBillerRole` in `utils/security/permissions.ts`); pre-existing runtime errors seen in the app: Stock Report renders a `<div>` inside `<p>` |
| `ScrapManager.tsx` (729 lines, under the cap) | Types and loose-row aliases in `scrap/scrapTypes.ts`, helpers in `scrapFormat.ts`; hooks: invoice actions, stock actions; 10 views (category list / form, transactions, transaction form, selling, invoices, invoice detail, edit-transaction / edit-header / add-item dialogs) | — |
| `SettingsManager.tsx` (519 lines, under the cap) | All settings state in `settings/hooks/useSettingsFormState` (passed as one `form` object), loading in `useSettingsLoader`, saving in `useSettingsSave`; navigation (groups, titles, descriptions, search keywords) in `settings/settingsSections.ts`, rendered by `views/SettingsSidebar`; views `SettingsSectionContent` (the section switch, one single-topic tab per section; `tests/unit/settingsSections.ui.test.tsx` renders every section) and `LanSyncHelpModal`; shared card / toggle row in `views/SettingsControls`; loose values named in `settings/settingsTypes.ts`. `buildSettingsSnapshot` is called during render, so `useSettingsLoader` must stay above `getSettingsSnapshot`. Section sub-forms (`FilingOnlySettings`, `CashRegisterSettings`) communicate dirty status via `settings:section-dirty` and persist on `settings:request-save`; `useSettingsLoader` and `useSettingsSave` pass complete property overrides to `buildSettingsSnapshot` so initial dirty detection starts clean (`hasChanges = false`). | Opening Theme & Typography / Billing Page Customizer re-saves their current values (pre-existing) |
| `InventoryManager.tsx` (628 lines, under the cap) | All state in `inventory/hooks/useInventoryState` (one `inv` object); hooks: loader, save, form open, form handlers, list actions, exports, and `useInventoryEffects` (all 24 effects, original order, called last so every input exists); view `InventoryHeader` | Note for testing: the row buttons Add / Reduce Real Stock change stock immediately (±1) for Pcs products |
| `EcommercePortal.tsx` (581 lines, under the cap) | State in `ecommerce/hooks/useEcommerceState` (one `ec` object; the registration form stays in the portal); views: header, overview / registration / products / orders / settings tabs, edit-product dialog | — |
| `PartyManager.tsx` (766 lines, under the cap) | Types in `party/partyTypes.ts`, helpers in `partyFormat.ts`; state in `party/hooks/usePartyManagerState` (one `pm` object); hooks: loaders, party save, transaction save, bill preview, ledger sharing, and `usePartyManagerEffects` (all effects, original order, called last); view `PartyManagerHeader` | — |
| `StaffManager.tsx` (680 lines, under the cap) | Types in `staff/staffTypes.ts`; state in `staff/hooks/useStaffManagerState` (one `sm` object); views in `staff/views/`: list, profile header, detail panel (overview, salary, advances, ledger, attendance tabs), form modal (basic, compensation, access tabs), transaction modal. Opening the screen auto-creates staff rows for users without one (`staffService.getStaff`), unchanged | — |
| `PaymentMethods.tsx` (190 lines, under the cap) | Types, helpers and type styling in `payment-methods/paymentMethodsTypes.ts`; state in `payment-methods/hooks/usePaymentMethodsState` (one `pmState` object); hooks `usePaymentSourceActions` (save, toggles, delete, UPI page toggles) and `usePaymentTransactionActions` (ledger, manual entry); 10 views under `payment-methods/views/` | — |
| `WhatsAppSettings.tsx` (116 lines, under the cap) | Types in `whatsapp/whatsAppTypes.ts`; state in `whatsapp/hooks/useWhatsAppSettingsState` (one `wa` object; the tab and shop name stay in the page); hooks `useWhatsAppSettingsLoaders` (status subscription, settings, closing config / history, preview), `useWhatsAppConnection`, `useShopClosingConfigActions`; 10 views under `whatsapp/views/`. `loadClosingConfig` deliberately leaves `setClosingConfig` (a new wrapper every render) out of its deps | — |
| `SuperDashboard.tsx` (204 lines, under the cap) | Types in `super-dashboard/superDashboardTypes.ts`; state in `super-dashboard/hooks/useSuperDashboardState` (one `sd` object); hooks `useTenantAdmins` (load + health sweep), `useTenantProvisioning`, `useTenantVerification`, `useCloudAccessActions`; 7 views under `super-dashboard/views/`. Renders only for `SUPER_ADMIN` | — |
| `StockReport.tsx` (343 lines, under the cap) | Types in `stock-report/stockReportTypes.ts` (masked valuation derived from `calculateMaskedStockValuation`), cache in `stockReportCache.ts`; state `useStockReportState` (`sr`); hooks `useStockReportData`, `useStockReportExports`; 7 views | — |
| `DataUploadModal.tsx` (126 lines, under the cap) | Column specs / samples / types in `data-upload/dataUploadTypes.ts`; state `useDataUploadState` (`du`; `entityType` stays in the page); hooks for reset effect, file parsing, demo download, import; 6 views | — |
| `QuotationManager.tsx` (174 lines, under the cap) | Types in `quotation/quotationTypes.ts`; state `useQuotationState` (`qm`); loader / action hooks; list, detail, document and confirm views | — |
| `RecycleBin.tsx` (167 lines, under the cap) | Types / categories / date helpers in `recycle-bin/recycleBinTypes.ts`; state `useRecycleBinState` (`rb`); hooks for toasts, loading, restore / delete; 12 views | — |
| `ComboManager.tsx` (118 lines, under the cap) | Types and offer-price helper in `combo/comboTypes.ts`; state `useComboManagerState` (`cm`); load-effects and CRUD hooks; 9 views | — |
| `SettingsGrades.tsx` (124 lines, under the cap) | `Grade` derived from `data/grades`; form shape and palette in `settings-grades/settingsGradesTypes.ts`; state `useSettingsGradesState` (`sg`); load / CRUD / form hooks; 8 views. Screen is behind the `categories_grades` feature flag | — |
| `PricingTiers.tsx` (173 lines, under the cap) | Types and `isTierDefault` in `pricing-tiers/pricingTiersTypes.ts`; state `usePricingTiersState` (`pt`); data, tier and price-matrix hooks; views incl. the memoised `MatrixRow`. Behind the `pricing_tiers` flag | — |
| `OwnerDashboard.tsx` (147 lines, under the cap) | Props / sync types and `timeAgo` in `owner-dashboard/ownerDashboardTypes.ts`; state `useOwnerDashboardState` (`od`); `useOwnerDashboardEffects` (all 9 effects + `loadStats`, original order), `useDashboardCards` (card list, sorted and filtered during render), `useDashboardCardOrdering` (shift / drag); views `DashboardHeader`, `ReorderModeBanner`, `DashboardCardGrid` | — |
| `BillingUICustomizer.tsx` (273 lines, under the cap) | Views in `billing-ui-customizer/views/`: `LayoutModelsTab`, `PreviewTab`, and the controls sections `EntryFieldFlowSection`, `HeaderButtonsSection`, `ComponentVisibilitySection`, `PostPrintModeSection`; state and handlers stay in the page (two states) | — |
| `AiAssistant.tsx` (279 lines, under the cap) | Types, storage keys and starter cards in `ai-assistant/aiAssistantTypes.ts`; state `useAiAssistantState` (`ai`; conversations and the active id stay in the page, they start from local storage); hooks `useAiConversations`, `useAiChatActions`, `useAiMessageFormatting` (.tsx, renders message text); views `AiSidebar`, `AiMessageList`, `AiComposer` | — |
| `DesignSettings.tsx` (192 lines, under the cap) | Views in `design-settings/views/`: `DesignStudioHero`, `LivePosPreview`, `LightThemeBaseColors`, `DarkThemeBaseColors`, `BrandAccentSection`, `TypographySection`, `DensityScaleSection`; state and the custom-colour handlers stay in the page | — |
| `party/views/PartyLedgerView.tsx` (199 lines, under the cap) | Sub-views in `party/views/ledger/`: `PartyProfileCard`, `PartyBalanceCards`, `LedgerToolbar`, `LedgerEntries` (loading / table / cards); their prop types are indexed from `PartyLedgerViewProps` (one definition) | — |
| `inventory/views/InventoryFormView.tsx` (248 lines, under the cap) | Form sections in `inventory/views/form/`: `CoreSection`, `PricingSection`, `DiscountSection`, `StockSection`, `GstPurchaseSection` (add mode only); prop types indexed from `InventoryFormViewProps` | — |
| `billing/views/BillingTotalsPanel.tsx` (342 lines, under the cap) | Sub-views in `billing/views/totals/`: `DiscountRow`, `GrandTotalSection`, `TotalsActionButtons`; prop types indexed from `BillingTotalsPanelProps` | — |
| `billing/views/BillingCartView.tsx` (250 lines, under the cap) | Row components in `billing/views/cart/`: `CartServiceRow`, `CartReturnRow`, `CartScrapRow`, `CartItemRow` (one per cart line type, body moved verbatim; key stays `item.product_id`). Rows alias the `…Refs` props to `…Ref` names (`itemRefs: itemElementsRef`) so the React compiler lint treats them as refs | — |
| `BillingPage.tsx` (797 lines, under the cap) | State in `billing/hooks/useBillingPageState` (`bp`); effect groups kept at their original positions: `useCartLocalInputsSync`, `useBillingModeSync` (mode / tab sync), `useScrapInvoiceEditEvents`, `useDeductionSync`, `useBillingPopoverEffects`; render-time `useBillingTotals`; handlers `useNumberReservations`, `useGrandTotalOverride`, `useBillingQuickActions`; `productFormKeyNav.ts`; wrapper views `BillingWorkspace` and `BillingModals` (props typed from the child views). Untyped rows named `DeductionSearchRow` / `MostSoldProductRow` | — |
| `electron/db/customerIdentity.ts` (493 lines, under the cap) | Identity resolution / upsert stay here; startup backfill and de-duplication moved to `electron/db/customerDedupe.ts`. Proven with the IPC harness (1,527 calls, 0 differences), sync harness and statement check | — |
| `electron/sync/localHostServer.ts` (498 lines, under the cap) | HTTP server and routes stay here; the row merge (`upsertTableRows`, `getTableMeta` and its per-table cache, `extractItemId`, `parseCleanDate`) moved verbatim to `electron/sync/lanUpsert.ts`. Proven with the IPC, sync and LAN pairing harnesses | — |
| `electron/hardware/printer.ts` (773 lines, under the cap) | IPC handlers, print state and the USB / network print flows stay here; receipt HTML (`buildReceiptHtml`, Code 128 SVG, border helpers) moved verbatim to `electron/hardware/receiptHtml.ts`, ESC/POS bytes, `sanitizeForEscPos` and `sendToNetworkPrinter` to `electron/hardware/escPos.ts`. Not covered by the IPC harness (printer channels register in `initPrinter`); proven by a line-for-line comparison | — |
| `electron/whatsapp/shopClosingReportService.ts` (519 lines, under the cap) | Config, send / retry / history, scheduler and IPC stay here; the summary builder moved to `shopClosingSummary.ts`, the WhatsApp text to `shopClosingMessage.ts`, the types to `shopClosingTypes.ts`. Its one inline SQL statement (purchases total) is now `sumPurchaseBillsForDate` in `electron/db/statements/shopClosingReport.ts`. Proven with the IPC harness (every `shopClosing:*` channel, 0 differences) and the statement check | — |
| `electron/db/localDb.ts` (310 lines, under the cap) | `initDb` keeps the connection, pragmas, legacy-file restore and the final backfill / dedupe; it calls, in the original order, `createCoreTables` + `createExtendedTables` (the CREATE script, split at a statement boundary), `ensureSchemaColumns`, `runLegacyRepairs` and `runColumnMigrations` (each in its own `electron/db/*.ts`). Add a new table or column to the schema file and a migration to `migrationsColumns.ts`. Proven with the IPC, sync and statement harnesses and by running old and new `initDb` on copies of a real shop database: identical schema (69 objects) and contents (65k rows), apart from timestamps `initDb` itself writes | — |
| `electron/sync/syncWorker.ts` (5,134 -> scheduler + public API, under the cap) | First its 21 module `let`s became `syncState` (`syncState.ts`); then the code moved verbatim into `syncConfig`, `cloudAccess`, `syncProgress`, `syncTransport`, `syncCycle` and `entities/*Sync.ts`. `syncWorker.ts` re-exports the functions services load with `import('../sync/syncWorker.js')`. A new synced table: push / pull functions in the matching `entities/` module, called from `runSyncCycle` (`syncCycle.ts`), plus the server side (see §6.1). Proven with the sync harness (push / pull / conflict and no-login), the LAN pairing harness, the IPC harness, a CommonJS load of the compiled modules and a line-for-line comparison | — |
| Oversized files | **None left** (guard baseline: 0) | Keep new files under 800 lines |
 Split into `views/` per tab/section when touched |
| Main process layering | **Done:** IPC registration-only (0 SQL); services all < 800 lines; ~560 statements + 18 filter builders in `db/statements`; staff/offline-auth/purge use-cases moved out of `localDb.ts` (now connection + schema, 2.2k) | Move the last 6 date-range builders (resolve the date range in the service, pass it in) |
| Checkout | **Done:** `handleCheckout` moved to `billing/checkout/` (`createCheckoutHandler`, `runScrapCheckout` + tests); payloads identical to HEAD in 4 browser scenarios | Split the sales path further (validation → payload → persist → print) with unit tests per step |
| Fixed defects (22 Oct) | Biller PIN could not be saved (`status = "ACTIVE"` double-quoted string); staff credit purchases never updated the staff ledger running balance (`staff_ledger.updated_at` does not exist); customer-invoice lookup by name threw (double-quoted literals) | Keep `check-statements.mts` at 0 failures |
| Fixed defects (23 Oct) | With no cloud login (offline login, or none: tenant id taken from the local DB) the sync worker treated the `lan-local-token` placeholder as a valid cloud token and ran cloud sync with it (49 requests in the no-login sync harness, 41 with that bearer). `electron/sync/syncAuth.ts` `cloudTokenUnusable` now rejects it on the cloud route; LAN is unchanged (sync and LAN harness identical) | Decide whether `getTenantIdFromDb` should be used at all outside LAN |
| Fixed defects (23 Oct, billing) | GST header badge showed `GST-GST-001` (single-series GST numbers already carry `GST-`; rule now `displayInvoiceNumber` in `utils/pricing/invoiceNumberHelper.ts`); leaving quotation mode kept the GST invoice type set on entry, so the next sale was GST (`billing/hooks/useQuotationToggle.ts` restores it); the ERP grid showed a made-up number `6019` when none was reserved; warranty expiry and a tab-store comment held `�` | — |
| Fixed defects (23 Oct, customers) | After adjusting or recalculating loyalty points the customer list went empty and the open customer's points did not refresh: the refresh called `customersApi.getCustomers(tenantId)` with a bare string, so the main process (which reads `{ tenant_id }`) returned `[]`. Now `getCustomers({ tenant_id })`. The bug was invisible to the gate because `useAuthStore` resolves to `any` there (see Type safety) | — |
| Fixed defects (3 Nov, purchase bills header) | Refactored Purchase Bills header and toolbar (`PurchaseBillHeader.tsx`, `PurchaseBillList.tsx`, `PurchaseBillManager.tsx`): elevated Re-sync, Export CSV and + New Bill to top header row matching `InventoryHeader` and `SalesHistoryHeader` conventions; fixed `DateRangeFilter` and `Re-sync` button text wrapping; unified toolbar control heights (`h-9`); replaced raw emoji with `FileText` icon per design taste guidelines. | — |
| Features & Security (3 Nov, quick PIN & staff protection) | Added direct 4-digit PIN authentication on `LoginScreen` via `QuickPinLogin.tsx` (no user lists/dropdowns shown, immediate auto-verification on 4th digit, physical keyboard and barcode scanner support); added anti-brute force lockout (5 failed attempts locks for 30s); enforced multi-tenant PIN isolation (`hashStaffPin(pin, tenant_id)`); added self-deactivation and Admin account deactivation protection across `StaffManager.tsx`, `StaffProfileHeader.tsx`, `StaffBasicTab.tsx`, and `staffService.saveStaff`. Tests: `tests/unit/quickPinLogin.test.ts`. | — |
| Fixed defects & Features (5 Nov, inventory CSV export & upload headers) | (1) Product CSV export in `useInventoryExports.ts` (`buildInventoryCsvRow`) now exports complete product specifications: includes missing `HSN Code`, `Tax Rate %`, `Discount %`, `Discount Flat`, `Low Stock`, `Billing Type`, and `GST Applicable`, with safe fallbacks to `domain_attributes` for `item_code` and `hsn_sac_code`. (2) Updated `PRODUCT_HEADER_MAP` in `dataUploadTypes.ts` to recognize `hsn/sac code`, `discount percentage`, `real stock`, `paper stock`, `paper purchase`, `paper mrp`, `billing type`, `gst applicable`, and `added date`, preventing them from being mistakenly interpreted as dynamic pricing tiers on CSV re-import. Tests: `tests/unit/inventoryCsvExport.test.ts`. | — |
| Fixed defects & Features (5 Nov, v2.2.36) | (1) Thermal Receipt PDF Sizing: WhatsApp receipt-width PDF generation measures rendered DOM content height (`document.body.scrollHeight`), injects exact `@page` sizing, and prints to custom PDF dimensions (`widthMm` x `pageHeightMm`) instead of standard A4 canvas (297 mm), eliminating trailing blank canvas on mobile receipts (`electron/whatsapp/whatsappService.ts`, `whatsappPdfDelivery.test.ts`). (2) Bill of Supply & Thermal Receipt Tax Breakup: Intra-state tax calculations in `cartStore.ts`, `checkoutHandler.ts`, `receiptCore.ts`, `boxed.ts`, and `whatsappBillHelper.ts` fallback to canonical `splitTaxAmount(tax)` from `src/utils/pricing/checkoutLines.ts` when total tax > 0, ensuring consistent non-zero CGST and SGST on Bill of Supply and receipts rather than 0.00 splits (`thermalBillTaxBreakup.test.ts`). (3) Auto WhatsApp Send Persistence: `auto_whatsapp_send` setting is persisted to SQLite `settings` table via `setSetting`, loaded on startup (`useSettingsLoader.ts`), and auto-healed during checkout (`checkoutHandler.ts`). | — |
| Fixed defects & Features (4 Nov, v2.2.35) | (1) Staff Hub & Monthly Pay Statement: opening balance carried forward, earned salary by calendar days and joining date, extra additions, cash advances, store purchases, deductions, net paid, total payable to staff (`StaffManager.tsx`, `staffPayStatement.ts`, `staffPayStatement.test.ts`). (2) Inline Pricing Tier creation: create and activate new pricing tiers directly within product form (`PricingSection.tsx`, `InventoryManager.tsx`). (3) WhatsApp Bill Tax Breakdown: detailed Subtotal, CGST, SGST, IGST, and Discount lines matching physical thermal receipts (`whatsappBillHelper.ts`, `checkoutHandler.ts`, `whatsappTaxBreakdown.test.ts`). (4) WhatsApp Closing Message Gross Sales: `grossSales = netSales + totalDiscount` without double-counting scrap or return deductions (`shopClosingSummary.ts`, `shopClosingGrossAmount.test.ts`). (5) Scrap Purchase Cash Register Deduplication: prevented per-item cash deduction on invoice checkout, purged duplicate scrap entries on invoice update/deletion, and added migration 015 (`scrapService.ts`, `015-dedupe-scrap-cash-transactions.ts`, `scrapCashReconciliation.test.ts`). | — |
| Fixed defects (29 Oct, shop closing) | (1) Shop Closing WhatsApp overview double-counted scrap purchases when bills had scrap deductions (`shopClosingSummary.ts` added `invoices.scrap_deduction` as a duplicate purchase on top of `scrap_transactions`). Removed redundant invoice scrap summation; scrap totals now strictly reflect `scrap_transactions`. (2) An in-progress register (`status === 'OPEN'`) incorrectly labeled current time as `⏰ *Closing Time:*` instead of `⏰ *Report Time:*`. (3) `drawer.closed_at` (SQLite UTC `CURRENT_TIMESTAMP`) was parsed with `new Date()` without `toEpochMs()`, misinterpreting UTC strings in the host PC timezone before formatting in store timezone. (4) Scheduled time settings UI now displays a 12-hour AM/PM badge and morning warning to prevent users scheduling evening closing reports for the morning (e.g., `10:50` AM vs `22:50` PM). Tests: `closingScrapOptions.test.ts`. | — |
| Fixed defects (29 Oct, converted invoice date edit) | Editing the bill date of converted GST invoices (such as B2C bills with converted_from_invoice_id) was reverting back to the source Bill of Supply date after a few days / on app restart because of an unversioned legacy migration in electron/db/localDb.ts that ran on every start. Removed the startup overwrite query, and added bidirectional date sync in electron/services/invoiceEditService.ts (updateInvoiceCreatedAt, updateInvoiceItemsCreatedAt) so editing either document keeps both documents and their line items synchronized and marked PENDING for sync. Tests: convertedInvoiceDateEdit.test.ts. | — |
| Fixed defects (26 Oct) | (1) Drawer cash sales were matched by the **UTC** date of the bill against the store-local business date (bills between local midnight and 05:30 IST landed on the previous day) and every history listing recomputed and re-synced closed drawers. Now drawers are sessions (`electron/services/cashDrawerSession.ts`, see 04-business-rules §Cash drawer sessions), history is frozen, and auto close is a setting; `tests/characterization/drawer-session.mts`. (2) Startup repairs are idempotent (`tests/characterization/startup-idempotency.mts`): the customer backfill no longer re-stamps `last_purchase_date`/`updated_at`, the return-total recalibration prices each line from its invoice line instead of discounting the stored price again on every start (this repairs returns that had drifted), and the paper-price self-heal skips REAL products without paper stock | — |
| Versioned SQLite migrations | **Done (26 Oct):** runner `electron/db/migrations/` (`schema_migrations` + `user_version`, one transaction per migration); the inline repairs are a frozen, idempotent startup baseline (guard R10); first migration `001-returns-indexes`; `tests/characterization/migrations.mts` | Move a baseline repair into a migration only when it is provably one-time (old shapes can still arrive by sync) |
| Sync SQL | **Done (26 Oct):** 201 statements moved verbatim from `electron/sync/*` and `main.ts` to `electron/db/statements/sync/*` and `statements/main.ts` (duplicates merged; guard R12; `check-statements` covers them). Proven: IPC 1,548 calls, sync (login and no-login) and LAN harnesses identical to HEAD, compiled CJS loads. 5 dynamic query builders stay in sync, capped | Move a builder when it is next changed |
| Dynamic query builders | **Done (26 Oct):** the last 11 (`getProducts` / count, `getInvoices` / summary, customer and party profile updates, LAN delta / table / pending-bills queries, LAN upsert, pending-row count) are builders in `electron/db/statements` returning `{ statement, params }` with the same SQL and parameter order; services compute store-day ranges first. Guard baselines at 0. Proven: IPC 1,548 calls, sync (login / no-login) and LAN harnesses identical; 800 statements prepare | — |
| Sync outbox + LAN auth | LAN auth done (pairing key). Outbox steps 1–2 done (schema; SQLite triggers record local writes, cloud / LAN applies run under `sync_apply_guard`, cleared at startup); server step 3 done (`POST /api/sync/ops`: tenant check, idempotency, version rule). Push bodies still omit `row_version` / `origin` | Step 4 done behind the default-off beta toggle (see §6.7); test on a real shop before enabling it |
| Typed IPC contract | **Done (27 Oct):** every `src/global.d.ts` output is typed from `src/data/*` / generated `dbRows.ts` (0 `any`); screen types extend the canonical ones; proven type-only by comparing the transpiled JS of every file | Keep new channels typed the same way (03-data-access step 4) |
| Cloud calls | **Done (26 Oct):** all renderer HTTP in `src/data/cloud/*` over `client.ts` (`src/lib/api.ts` removed; guard R11) | — |

## 6.7 Opt-in outbox sync

`electron/sync/outboxSync.ts` owns cloud op push and sequence pull; SQL lives in `db/statements/sync/outboxSync.ts`.
`outboxResults.ts` holds pure result/engine decisions. `sync_engine` is a device-local setting, default `legacy`;
only the owner/admin beta toggle enables `outbox`. LAN/HYBRID roles ignore it. See design §7.4 for limits.
Run `outbox-run.mts` plus unchanged legacy sync (both login modes), IPC and LAN harnesses for changes here.

### Windows release packaging

Every release must pass the canonical [packaged release validation gate](release-validation.md). Inspect the final
installer's updater/production configuration and verify the complete draft asset set before publication; source gates
alone do not satisfy this requirement. Record the actual installed-upgrade test result and any transition limitation.

`.github/workflows/windows-installer.yml` builds an unsigned installer on a Windows runner with the existing Electron/SQLite rebuild recipe and public runtime settings. It uploads reviewable artifacts without publishing. Run it manually when local Application Control prevents NSIS from generating its uninstaller; do not disable local security controls. Verify the installer metadata, packaged runtime and thermal driver characterization before publishing release assets.

### Shop module selection and business categories

`src/config/businessProfiles.ts` recommends modules for retail, restaurant, wholesale, clothing, grocery,
hardware and scrap shops. Categories set initial choices; they do not change tax country or permissions.
Owners customize accessible checkbox selections and explicitly Save shop modules. This section saves its
own draft and does not apply uncommitted choices to the running app. Existing shop choices are preserved
until explicitly saved. Clothing currently recommends existing category/retail features; product size/color
variant modeling is not implemented by this module-selection change.

`resolveFeatureFlags` owns legacy defaults. `useFeatureFlagsRefresh` reloads tenant-only settings after
local saves, focus and remote data events; the store ignores stale loads and preserves confirmed choices
on read errors. Dashboard cards, entry events and PermissionGuard enforce module visibility, including an
already-open screen. Advertisements and Financial Reports now have explicit module keys. Pricing tier
selectors in billing, inventory and parties follow pricing_tiers; recorded bills keep their original prices.

Renderer UI fixture: run Vite and `electron tests/characterization/module-workspace.cjs`; it opens a fake
shop backed only by an isolated localStorage record. No real database or external fetch is used. Coverage:
businessProfiles, featureFlagsStore, businessModules.ui, featureSettingsSync and restaurantSharedReport.ui.

Validation on 5 November 2026: POS app/electron typechecks, architecture guard and lint ratchet passed;
167 Vitest files / 1,024 tests passed with two workers (avoids unrelated parallel-import timeouts).
Server verify passed with 286 tests. Renderer fixture was exercised through Dashboard > Tables, Settings >
Features & Modules > Retail category > Save > Dashboard > Reload: food pages stayed hidden after reload.
This verifies local renderer persistence, not a deployed multi-terminal shop; coordinated server/POS rollout
and a real cloud/LAN shop smoke test are still required before claiming live propagation.

UI consistency: operational food pages use the same compact icon/title/action header and secondary
summary row as Inventory. RestaurantTopBar owns the single page heading and Dashboard close action.
Kitchen surfaces use semantic card/background/foreground theme tokens in light and dark modes;
status colors remain semantic. Features uses shared SettingsCard/Button, and order/setup/kitchen
layouts stack on narrower displays. These are presentation changes; data and checkout rules are unchanged.

Design validation: Tables and Kitchen were opened in the isolated renderer fixture; the compact header,
summary row and light-theme Kitchen layout were visually checked. App/electron typechecks and architecture
guard passed. The full suite had three unrelated startup/trial timeouts under default concurrency; both
affected files passed all 13 tests on a two-worker rerun. The 31 module/settings/billing UI tests passed.

### v2.2.44 maintenance ownership

Cash duplicate detection belongs in `electron/services/duplicateScrapCash.ts`; permanent cleanup SQL
remains in `db/statements/scrap.ts`. Apply the same predicate to register and all history branches,
and reconcile persisted drawer totals after cleanup. Preserve historical migrations.

Terminal context persistence belongs in `services/terminalSession.ts` with statements in
`db/statements/localAuth.ts`. Auth save/clear/PIN persistence use-cases are in `authSessionService.ts`;
their IPC registrations remain one-line delegates. `TerminalConfigResult` adds optional user display
fields. The existing channels remain stable; the device-local context never changes a sync payload.
Quick PIN authentication in `authSessionService.loginWithPin` preserves an existing valid cloud session token
for the same tenant instead of wiping `config.json`, returning the token to the renderer to keep background
sync active. `saveOfflineSession` unlinks cloud credentials only when the tenant changes. `runInitialSync`
and `syncCycle` check auth validity before notifying online status, avoiding spurious 'token expired' popups
and false online badges.

Use `buildReceiptLines` for active bill shares and `splitTaxAmount` for history header splits.
Propagate HSN and tax percent to both message and PDF; never calculate a different price in a share hook.
`buildAttendanceMonth` owns the complete calendar-day list; `buildPayStatement` owns month classification.

For UI acceptance start Vite on port 5184 and run `electron tests/characterization/release-workspace.cjs`.
The isolated fixture has no native database or outgoing messages. Unit/service checks prove persistence;
renderer fixtures alone do not prove installed upgrade behavior. Run the final installer acceptance
workflow in a disposable Windows runner as required by `release-validation.md` before publication.


### Variant editor and management ownership

Use `inventory/variantProducts.ts` for validation and complete variant product/tier roundtrips.
Use `inventory/views/form/VariantsSection.tsx` to repeat `PricingSection`; do not create a second
pricing implementation or restore the inventory toolbar Variants subpage. Dashboard event
`open-product-variants` opens `variants/VariantsManager.tsx` under inventory/products.view.
The page opens `InventoryManager` with `initialProduct` to reuse the canonical form.

Manual acceptance uses only in-memory test data: start `pnpm exec vite --host 127.0.0.1 --port 5189`,
then `pnpm exec electron tests/characterization/variant-workspace.cjs`.
Open Product Variants, manage Cotton Shirt, confirm S stock 12 / Wholesale 80, add XL, set its
independent pricing/tier, save, reopen, and confirm S and parent stock remain unchanged.

Variant acceptance evidence: full `pnpm run verify` passed (177 files / 1,063 tests),
`pnpm run lint:ratchet` passed with zero errors/warnings, and architecture guard passed.
The additional direct-entry grade regression (`inventoryVariantOpen.ui`) passed separately,
with the app typecheck and focused lint repeated after that fix. Isolated native UI acceptance
created XL at Wholesale 90, saved, closed and reopened; S remained Wholesale 80 / stock 12,
and parent stock remained 7. SQLite service acceptance independently proved persisted tier
edits and tenant isolation. Test windows/server were stopped after acceptance; no shop data
or release assets were modified. Restricted Windows temp-file rename failures were rerun with
normal file access; the complete suite then passed without changing trial-access source.


### Settings: one explicit Save Changes action

All preferences and feature switches in Settings are drafts. Only the header Save Changes action
persists and applies them. No section may introduce its own Save button or write settings from
an input/checkbox handler. This includes modules, restaurant setup, printer targets, service charge,
WhatsApp preferences, theme, ledger terminology, dashboard order, sync engine, pairing keys and UAE
seller/provider settings. Password changes, device linking, test print/report, updates and other explicit
operations remain separate actions; they must not silently save edited preferences.

`SettingsManager` owns the main form and feature draft. Visited sections remain mounted but hidden
so their local drafts survive navigation. Nested setup panes and hardware/WhatsApp preferences also
retain their draft state. `SettingsSaveSession` collects dirty sections by unique identity;
`useSettingsSectionSave` registers the latest async callback. The header aggregates all dirty state,
disables editing during save, awaits every section, and reports success only after completion. A failed
section rejects to the header and retains its draft for retry. Writes span existing data APIs and are
not one database transaction: successfully written sections may remain saved when a later section fails.
Do not report rollback or atomicity. No persistence contracts or sync payloads change.

Restaurant setup edits use `useRestaurantSettingsDraft`, retaining stable IDs for additions and saving
only changed rows through `restaurantApi`. Table labels and numeric setup values are checked before
writes; existing server/main-process validation remains authoritative. Theme/terminology/dashboard
changes are applied to their runtime stores only after persistence succeeds.

Regression checks: `settingsSaveSession.ui`, `businessModules.ui`, `cashRegisterSettings.ui`,
`filingOnlySettings.ui`, `uaeArabicPrintSetting.ui`, and `timezoneSettingsSave.ui`. Renderer acceptance:
Vite > `/tests/fixtures/moduleWorkspace.html?settings` uses isolated test shop storage. Check drafts across
sections, exactly one Save Changes button, unsaved discard on reload, saved persistence on reload,
and a failing/retried section. It does not prove installed native hardware behavior.


### UTC and shop display clock (6 November 2026)
All modules use the root application-wide time contract. Pure parsing and wall-clock conversion live in `electron/utils/utc.ts`, re-exported by `src/utils/time/utc.ts`. UI/print formatting uses `storeDate`, `storeTime`, `storeDateTime` (`src/utils/time/dateDisplay.ts`) with the loaded shop timezone and `time_format`; date-only labels remain unchanged. `getStoreBusinessDate` supplies current-day defaults; `storeCalendarDate` / `calendarDateKey` are calendar arithmetic only, never stored timestamps. Main-process reports/cashier/closing convert shop dates to UTC bounds before `julianday` queries; purchase date-only labels use their document date. Settings remain draft until the existing main Save Changes action succeeds. Tests: `timeContract`, `shopDayQueries`, `timeDisplayArchitecture`, `storeTime`, `timezoneSettingsSave.ui`.


### Kitchen hardware placement

Kitchen ticket connection targets, paper width and sample printing belong in Settings > Printers & Devices > Kitchen Printers (`KitchenPrinterSettings`). Food Orders retains shared preparation-area/category routing, item extras/choices and the optional bill service charge. Device-local printer configuration registers with the main Settings save session. Test print is an explicit operation using the selected target. Save newly created kitchen stations before assigning their device printers. No schema, IPC or sync contract changes.


### Operational restaurant management

Tables > Add / Edit Tables owns table management with explicit Save tables. Kitchen > Manage Stations owns preparation-area/category routing. These entity editors are outside Settings, reuse the draft persistence hook and existing restaurant.manage permission/data APIs. The legacy setup event opens Tables. Settings no longer lists restaurant setup. New order items, including extras, come from Inventory with their own product, price and tax identity. Item selection opens quantity/note options without legacy modifier groups; existing order modifiers are preserved. A configured service charge is opt-in per order rather than selected automatically. Printer connections remain in Printers & Devices. No schema or sync contract changes.


Tables navigation now separates Orders & seating from the Tables entity page. `restaurant/views/TablesManager.tsx` owns searchable rows, Add Table/Edit forms and confirmed deletion through restaurantApi. It refreshes saved rows without navigating away. No batch setup form or page-wide Save tables action is used on this page. The main-process occupied-table deletion check remains authoritative. These entity actions are outside Settings; the Settings single-save rule remains unchanged. Regression: tablesManager.ui.test.tsx.


Tables entity list uses the full available content width with responsive page padding. Bulk Add Tables remains available alongside Add Table regardless of row count. `BulkTablesDialog` creates at most 200 numbered tables, skips existing names, and retains successful IDs/names across partial-failure retries. It refreshes the list after attempted writes and reports partial failures; batch creation is not atomic. Tests: tablesManager.ui.test.tsx.


OrderDetailsDialog awaits create/update results, locks duplicate submission and dismissal while saving, and retains entered fields on failure. Parent screens close only on confirmed success and refresh order rows. Customer identity is editable for dine-in as well as takeaway/delivery. Previously assigned staff names survive unavailable staff-directory entries. Billing-claimed orders require reopening before editing. Existing update API and persistence contracts are unchanged. Regression: orderDetailsDialog.ui.test.tsx.

### Toast notification ownership

Use `components/ui/FloatToast` for every transient success, error, warning or informational notification. BillingToasts, ComboStatusToast, RestaurantToast and recycle-bin ToastStack are state adapters only; they render the shared component. Keep concurrent messages stacked, preserve existing timers and recycle-bin actions, and use `duration={0}` when the caller owns expiry or a message must remain visible. Browser alerts and copied toast styling are prohibited. See conventions > Toast notifications.

### Review notes: notification and print ownership

Toast presentation changes are covered by `floatToast.ui` (replacement timers, caller-owned expiry, actions, simultaneous billing outcomes and persistent restaurant errors) and `toastArchitecture` (browser alerts, alternate libraries and copied toast visuals). The FloatToast action uses the shared Button primitive; Ecommerce notification state stays in `useEcommerceState`. UI acceptance exercised Settings > Printers & Devices > Refresh Printers in the isolated module fixture without saving shop preferences. Sales payment collection closes after a confirmed update and reports success through its existing showToast adapter.

Invoice HTML tax-breakup presentation belongs in `utils/print/invoiceHtml/taxBreakup.ts`, reusing `receipt/receiptCore.ts:resolveTaxBreakup`; see the business-rules reference. Hidden print/PDF windows disable background throttling in `electron/hardware/printer.ts` and `electron/whatsapp/whatsappService.ts`. Digital thermal receipt PDF margins are applied in the WhatsApp PDF path, preserving physical printer geometry. Source tests do not replace physical printer or packaged-installer acceptance.

Architecture review validation (6 November 2026): app and Electron typechecks passed; the full two-worker Vitest run passed 194 files / 1,135 tests without unhandled errors; architecture guard passed with zero bridge violations, misplaced SQL and oversized files; lint ratchet passed with zero errors/warnings. The Settings layout test now mocks cloud reads and drains pending updates during cleanup. This evidence covers the current POS source tree; it does not certify other app changes, a shipped installer or physical printer output.

### Billing print latency and payment completion (6 November 2026)

The default online invoice-number allocation deadline in electron/services/invoiceNumberService.ts is 750 ms (previously 3000 ms). Checkout still awaits allocation and uses the existing local allocator on failure; this is a bounded network wait, not a guarantee of total print latency. Explicit caller deadlines (BOS conversion: 1500 ms) remain authoritative. Regression: uaeNumbering.characterization.test.ts exercises an actual abort and confirms sequential local fallback numbers; thermalPrint.test.ts covers readiness and single-job printing.

Sales History payment collection closes its dialog immediately after confirmed persistence and reports success through the existing shared toast adapter. Do not add a presentation-only delay before the next action. Existing list refresh and cashier notification remain in place. No numbering payload, database schema, permission or sync contract changed. Physical printer and live WhatsApp timing still require runtime acceptance.
