// The two things guarded checkout needs besides a ledger: whose money it is, and a key to sign the Guardian's approvals.
export const TEST_IDENTITY = { userId: "user-1", signer: { key: Buffer.from("k".repeat(32)), now: () => Date.now() } };
