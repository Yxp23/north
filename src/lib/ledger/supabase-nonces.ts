// The database side of "an approval can be spent once": a table with the nonce as its primary key. Two servers, a
// restart or a replay can't spend the same approval twice.
import "server-only";
import type { NonceStore } from "../guardian/nonces";
import type { RpcClient } from "./supabase-ledger";

export class SupabaseNonceStore implements NonceStore {
  constructor(private readonly client: RpcClient) {}

  async consume(nonce: string, userId: string, expiresAtMs: number): Promise<boolean> {
    const { data, error } = await this.client.rpc("consume_approval_nonce", {
      p_nonce: nonce,
      p_user_id: userId,
      p_expires_at: new Date(expiresAtMs).toISOString(),
    });
    if (error) throw new Error(`Supabase consume_approval_nonce failed: ${error.message}`); // the caller fails closed
    return data === true;
  }

  async isSpent(nonce: string): Promise<boolean> {
    const { data, error } = await this.client.rpc("approval_nonce_spent", { p_nonce: nonce });
    if (error) throw new Error(`Supabase approval_nonce_spent failed: ${error.message}`);
    return data === true;
  }
}
