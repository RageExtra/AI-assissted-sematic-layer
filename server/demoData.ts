import { getDb } from "./db";

const demoCustomers = [
  { customerId: 1, customerName: "Acme Retail", region: "North America" },
  { customerId: 2, customerName: "Northstar Goods", region: "EMEA" },
  { customerId: 3, customerName: "Crescent & Co.", region: "APAC" },
  { customerId: 4, customerName: "Verde Market", region: "LATAM" },
  { customerId: 5, customerName: "Harbor House", region: "North America" },
  { customerId: 6, customerName: "Atlas Supply", region: "EMEA" },
];

const demoOrders = [
  { orderId: 101, customerId: 1, amount: "52000.00", orderStatus: "completed", orderDate: "2026-02-05" },
  { orderId: 102, customerId: 2, amount: "46000.00", orderStatus: "completed", orderDate: "2026-02-12" },
  { orderId: 103, customerId: 3, amount: "33000.00", orderStatus: "completed", orderDate: "2026-02-19" },
  { orderId: 104, customerId: 4, amount: "24000.00", orderStatus: "completed", orderDate: "2026-02-23" },
  { orderId: 105, customerId: 1, amount: "58000.00", orderStatus: "completed", orderDate: "2026-03-04" },
  { orderId: 106, customerId: 5, amount: "26000.00", orderStatus: "completed", orderDate: "2026-03-10" },
  { orderId: 107, customerId: 2, amount: "51000.00", orderStatus: "completed", orderDate: "2026-03-18" },
  { orderId: 108, customerId: 6, amount: "29000.00", orderStatus: "completed", orderDate: "2026-03-27" },
  { orderId: 109, customerId: 3, amount: "39000.00", orderStatus: "completed", orderDate: "2026-04-06" },
  { orderId: 110, customerId: 4, amount: "27000.00", orderStatus: "completed", orderDate: "2026-04-16" },
  { orderId: 111, customerId: 1, amount: "64000.00", orderStatus: "completed", orderDate: "2026-05-05" },
  { orderId: 112, customerId: 2, amount: "48000.00", orderStatus: "completed", orderDate: "2026-05-12" },
  { orderId: 113, customerId: 3, amount: "36000.00", orderStatus: "completed", orderDate: "2026-05-20" },
  { orderId: 114, customerId: 5, amount: "31000.00", orderStatus: "completed", orderDate: "2026-05-29" },
  { orderId: 115, customerId: 4, amount: "21000.00", orderStatus: "completed", orderDate: "2026-06-04" },
  { orderId: 116, customerId: 1, amount: "71000.00", orderStatus: "completed", orderDate: "2026-06-11" },
  { orderId: 117, customerId: 6, amount: "44000.00", orderStatus: "completed", orderDate: "2026-06-18" },
  { orderId: 118, customerId: 3, amount: "41000.00", orderStatus: "completed", orderDate: "2026-06-26" },
  { orderId: 119, customerId: 2, amount: "55000.00", orderStatus: "completed", orderDate: "2026-07-03" },
  { orderId: 120, customerId: 5, amount: "35000.00", orderStatus: "completed", orderDate: "2026-07-09" },
  { orderId: 121, customerId: 1, amount: "68000.00", orderStatus: "completed", orderDate: "2026-07-15" },
  { orderId: 122, customerId: 3, amount: "47000.00", orderStatus: "completed", orderDate: "2026-07-22" },
  { orderId: 123, customerId: 4, amount: "28000.00", orderStatus: "completed", orderDate: "2026-07-27" },
  { orderId: 124, customerId: 1, amount: "12000.00", orderStatus: "pending", orderDate: "2026-07-29" },
  { orderId: 125, customerId: 2, amount: "8500.00", orderStatus: "refunded", orderDate: "2026-07-30" },
];

export async function ensureDemoCommerceData() {
  const db = await getDb();
  if (!db) return false;
  
  const existing = await db.collection("customers").countDocuments();
  if (existing > 0) return true;
  
  await db.collection("customers").insertMany(demoCustomers);
  await db.collection("orders").insertMany(demoOrders);
  return true;
}
