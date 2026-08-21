export async function handleShopMovements(request, env) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  if (method === "OPTIONS" && url.pathname === "/shop/api/movements") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (method === "GET" && url.pathname === "/shop/api/movements") {
    return listMovements(env);
  }

  return null;
}

async function listMovements(env) {
  const tableId = env.HIMAI_STOCK_MOVEMENTS_TABLE_ID || "tbl2GMPrDr6sBW997";
  const fields = [
    "Movement Name",
    "Batch",
    "Product",
    "Supplier",
    "Movement Type",
    "Quantity",
    "Unit Cost THB",
    "Movement Date",
    "Reference Type",
    "Reference ID",
    "Note"
  ];

  const params = new URLSearchParams();
  params.set("pageSize", "100");
  params.append("sort[0][field]", "Movement Date");
  params.append("sort[0][direction]", "desc");
  for (const field of fields) params.append("fields[]", field);

  const result = await airtableRequest(env, `${tableId}?${params.toString()}`);
  const movements = (result.records || []).map((record) => ({
    id: record.id,
    movement_name: record.fields?.["Movement Name"] || "",
    movement_type: selectName(record.fields?.["Movement Type"]),
    quantity: numberOrNull(record.fields?.["Quantity"]),
    unit_cost_thb: numberOrNull(record.fields?.["Unit Cost THB"]),
    product_name: linkedName(record.fields?.["Product"]),
    product_id: linkedId(record.fields?.["Product"]),
    batch_name: linkedName(record.fields?.["Batch"]),
    batch_id: linkedId(record.fields?.["Batch"]),
    supplier_name: linkedName(record.fields?.["Supplier"]),
    supplier_id: linkedId(record.fields?.["Supplier"]),
    movement_date: record.fields?.["Movement Date"] || "",
    reference_type: selectName(record.fields?.["Reference Type"]),
    reference_id: record.fields?.["Reference ID"] || "",
    note: record.fields?.["Note"] || ""
  }));

  return json({
    ok: true,
    shop: "shop",
    table: "Himai Stock Movements",
    movements
  });
}

function linkedName(value) {
  if (!Array.isArray(value) || value.length === 0) return "";
  const first = value[0];
  if (typeof first === "string") return "";
  return first?.name || "";
}

function linkedId(value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const first = value[0];
  return typeof first === "string" ? first : first?.id || null;
}

function selectName(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value?.name || "";
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function airtableRequest(env, path) {
  const response = await fetch(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${path}`, {
    headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` }
  });
  if (!response.ok) {
    throw new Error(`Airtable error: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders()
    }
  });
}
