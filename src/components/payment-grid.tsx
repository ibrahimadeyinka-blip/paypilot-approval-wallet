import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, GridApi } from "ag-grid-community";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { money } from "@/lib/ledger";
import { statusMeta } from "@/lib/agent/status";

export interface PaymentGridRow {
  id: string;
  created_at: string;
  vendor_name: string;
  merchant_handle: string;
  amount_cents: number;
  currency: string;
  description: string;
  status: string;
}

export default function PaymentGrid({ rows, onOpen, onVisibleIds }: {
  rows: PaymentGridRow[];
  onOpen: (id: string) => void;
  onVisibleIds: (ids: string[]) => void;
}) {
  const columns = useMemo<ColDef<PaymentGridRow>[]>(() => [
    { field: "created_at", headerName: "Created", width: 180, filter: "agTextColumnFilter", valueFormatter: p => new Date(p.value).toLocaleString() },
    { field: "vendor_name", headerName: "Merchant", minWidth: 190, flex: 1, filter: "agTextColumnFilter" },
    { field: "amount_cents", headerName: "Amount", width: 140, filter: "agNumberColumnFilter", cellClass: "font-mono", valueFormatter: p => money(p.value, p.data?.currency) },
    { field: "status", headerName: "Status", width: 190, filter: "agTextColumnFilter", filterValueGetter: p => statusMeta(p.data?.status ?? "").label, cellRenderer: (p: { data?: PaymentGridRow }) => p.data ? <Badge variant={statusMeta(p.data.status).tone}>{statusMeta(p.data.status).label}</Badge> : null },
    { field: "description", headerName: "Description", minWidth: 220, flex: 1, filter: "agTextColumnFilter" },
    { colId: "details", headerName: "", width: 64, sortable: false, filter: false, resizable: false, cellRenderer: (p: { data?: PaymentGridRow }) => p.data ? <Button variant="ghost" size="icon" aria-label={`View ${p.data.vendor_name} history`} onClick={() => { if (p.data) onOpen(p.data.id); }}><ChevronRight className="size-4" /></Button> : null },
  ], [onOpen]);
  const sync = (api: GridApi<PaymentGridRow>) => {
    const ids: string[] = [];
    api.forEachNodeAfterFilterAndSort(node => { if (node.data) ids.push(node.data.id); });
    onVisibleIds(ids);
  };
  return <div className="ag-theme-quartz payrail-grid payment-grid" aria-label="Payment records">
    <AgGridReact<PaymentGridRow> rowData={rows} columnDefs={columns} defaultColDef={{ sortable: true, resizable: true, floatingFilter: true }} getRowId={p => p.data.id} rowHeight={54} pagination paginationPageSize={20} paginationPageSizeSelector={[20, 50, 100]} onFilterChanged={e => sync(e.api)} onSortChanged={e => sync(e.api)} onRowDataUpdated={e => sync(e.api)} onFirstDataRendered={e => sync(e.api)} onRowDoubleClicked={e => { if (e.data) onOpen(e.data.id); }} suppressCellFocus={false} />
  </div>;
}

export interface AuditGridRow {
  id: string;
  created_at: string;
  actor: string;
  title: string;
  detail: string | null;
  metadata: unknown;
}

export function AuditGrid({ rows }: { rows: AuditGridRow[] }) {
  const columns = useMemo<ColDef<AuditGridRow>[]>(() => [
    { field: "created_at", headerName: "Timestamp", width: 190, valueFormatter: p => new Date(p.value).toLocaleString() },
    { field: "title", headerName: "Event", minWidth: 170, flex: 1 },
    { field: "actor", headerName: "Actor", width: 110 },
    { field: "detail", headerName: "Detail", minWidth: 240, flex: 2, wrapText: true, autoHeight: true },
    { field: "metadata", headerName: "Metadata", minWidth: 190, valueFormatter: p => JSON.stringify(p.value), wrapText: true, autoHeight: true },
  ], []);
  return <div className="ag-theme-quartz payrail-grid audit-grid" aria-label="Payment audit timeline"><AgGridReact<AuditGridRow> rowData={rows} columnDefs={columns} defaultColDef={{ sortable: true, filter: "agTextColumnFilter", resizable: true }} getRowId={p => p.data.id} rowHeight={48} /></div>;
}