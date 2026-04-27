import { getBatchLifecycleFlags } from "./backend/services/batchLifecycleService.js";
const batch = {
  status: "Active",
  quantity: 1,
  currentQuantity: 1,
  expiryDate: "2020-01-01" // expired
};
console.log(getBatchLifecycleFlags(batch));
