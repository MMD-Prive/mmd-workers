export type LineSessionCardInput = {
  line_user_id: string;
  session_id: string;
  client_name: string;
  amount_thb: number;
  deposit_amount_thb: number;
  expire_at: string;
  points_balance: number;
  dashboard_url: string;
  payment_url: string;
  next_booking_url?: string;
};

export type LineFlexMessage = {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
};

function formatThb(value: number): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)} THB`;
}

function formatPoints(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatExpireAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function row(label: string, value: string): Record<string, unknown> {
  return {
    type: "box",
    layout: "baseline",
    spacing: "sm",
    contents: [
      {
        type: "text",
        text: label,
        color: "#8A7A6B",
        size: "sm",
        flex: 4,
      },
      {
        type: "text",
        text: value,
        color: "#2B2520",
        size: "sm",
        wrap: true,
        flex: 6,
      },
    ],
  };
}

function uriButton(label: string, uri: string, style: "primary" | "secondary" = "secondary"): Record<string, unknown> {
  return {
    type: "button",
    style,
    height: "sm",
    action: {
      type: "uri",
      label,
      uri,
    },
  };
}

export function buildLineSessionFlexMessage(input: LineSessionCardInput): LineFlexMessage {
  return {
    type: "flex",
    altText: `MMD session ${input.session_id} for ${input.client_name}`,
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "MMD Session",
            weight: "bold",
            size: "xl",
            color: "#2B2520",
          },
          {
            type: "text",
            text: input.client_name,
            size: "sm",
            color: "#8A7A6B",
            wrap: true,
          },
          {
            type: "separator",
            margin: "md",
          },
          {
            type: "box",
            layout: "vertical",
            margin: "md",
            spacing: "sm",
            contents: [
              row("Session", input.session_id),
              row("Total", formatThb(input.amount_thb)),
              row("Deposit", formatThb(input.deposit_amount_thb)),
              row("Expires", formatExpireAt(input.expire_at)),
              row("Points", formatPoints(input.points_balance)),
            ],
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          uriButton("ดู Dashboard", input.dashboard_url, "primary"),
          uriButton("ชำระเงิน / ส่งสลิป", input.payment_url),
          uriButton("จองครั้งถัดไป", input.next_booking_url || "https://mmdbkk.com"),
        ],
      },
      styles: {
        body: {
          backgroundColor: "#F8F4EF",
        },
        footer: {
          backgroundColor: "#F8F4EF",
        },
      },
    },
  };
}
