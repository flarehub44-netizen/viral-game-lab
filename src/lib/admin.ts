/**
 * Helper do painel admin (Edge Function `admin-action`).
 * @see invokeAdminAction em `./adminAction.ts`
 */
import { invokeAdminAction, type AdminRequestBody } from "./adminAction";

export type AdminAction = AdminRequestBody;

export async function callAdminAction<T = unknown>(body: AdminAction): Promise<T> {
  return invokeAdminAction<T>(body);
}
