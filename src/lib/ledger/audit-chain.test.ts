import { describe, expect, it } from "vitest";
import { entryHash, GENESIS, sealAudit, verifyChain } from "./audit-chain";
import type { AuditEntry } from "./types";

const KEY = Buffer.from("a".repeat(32));
const OTHER = Buffer.from("b".repeat(32));
const e = (i: number, over: Partial<AuditEntry> = {}): AuditEntry => ({ at: new Date(1_800_000_000_000 + i * 1000).toISOString(), type: "decision", detail: `entry ${i}`, ...over });
const sealed = (n: number, key = KEY) => {
  const list = Array.from({ length: n }, (_, i) => e(i));
  sealAudit(list, key);
  return list;
};

describe("sealing the audit log", () => {
  it("links each new entry to the one before it, starting from GENESIS", () => {
    const list = sealed(3);
    expect(list[0].prevHash).toBe(GENESIS);
    expect(list[1].prevHash).toBe(list[0].hash);
    expect(list[2].prevHash).toBe(list[1].hash);
    expect(list.every((x) => /^[0-9a-f]{64}$/.test(x.hash!))).toBe(true);
  });

  it("only seals entries that have no hash yet, and continues the chain", () => {
    const list = sealed(2);
    const before = structuredClone(list);
    list.push(e(2), e(3));
    sealAudit(list, KEY);
    expect(list.slice(0, 2)).toEqual(before);
    expect(list[2].prevHash).toBe(before[1].hash);
    expect(verifyChain(list, KEY).ok).toBe(true);
  });

  it("is deterministic and depends on the secret", () => {
    expect(sealed(2)[1].hash).toBe(sealed(2)[1].hash);
    expect(sealed(2, OTHER)[1].hash).not.toBe(sealed(2)[1].hash);
  });

  it("the same words at the same moment give different hashes when the history differs", () => {
    const a = [e(0, { detail: "x" }), e(1, { detail: "same" })];
    const b = [e(0, { detail: "y" }), e(1, { detail: "same" })];
    sealAudit(a, KEY);
    sealAudit(b, KEY);
    expect(a[1].hash).not.toBe(b[1].hash);
  });
});

describe("verifying the chain", () => {
  it("accepts an untouched chain, and an empty one", () => {
    expect(verifyChain(sealed(5), KEY)).toEqual({ ok: true, checked: 5, unprotected: 0 });
    expect(verifyChain([], KEY)).toEqual({ ok: true, checked: 0, unprotected: 0 });
  });

  it.each([
    ["editing the words", (l: AuditEntry[]) => void (l[2].detail = "edited")],
    ["editing the time", (l: AuditEntry[]) => void (l[2].at = new Date(1_800_000_999_000).toISOString())],
    ["editing the type", (l: AuditEntry[]) => void (l[2].type = "paid")],
    ["deleting an entry from the middle", (l: AuditEntry[]) => void l.splice(2, 1)],
    ["swapping two entries", (l: AuditEntry[]) => void ([l[1], l[2]] = [l[2], l[1]])],
    ["inserting a made-up entry", (l: AuditEntry[]) => void l.splice(2, 0, { ...e(99), prevHash: l[1].hash, hash: "0".repeat(64) })],
    ["deleting the first entry", (l: AuditEntry[]) => void l.shift()],
    ["blanking a hash", (l: AuditEntry[]) => void delete l[3].hash],
  ])("detects %s", (_n, tamper) => {
    const list = sealed(5);
    tamper(list);
    expect(verifyChain(list, KEY).ok).toBe(false);
  });

  it("detects editing an entry AND recomputing its hash without the secret", () => {
    const list = sealed(4);
    list[1].detail = "edited";
    list[1].hash = entryHash(list[1].prevHash!, list[1], OTHER); // an attacker who does not have the secret
    expect(verifyChain(list, KEY).ok).toBe(false);
  });

  it("detects truncating the END only if told how many entries to expect", () => {
    const list = sealed(5);
    expect(verifyChain(list.slice(0, 3), KEY, { expectedLastHash: list[4].hash }).ok).toBe(false);
    expect(verifyChain(list, KEY, { expectedLastHash: list[4].hash }).ok).toBe(true);
  });

  it("tells you which entry is wrong", () => {
    const list = sealed(5);
    list[3].detail = "edited";
    const r = verifyChain(list, KEY);
    expect(r).toMatchObject({ ok: false, badIndex: 3 });
  });

  it("entries written before the chain existed are counted as unprotected, not as tampering", () => {
    const list = [e(0), e(1)];
    sealAudit(list, KEY);
    const old = [e(-2), e(-1)];
    const all = [...old, ...list];
    // Pretend the first two were written before sealing existed (no hash): sealAudit has to leave them alone.
    const r = verifyChain(all, KEY, { allowLegacyPrefix: true });
    expect(r).toMatchObject({ ok: true, unprotected: 2, checked: 2 });
  });

  it("an unhashed entry AFTER a hashed one is tampering", () => {
    const list = sealed(3);
    list.push(e(7));
    expect(verifyChain(list, KEY, { allowLegacyPrefix: true }).ok).toBe(false);
  });
});
