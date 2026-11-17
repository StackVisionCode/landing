import { describe, expect, it } from 'vitest';
import { captureReferralLink, readReferralLink } from './referral-link';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => void data.delete(key),
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

const SHARE = '29df4c9e-a17c-4a91-9af8-08c9dec6d5b8';

describe('referral link', () => {
  it('keeps the link from the first page so the signup can use it later', () => {
    const storage = memoryStorage();

    captureReferralLink(`?referral=TVR-EHNF0XF59R&ch=copy&sid=${SHARE}`, storage);

    expect(readReferralLink(storage)).toEqual({ code: 'TVR-EHNF0XF59R', channel: 'copy', shareId: SHARE });
  });

  it('ignores a referral code edited into an impossible shape', () => {
    const storage = memoryStorage();

    captureReferralLink('?referral=%3Cscript%3Ealert(1)%3C%2Fscript%3E', storage);

    expect(readReferralLink(storage)).toBeNull();
  });

  it('drops an edited channel or share but keeps a valid code', () => {
    const storage = memoryStorage();

    captureReferralLink('?referral=TVR-EHNF0XF59R&ch=Copy!!&sid=not-a-guid', storage);

    expect(readReferralLink(storage)).toEqual({ code: 'TVR-EHNF0XF59R', channel: undefined, shareId: undefined });
  });

  it('does not trust a tampered stored value', () => {
    const storage = memoryStorage();
    storage.setItem('taxoffix.referral-link', JSON.stringify({ code: 'bad code', channel: 'copy' }));

    expect(readReferralLink(storage)).toBeNull();
  });

  it('works without storage (prerender or blocked storage)', () => {
    expect(() => captureReferralLink('?referral=TVR-EHNF0XF59R', null)).not.toThrow();
    expect(readReferralLink(null)).toBeNull();
  });
});
